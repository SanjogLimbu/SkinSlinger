import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Prisma } from "@/lib/generated/prisma/client"
import { verifyInventoryToken } from "@/lib/inventoryToken"
import { Resend } from "resend"
import { PurchaseNotificationEmail } from "@/app/components/emails/PurchaseNotificationEmail"
import { countInventoryItem, SteamItem } from "@/lib/steam"
import { RARITIES } from "@/lib/rarity"
import {
    buildListings,
    findPriceFormatError,
    findPriceLimitError,
    trustedMarketName,
    ListingRequest,
    PricedItem,
} from "@/lib/listings"

//

const resend = new Resend(process.env.RESEND_API)

const PAGE_SIZE = 30

//

type MatchedSale = { buyerTradeUrl: string, marketName: string, price: number }

//
// GET: browse the market
//

async function assetIdsInFloatRange(
    minFloat: string | null,
    maxFloat: string | null,
): Promise<string[] | null> {
    if (!minFloat && !maxFloat) {
        return null
    }


    const floatValue: { gte?: number, lte?: number } = {}

    if (minFloat) {
        floatValue.gte = parseFloat(minFloat)
    }


    if (maxFloat) {
        floatValue.lte = parseFloat(maxFloat)
    }


    const rows = await prisma.item_float.findMany({
        where: { floatValue },
        select: { assetId: true },
    })

    return rows.map((row) => row.assetId)
}


async function listingFilter(searchParams: URLSearchParams): Promise<Prisma.item_listingWhereInput> {
    const game = searchParams.get("game")
    const search = searchParams.get("search")
    const wear = searchParams.get("wear")
    const minPrice = searchParams.get("minPrice")
    const maxPrice = searchParams.get("maxPrice")
    const type = searchParams.get("type")
    const rarityKey = searchParams.get("rarity")
    const rarity = RARITIES[game ?? ""]?.find((r) => r.key === rarityKey)

    const where: Prisma.item_listingWhereInput = {}

    if (game) {
        where.game = game
    }


    if (type === "skin") {
        where.commodity = false
    }


    if (type === "commodity") {
        where.commodity = true
    }


    if (rarity) {
        where.hexColor = { equals: rarity.hex, mode: "insensitive" }
    }


    // Wear is part of the item name, e.g. "AK-47 | Redline (Field-Tested)".
    const nameFilters: Prisma.item_listingWhereInput[] = []

    if (search) {
        nameFilters.push({ marketName: { contains: search, mode: "insensitive" } })
    }


    if (wear) {
        nameFilters.push({ marketName: { contains: `(${wear})`, mode: "insensitive" } })
    }


    if (nameFilters.length > 0) {
        where.AND = nameFilters
    }


    if (minPrice || maxPrice) {
        const price: { gte?: number, lte?: number } = {}

        if (minPrice) {
            price.gte = parseFloat(minPrice)
        }


        if (maxPrice) {
            price.lte = parseFloat(maxPrice)
        }


        where.price = price
    }


    const minFloat = searchParams.get("minFloat")
    const maxFloat = searchParams.get("maxFloat")
    const floatAssetIds = await assetIdsInFloatRange(minFloat, maxFloat)

    if (floatAssetIds !== null) {
        where.assetId = { in: floatAssetIds }
    }


    return where
}


export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const cursor = searchParams.get("cursor")

        // One row more than a page, to know whether another page follows.
        const rows = await prisma.item_listing.findMany({
            take: PAGE_SIZE + 1,
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            where: await listingFilter(searchParams),
            // Must match the first page in market/[game]/page.tsx, which hands its last id over as the cursor.
            orderBy: [{ price: "desc" }, { id: "asc" }],
        })

        const page = rows.slice(0, PAGE_SIZE)
        const nextCursor = rows.length > PAGE_SIZE ? page[page.length - 1].id : null

        const floatRows = await prisma.item_float.findMany({
            where: { assetId: { in: page.map((listing) => listing.assetId) } },
        })

        const floatByAssetId = new Map(floatRows.map((row) => [row.assetId, row]))
        const listings = []

        for (const listing of page) {
            if (!listing.icon) {
                continue
            }


            const float = floatByAssetId.get(listing.assetId)

            listings.push({
                id: listing.id,
                marketName: listing.marketName,
                price: listing.price,
                icon: listing.icon,
                hexColor: listing.hexColor!,
                game: listing.game ?? "",
                commodity: listing.commodity,
                sellerId: listing.userId,
                floatValue: float?.floatValue ?? null,
                paintSeed: float?.paintSeed ?? null,
                stickers: float?.stickers ?? null,
            })
        }


        return Response.json({ listings, nextCursor })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}

