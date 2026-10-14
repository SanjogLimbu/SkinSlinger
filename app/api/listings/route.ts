import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Prisma } from "@/lib/generated/prisma/client"
import { verifyInventoryToken } from "@/lib/inventoryToken"
import { Resend } from "resend"
import { PurchaseNotificationEmail } from "@/app/components/emails/PurchaseNotificationEmail"
import { countInventoryItem, SteamItem } from "@/lib/steam"
import { maxListingPrice, minListingPrice, stickerMarketName, Sticker } from "@/lib/pricing"
import { RARITIES } from "@/lib/rarity"

//

const resend = new Resend(process.env.RESEND_API)

const PAGE_SIZE = 30
const MAX_PRICE = 1_000_000

//

// One item in the body of a "list these items" request
type ListingRequest = { assetId: string, marketName: string, price: number, commodity: boolean, quantity: number }

// An item the signed inventory token says the seller owns
type TokenItem = { assetId: string, marketName: string }

type NewListing = { userId: string, assetId: string, marketName: string, price: number, game: string, icon: string, hexColor: string, commodity: boolean }
type MatchedSale = { buyerTradeUrl: string, marketName: string, price: number }

//
// GET: browse the market
//

// Asset ids whose float is inside the requested range, or null when no range was asked for
async function assetIdsInFloatRange(minFloat: string | null, maxFloat: string | null): Promise<string[] | null> {
    if (!minFloat && !maxFloat) return null

    const floatValue: { gte?: number, lte?: number } = {}

    if (minFloat) floatValue.gte = parseFloat(minFloat)
    if (maxFloat) floatValue.lte = parseFloat(maxFloat)

    const rows = await prisma.item_float.findMany({ where: { floatValue }, select: { assetId: true } })

    return rows.map(row => row.assetId)
}


// Turns the market page's query string into a database filter
async function listingFilter(searchParams: URLSearchParams): Promise<Prisma.item_listingWhereInput> {
    const game = searchParams.get("game")
    const search = searchParams.get("search")
    const wear = searchParams.get("wear")
    const minPrice = searchParams.get("minPrice")
    const maxPrice = searchParams.get("maxPrice")
    const type = searchParams.get("type")
    const rarity = RARITIES[game ?? ""]?.find(r => r.key === searchParams.get("rarity"))

    const where: Prisma.item_listingWhereInput = {}

    if (game) where.game = game
    if (type === "skin") where.commodity = false
    if (type === "commodity") where.commodity = true
    if (rarity) where.hexColor = { equals: rarity.hex, mode: "insensitive" }

    // Wear is part of the item name, e.g. "AK-47 | Redline (Field-Tested)"
    const nameFilters: Prisma.item_listingWhereInput[] = []

    if (search) nameFilters.push({ marketName: { contains: search, mode: "insensitive" } })
    if (wear) nameFilters.push({ marketName: { contains: `(${wear})`, mode: "insensitive" } })
    if (nameFilters.length > 0) where.AND = nameFilters

    if (minPrice || maxPrice) {
        const price: { gte?: number, lte?: number } = {}

        if (minPrice) price.gte = parseFloat(minPrice)
        if (maxPrice) price.lte = parseFloat(maxPrice)

        where.price = price
    }

    const floatAssetIds = await assetIdsInFloatRange(searchParams.get("minFloat"), searchParams.get("maxFloat"))

    if (floatAssetIds !== null) where.assetId = { in: floatAssetIds }

    return where
}


export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const cursor = searchParams.get("cursor")

        // One row more than a page, to know whether another page follows
        const rows = await prisma.item_listing.findMany({
            take: PAGE_SIZE + 1,
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            where: await listingFilter(searchParams),
            // Must match the initial server render in market/[game]/page.tsx — the
            // client feeds the last id of that page in as the cursor here.
            orderBy: [{ price: "desc" }, { id: "asc" }],
        })

        const page = rows.slice(0, PAGE_SIZE)
        const nextCursor = rows.length > PAGE_SIZE ? page[page.length - 1].id : null

        const floatRows = await prisma.item_float.findMany({ where: { assetId: { in: page.map(listing => listing.assetId) } } })
        const floatByAssetId = new Map(floatRows.map(row => [row.assetId, row]))

        const listings = page
            .filter(listing => listing.icon)
            .map(listing => {
                const float = floatByAssetId.get(listing.assetId)

                return {
                    id: listing.id,
                    marketName: listing.marketName,
                    price: listing.price,
                    icon: listing.icon!,
                    hexColor: listing.hexColor!,
                    game: listing.game ?? '',
                    commodity: listing.commodity,
                    sellerId: listing.userId,
                    floatValue: float?.floatValue ?? null,
                    paintSeed: float?.paintSeed ?? null,
                    stickers: float?.stickers ?? null,
                }
            })

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

        const idsToDelete = listings.map(l => l.id)

        await prisma.item_listing.deleteMany({ where: { id: { in: idsToDelete } } })

        return Response.json(null, { status: 200 })
    } catch (error) {
        console.error(error)
        return Response.json({ error: "Server error" }, { status: 500 })
    }
}

