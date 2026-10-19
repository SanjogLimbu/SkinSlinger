import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Resend } from "resend"
import { PurchaseNotificationEmail } from "@/app/components/emails/PurchaseNotificationEmail"
import { checkCanTrade, countInventoryItem } from "@/lib/steam"

//

const resend = new Resend(process.env.RESEND_API)

const GAME_APP_IDS: Record<string, string> = {
    CS2: "730",
    Dota2: "570",
    Rust: "252490",
    TF2: "440",
}

const PRIVATE_INVENTORY = "Your Steam inventory must be set to public before making purchases."

//

type BasketItem = {
    id: string
    marketName: string
    commodity: boolean
    quantity: number
    expectedPrice: number
}

type ListingToPurchase = {
    id: string
    price: number
    sellerId: string
    assetId: string
    marketName: string
    game: string | null
    icon: string | null
    hexColor: string | null
    commodity: boolean
}

type ListingRow = Omit<ListingToPurchase, "sellerId"> & { userId: string }

//

function toPurchase(listing: ListingRow): ListingToPurchase {
    return {
        id: listing.id,
        price: listing.price,
        sellerId: listing.userId,
        assetId: listing.assetId,
        marketName: listing.marketName,
        game: listing.game,
        icon: listing.icon,
        hexColor: listing.hexColor,
        commodity: listing.commodity,
    }
}