//
// DELETE: remove your own listings
//

export async function DELETE(request: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }


        const { ids } = await request.json()

        if (!Array.isArray(ids) || ids.length === 0) {
            return Response.json({ error: "No ids provided" }, { status: 400 })
        }


        const listings = await prisma.item_listing.findMany({
            where: { id: { in: ids }, userId: session.user.id },
            select: { id: true, marketName: true },
        })

        if (listings.length === 0) {
            return Response.json(null, { status: 200 })
        }


        const idsToDelete = listings.map((listing) => listing.id)

        await prisma.item_listing.deleteMany({ where: { id: { in: idsToDelete } } })

        return Response.json(null, { status: 200 })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}

//
// POST: list items for sale
//

async function matchBuyOrder(
    assetId: string,
    sellerId: string,
    copiesSold: Map<string, number>,
): Promise<MatchedSale | null> {
    const listing = await prisma.item_listing.findUnique({ where: { assetId } })

    if (!listing || listing.userId !== sellerId) {
        return null
    }


    const order = await prisma.buy_order.findFirst({
        where: {
            marketName: listing.marketName,
            price: { gte: listing.price },
            quantity: { gt: 0 },
            userId: { not: sellerId },
            user: { steam_id: { not: null }, steam_trade_url: { not: null } },
        },
        orderBy: [{ price: "desc" }, { createdAt: "asc" }],
        include: {
            user: { select: { steam_id: true, steam_trade_url: true } },
        },
    })

    if (!order || !order.user.steam_id || !order.user.steam_trade_url) {
        return null
    }


    const buyerTradeUrl = order.user.steam_trade_url
    const buyerKey = `${order.userId}:${listing.marketName}`
    let buyerPreCount: number | null = null

    // Counted before the transaction, so a slow Steam call doesn't hold the database connection.
    if (listing.commodity) {
        const count = await countInventoryItem(
            order.user.steam_id,
            listing.game,
            listing.marketName,
            buyerTradeUrl,
        )

        // Copies the buyer already owns must not count as the delivery, so no count means no sale.
        if (count === null) {
            return null
        }


        // Each copy needs its own rise in the count, so one delivery can't settle several purchases.
        buyerPreCount = count + (copiesSold.get(buyerKey) ?? 0)
    }


    const sale = await prisma.$transaction(async (tx) => {
        // Someone may have bought the listing in the meantime.
        const deletedListing = await tx.item_listing.deleteMany({ where: { id: listing.id } })

        if (deletedListing.count === 0) {
            return null
        }


        // Throws rather than returns, so the listing deleted above is restored.
        const consumedOrder = await tx.buy_order.updateMany({
            where: { id: order.id, quantity: { gt: 0 } },
            data: { quantity: { decrement: 1 } },
        })

        if (consumedOrder.count === 0) {
            throw new Error("buy order race")
        }


        await tx.buy_order.deleteMany({ where: { id: order.id, quantity: { lte: 0 } } })

        await tx.purchase.create({
            data: {
                price: listing.price,
                assetId: listing.assetId,
                marketName: listing.marketName,
                game: listing.game,
                icon: listing.icon,
                hexColor: listing.hexColor,
                commodity: listing.commodity,
                buyerTradeUrl,
                buyerPreCount,
                buyerId: order.userId,
                sellerId,
            },
        })

        // The buyer paid their full bid when placing the order.
        const refund = order.price - listing.price

        if (refund > 0.001) {
            await tx.user.update({
                where: { id: order.userId },
                data: { cash: { increment: refund } },
            })
        }


        return {
            buyerTradeUrl,
            marketName: listing.marketName,
            price: listing.price,
        }
    })

    if (sale && listing.commodity) {
        copiesSold.set(buyerKey, (copiesSold.get(buyerKey) ?? 0) + 1)
    }


    return sale
}