//
// POST: list items for sale
//

// The first badly formed price, as an error message; null when they are all fine.
// A negative price would flip checkout's cash deduction into a credit, minting money for
// the buyer. Prices must also be whole cents, at least $0.01.
function findPriceFormatError(items: ListingRequest[]): string | null {
    for (const item of items) {
        if (typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0.01 || item.price > MAX_PRICE) {
            return "Invalid price"
        }

        if (Math.abs(item.price * 100 - Math.round(item.price * 100)) > 1e-6) {
            return "Prices can't have more than two decimal places."
        }
    }

    return null
}


// A stack is identified by its name. A unique item's name comes from our own snapshot of the
// seller's inventory, so the request can't claim to be a different item.
function trustedMarketName(item: ListingRequest, ownedItems: Map<string, SteamItem>): string {
    if (item.commodity) return item.marketName

    return ownedItems.get(item.assetId)?.market_name ?? ""
}


// The first price outside the allowed range around its item's market value, as an error
// message; null when they are all in range.
async function findPriceLimitError(items: ListingRequest[], ownedItems: Map<string, SteamItem>): Promise<string | null> {
    // Stickers add to a skin's value, so load them for the items being listed
    const floatRows = await prisma.item_float.findMany({
        where: { assetId: { in: items.map(item => item.assetId) } },
        select: { assetId: true, stickers: true },
    })
    const stickersByAssetId = new Map<string, Sticker[]>()

    for (const row of floatRows) {
        stickersByAssetId.set(row.assetId, (row.stickers ?? []) as Sticker[])
    }

    // Market prices for the items and for every sticker on them
    const itemNames = items.map(item => trustedMarketName(item, ownedItems))
    const stickerNames = [...stickersByAssetId.values()].flat().map(sticker => stickerMarketName(sticker.name))
    const priceRows = await prisma.item.findMany({
        where: { marketName: { in: [...itemNames, ...stickerNames] } },
        select: { marketName: true, price: true },
    })
    const marketPrices = new Map(priceRows.map(row => [row.marketName, row.price]))
    const priceOf = (marketName: string) => marketPrices.get(marketName) ?? 0

    for (const item of items) {
        const name = trustedMarketName(item, ownedItems)
        const marketPrice = priceOf(name)
        const stickers = item.commodity ? null : stickersByAssetId.get(item.assetId)

        const maxPrice = maxListingPrice(marketPrice, stickers, priceOf)

        if (maxPrice !== null && item.price > maxPrice) {
            return `${name} can't be listed above $${maxPrice.toFixed(2)}.`
        }

        const minPrice = minListingPrice(marketPrice)

        if (minPrice !== null && item.price < minPrice) {
            return `${name} can't be listed below $${minPrice.toFixed(2)}.`
        }
    }

    return null
}


// The seller's assets to list for one request item. An asset qualifies when it is in the
// signed token, still in our inventory snapshot, and not already listed. A stack takes up
// to `quantity` qualifying assets with its name; a unique item takes only itself.
function assetIdsToList(item: ListingRequest, tokenItems: TokenItem[], ownedItems: Map<string, SteamItem>, alreadyListed: Set<string>): string[] {
    const qualifying = tokenItems.filter(tokenItem => ownedItems.has(tokenItem.assetId) && !alreadyListed.has(tokenItem.assetId))

    if (!item.commodity) {
        return qualifying.filter(tokenItem => tokenItem.assetId === item.assetId).map(tokenItem => tokenItem.assetId)
    }

    return qualifying
        .filter(tokenItem => tokenItem.marketName === item.marketName)
        .slice(0, Math.max(0, item.quantity))
        .map(tokenItem => tokenItem.assetId)
}


// Turns the request into listing rows. Only the price comes from the request; every other
// detail is read from our inventory snapshot.
function buildListings(items: ListingRequest[], userId: string, tokenItems: TokenItem[], ownedItems: Map<string, SteamItem>, alreadyListed: Set<string>): NewListing[] {
    const listings: NewListing[] = []
    const listed = new Set(alreadyListed)

    for (const item of items) {
        for (const assetId of assetIdsToList(item, tokenItems, ownedItems, listed)) {
            const owned = ownedItems.get(assetId)!

            listings.push({
                userId,
                assetId,
                marketName: owned.market_name,
                price: item.price,
                game: owned.game,
                icon: owned.icon,
                hexColor: owned.hexColor,
                commodity: owned.commodity,
            })
            listed.add(assetId)
        }
    }

    return listings
}