export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.email) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }


        const buyer = await prisma.user.findUnique({ where: { email: session.user.email } })

        if (!buyer) {
            return Response.json({ error: "User not found" }, { status: 404 })
        }


        // The seller needs the trade URL to send the item. The basket opens its link prompt on "link your Steam".
        if (!buyer.steam_id || !buyer.steam_trade_url) {
            return Response.json(
                { error: "You must link your Steam account and trade URL before buying." },
                { status: 400 },
            )
        }


        const { allowed, reason } = await checkCanTrade(buyer.steam_id, buyer.steam_trade_url)

        if (!allowed) {
            return Response.json(
                { error: reason ?? "Your Steam account cannot trade at this time." },
                { status: 403 },
            )
        }


        const pendingCount = await prisma.purchase.count({
            where: { buyerId: buyer.id, status: "pending" },
        })

        if (pendingCount > 0) {
            return Response.json(
                { error: "You have an active order. Complete or cancel it before checking out." },
                { status: 409 },
            )
        }


        const { items } = await request.json() as { items: BasketItem[] }

        if (!Array.isArray(items) || items.length === 0) {
            return Response.json({ error: "No items provided" }, { status: 400 })
        }


        const listingsToBuy: ListingToPurchase[] = []

        for (const item of items) {
            if (item.commodity) {
                const listings = await prisma.item_listing.findMany({
                    where: {
                        marketName: item.marketName,
                        userId: { not: buyer.id },
                    },
                    take: item.quantity,
                    orderBy: { price: "asc" },
                })

                if (listings.length < item.quantity) {
                    return Response.json(
                        { error: `Not enough "${item.marketName}" available` },
                        { status: 409 },
                    )
                }


                const resolvedCost = listings.reduce((sum, listing) => sum + listing.price, 0)
                const expectedCost = item.expectedPrice * item.quantity

                if (resolvedCost > expectedCost + 0.01) {
                    return Response.json(
                        { error: `The price for "${item.marketName}" has changed. Please refresh your basket.` },
                        { status: 409 },
                    )
                }


                for (const listing of listings) {
                    listingsToBuy.push(toPurchase(listing))
                }
            }
            else {
                const listing = await prisma.item_listing.findUnique({ where: { id: item.id } })

                if (!listing) {
                    return Response.json(
                        { error: `Listing for "${item.marketName}" no longer exists` },
                        { status: 409 },
                    )
                }


                if (listing.userId === buyer.id) {
                    return Response.json({ error: "You cannot buy your own listing" }, { status: 400 })
                }


                if (listing.price > item.expectedPrice + 0.01) {
                    const newPrice = listing.price.toFixed(2)

                    return Response.json(
                        { error: `The price for "${item.marketName}" has changed to $${newPrice}. Please refresh your basket.` },
                        { status: 409 },
                    )
                }


                listingsToBuy.push(toPurchase(listing))
            }
        }


        // A negative price would turn the cash deduction into a credit.
        const hasBadPrice = listingsToBuy.some((listing) => {
            return !Number.isFinite(listing.price) || listing.price <= 0
        })

        if (hasBadPrice) {
            return Response.json({ error: "One or more items have an invalid price." }, { status: 409 })
        }


        const total = listingsToBuy.reduce((sum, listing) => sum + listing.price, 0)

        // The cron reads the buyer's inventory to confirm delivery, so it must be public.
        const appIds = new Set(listingsToBuy.map((listing) => GAME_APP_IDS[listing.game ?? ""] ?? "730"))

        for (const appId of appIds) {
            const inventoryUrl = `https://steamcommunity.com/inventory/${buyer.steam_id}/${appId}/2?l=english&count=1`
            const response = await fetch(inventoryUrl)

            if (response.status === 403) {
                return Response.json({ error: PRIVATE_INVENTORY }, { status: 400 })
            }


            // Only a clear "private" answer blocks, so a Steam outage doesn't stop every checkout.
            if (response.ok) {
                const data = await response.json()

                if (data?.success === false) {
                    return Response.json({ error: PRIVATE_INVENTORY }, { status: 400 })
                }
            }
        }


        // Copies the buyer already owns must not count as the delivery.
        const nextCounts = new Map<string, number>()
        const preCountByListing = new Map<string, number>()

        for (const listing of listingsToBuy) {
            if (!listing.commodity) {
                continue
            }


            let preCount = nextCounts.get(listing.marketName)

            if (preCount === undefined) {
                const count = await countInventoryItem(
                    buyer.steam_id,
                    listing.game,
                    listing.marketName,
                    buyer.steam_trade_url,
                )

                if (count === null) {
                    return Response.json(
                        { error: "Couldn't reach Steam to check your items. Please try again in a moment." },
                        { status: 503 },
                    )
                }


                preCount = count
            }


            // Each copy needs its own rise in the count, so one delivery can't settle several purchases.
            preCountByListing.set(listing.id, preCount)
            nextCounts.set(listing.marketName, preCount + 1)
        }


        const purchases = await prisma.$transaction(async (tx) => {
            const deducted = await tx.user.updateMany({
                where: { id: buyer.id, cash: { gte: total } },
                data: { cash: { decrement: total } },
            })

            if (deducted.count === 0) {
                throw new Error("Insufficient balance")
            }


            const created = []

            for (const listing of listingsToBuy) {
                const deleted = await tx.item_listing.deleteMany({ where: { id: listing.id } })

                if (deleted.count === 0) {
                    throw new Error("Item no longer available")
                }


                const purchase = await tx.purchase.create({
                    data: {
                        price: listing.price,
                        assetId: listing.assetId,
                        marketName: listing.marketName,
                        game: listing.game,
                        icon: listing.icon,
                        hexColor: listing.hexColor,
                        commodity: listing.commodity,
                        buyerTradeUrl: buyer.steam_trade_url,
                        buyerPreCount: preCountByListing.get(listing.id) ?? null,
                        buyerId: buyer.id,
                        sellerId: listing.sellerId,
                    },
                })

                created.push(purchase)
            }


            return created
        })

        const sellerIds = [...new Set(listingsToBuy.map((listing) => listing.sellerId))]
        const sellers = await prisma.user.findMany({ where: { id: { in: sellerIds } } })

        for (const seller of sellers) {
            if (!seller.notificationEmail) {
                continue
            }


            const sellerPurchases = purchases.filter((purchase) => purchase.sellerId === seller.id)
            const plural = sellerPurchases.length > 1 ? "s" : ""

            const soldItems = sellerPurchases.map((purchase) => ({
                marketName: purchase.marketName,
                price: purchase.price,
            }))

            await resend.emails.send({
                from: "SkinSlinger <onboarding@skinslinger.com>",
                to: [seller.notificationEmail],
                subject: `New sale — send your item${plural}`,
                react: PurchaseNotificationEmail({
                    buyerTradeUrl: buyer.steam_trade_url,
                    buyerName: buyer.name ?? buyer.email ?? "Buyer",
                    items: soldItems,
                }),
            })
        }


        const updated = await prisma.user.findUnique({
            where: { id: buyer.id },
            select: { cash: true },
        })

        return Response.json({ newCash: updated!.cash })
    }
    catch (error) {
        if (error instanceof Error && error.message === "Insufficient balance") {
            return Response.json({ error: "Insufficient balance" }, { status: 402 })
        }


        if (error instanceof Error && error.message === "Item no longer available") {
            return Response.json(
                { error: "One or more items were purchased by someone else. Please refresh." },
                { status: 409 },
            )
        }


        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