async function notifySeller(email: string, sales: MatchedSale[]) {
    const salesByBuyer = new Map<string, { marketName: string, price: number }[]>()

    for (const sale of sales) {
        const buyerSales = salesByBuyer.get(sale.buyerTradeUrl) ?? []

        buyerSales.push({ marketName: sale.marketName, price: sale.price })
        salesByBuyer.set(sale.buyerTradeUrl, buyerSales)
    }


    for (const [buyerTradeUrl, buyerSales] of salesByBuyer) {
        const plural = buyerSales.length > 1 ? "s" : ""

        await resend.emails.send({
            from: "SkinSlinger <onboarding@skinslinger.com>",
            to: [email],
            subject: `New sale — send your item${plural}`,
            react: PurchaseNotificationEmail({
                buyerTradeUrl,
                buyerName: "Buyer",
                items: buyerSales,
            }),
        })
    }
}


export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.email) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }


        const user = await prisma.user.findUnique({ where: { email: session.user.email } })

        if (!user) {
            return Response.json({ error: "User not found" }, { status: 404 })
        }


        const { items, inventoryToken } = await request.json()

        if (!Array.isArray(items) || items.length === 0) {
            return Response.json({ error: "No items provided" }, { status: 400 })
        }


        // The token proves which items were in the seller's inventory when they opened the page.
        const tokenItems = await verifyInventoryToken(inventoryToken, user.id)

        if (!tokenItems) {
            return Response.json(
                { error: "Inventory session expired. Please refresh the page." },
                { status: 401 },
            )
        }


        // Item details come from our own inventory snapshot, so a request can't pass one item off as another.
        const inventory = (user.inventoryCache ?? []) as SteamItem[]
        const ownedItems = new Map(inventory.map((item) => [item.assetId, item]))

        const formatError = findPriceFormatError(items)

        if (formatError) {
            return Response.json({ error: formatError }, { status: 400 })
        }


        const pricedItems: PricedItem[] = []

        for (const item of items as ListingRequest[]) {
            pricedItems.push({
                assetId: item.assetId,
                marketName: trustedMarketName(item, ownedItems),
                price: item.price,
                commodity: item.commodity,
            })
        }


        const limitError = await findPriceLimitError(pricedItems)

        if (limitError) {
            return Response.json({ error: limitError }, { status: 400 })
        }


        const existingListings = await prisma.item_listing.findMany({
            where: { userId: user.id },
            select: { assetId: true },
        })

        // An item that sold but hasn't been delivered is still in the seller's inventory.
        const openSales = await prisma.purchase.findMany({
            where: { sellerId: user.id, status: { in: ["pending", "holding"] } },
            select: { assetId: true },
        })

        const unavailable = new Set([
            ...existingListings.map((listing) => listing.assetId),
            ...openSales.map((sale) => sale.assetId),
        ])

        const newListings = buildListings(items, user.id, tokenItems, ownedItems, unavailable)

        if (newListings.length > 0) {
            await prisma.item_listing.createMany({ data: newListings, skipDuplicates: true })
        }


        const instantSales: MatchedSale[] = []
        const copiesSold = new Map<string, number>()

        for (const listing of newListings) {
            // A failed match just leaves the listing up, so it mustn't fail the whole request.
            const sale = await matchBuyOrder(listing.assetId, user.id, copiesSold).catch(() => null)

            if (sale) {
                instantSales.push(sale)
            }
        }


        if (user.notificationEmail) {
            await notifySeller(user.notificationEmail, instantSales)
        }


        return Response.json(null, { status: 200 })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