// Sells a freshly listed item to the best standing buy order, if one covers its price.
// The best bid is the highest price, then the oldest, from a buyer who can receive trades.
// The trade clears at the listed price and the buyer is refunded the difference.
// Returns null when nothing matched.
async function matchBuyOrder(assetId: string, sellerId: string): Promise<MatchedSale | null> {
    return prisma.$transaction(async (tx) => {
        const listing = await tx.item_listing.findUnique({ where: { assetId } })

        if (!listing || listing.userId !== sellerId) return null

        const order = await tx.buy_order.findFirst({
            where: {
                marketName: listing.marketName,
                price: { gte: listing.price },
                quantity: { gt: 0 },
                userId: { not: sellerId },
                user: { steam_id: { not: null }, steam_trade_url: { not: null } },
            },
            orderBy: [{ price: "desc" }, { createdAt: "asc" }],
            include: { user: { select: { steam_id: true, steam_trade_url: true } } },
        })

        if (!order) return null

        // Consume the listing; bail (rolls back) if it was bought concurrently.
        const deletedListing = await tx.item_listing.deleteMany({ where: { id: listing.id } })

        if (deletedListing.count === 0) return null

        // Consume one unit of the buy order; if it raced to zero, roll the whole match back.
        const consumedOrder = await tx.buy_order.updateMany({
            where: { id: order.id, quantity: { gt: 0 } },
            data: { quantity: { decrement: 1 } },
        })

        if (consumedOrder.count === 0) throw new Error("buy order race")

        await tx.buy_order.deleteMany({ where: { id: order.id, quantity: { lte: 0 } } })

        // Snapshot how many of this commodity the buyer already holds, so the cron can
        // prove delivery by a count increase rather than mere presence (see verifyBuyerHasItem).
        const buyerPreCount = listing.commodity && order.user.steam_id
            ? await countInventoryItem(order.user.steam_id, listing.game, listing.marketName)
            : null

        await tx.purchase.create({
            data: {
                price: listing.price,
                assetId: listing.assetId,
                marketName: listing.marketName,
                game: listing.game,
                icon: listing.icon,
                hexColor: listing.hexColor,
                commodity: listing.commodity,
                buyerTradeUrl: order.user.steam_trade_url,
                buyerPreCount,
                buyerId: order.userId,
                sellerId,
            },
        })

        // The buyer held their bid; the trade clears at the listed (lower-or-equal) price.
        const refund = order.price - listing.price

        if (refund > 0.001) {
            await tx.user.update({ where: { id: order.userId }, data: { cash: { increment: refund } } })
        }

        return { buyerTradeUrl: order.user.steam_trade_url!, marketName: listing.marketName, price: listing.price }
    }).catch(() => null)
}


// Emails the seller to send their instantly-sold items, one email per buyer
async function notifySeller(email: string, sales: MatchedSale[]) {
    const salesByBuyer = new Map<string, { marketName: string, price: number }[]>()

    for (const sale of sales) {
        const buyerSales = salesByBuyer.get(sale.buyerTradeUrl) ?? []

        buyerSales.push({ marketName: sale.marketName, price: sale.price })
        salesByBuyer.set(sale.buyerTradeUrl, buyerSales)
    }

    for (const [buyerTradeUrl, buyerSales] of salesByBuyer) {
        await resend.emails.send({
            from: "SkinSlinger <onboarding@skinslinger.com>",
            to: [email],
            subject: `New sale — send your item${buyerSales.length > 1 ? "s" : ""}`,
            react: PurchaseNotificationEmail({ buyerTradeUrl, buyerName: "Buyer", items: buyerSales }),
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

        // The token proves which items were in the seller's inventory when they opened the page
        const tokenItems = await verifyInventoryToken(inventoryToken, user.id)

        if (!tokenItems) {
            return Response.json({ error: "Inventory session expired. Please refresh the page." }, { status: 401 })
        }

        // Item details come from our own snapshot of the seller's inventory, never from the
        // request, so an item can't be listed under another item's name, icon or game.
        const ownedItems = new Map(((user.inventoryCache ?? []) as SteamItem[]).map(item => [item.assetId, item]))

        const formatError = findPriceFormatError(items)

        if (formatError) {
            return Response.json({ error: formatError }, { status: 400 })
        }

        const limitError = await findPriceLimitError(items, ownedItems)

        if (limitError) {
            return Response.json({ error: limitError }, { status: 400 })
        }

        const existingListings = await prisma.item_listing.findMany({ where: { userId: user.id }, select: { assetId: true } })
        const alreadyListed = new Set(existingListings.map(listing => listing.assetId))
        const newListings = buildListings(items, user.id, tokenItems, ownedItems, alreadyListed)

        if (newListings.length > 0) {
            await prisma.item_listing.createMany({ data: newListings, skipDuplicates: true })
        }

        // A new listing that meets a standing buy order sells straight away
        const instantSales: MatchedSale[] = []

        for (const listing of newListings) {
            const sale = await matchBuyOrder(listing.assetId, user.id)

            if (sale) instantSales.push(sale)
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
