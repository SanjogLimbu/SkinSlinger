import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Resend } from "resend"
import { PurchaseNotificationEmail } from "@/app/components/emails/PurchaseNotificationEmail"
import { checkCanTrade, countInventoryItem } from "@/lib/steam"

//

const resend = new Resend(process.env.RESEND_API)

//

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

        if (buyer.steam_id) {
            const { allowed, reason } = await checkCanTrade(buyer.steam_id, buyer.steam_trade_url)
            if (!allowed) {
                return Response.json({ error: reason ?? "Your Steam account cannot trade at this time." }, { status: 403 })
            }
        }

        const pendingCount = await prisma.purchase.count({
            where: { buyerId: buyer.id, status: "pending" },
        })
        if (pendingCount > 0) {
            return Response.json({ error: "You have an active order. Complete or cancel it before checking out." }, { status: 409 })
        }

        const { items } = await request.json() as {
            items: { id: string, marketName: string, commodity: boolean, quantity: number, expectedPrice: number }[]
        }

        if (!Array.isArray(items) || items.length === 0) {
            return Response.json({ error: "No items provided" }, { status: 400 })
        }

        // Resolve which listings to purchase
        type ListingToPurchase = {
            id: string,
            price: number,
            sellerId: string,
            assetId: string,
            marketName: string,
            game: string | null,
            icon: string | null,
            hexColor: string | null,
            commodity: boolean,
        }

        const toPurchase: ListingToPurchase[] = []

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
                    return Response.json({ error: `Not enough "${item.marketName}" available` }, { status: 409 })
                }

                const resolvedCost = listings.reduce((sum, l) => sum + l.price, 0)
                const expectedCost = item.expectedPrice * item.quantity
                if (resolvedCost > expectedCost + 0.01) {
                    return Response.json({ error: `The price for "${item.marketName}" has changed. Please refresh your basket.` }, { status: 409 })
                }

                for (const listing of listings) {
                    toPurchase.push({ id: listing.id, price: listing.price, sellerId: listing.userId, assetId: listing.assetId, marketName: listing.marketName, game: listing.game, icon: listing.icon, hexColor: listing.hexColor, commodity: listing.commodity })
                }
            }
            else {
                const listing = await prisma.item_listing.findUnique({ where: { id: item.id } })

                if (!listing) {
                    return Response.json({ error: `Listing for "${item.marketName}" no longer exists` }, { status: 409 })
                }

                if (listing.userId === buyer.id) {
                    return Response.json({ error: "You cannot buy your own listing" }, { status: 400 })
                }

                if (listing.price > item.expectedPrice + 0.01) {
                    return Response.json({ error: `The price for "${item.marketName}" has changed to $${listing.price.toFixed(2)}. Please refresh your basket.` }, { status: 409 })
                }

                toPurchase.push({ id: listing.id, price: listing.price, sellerId: listing.userId, assetId: listing.assetId, marketName: listing.marketName, game: listing.game, icon: listing.icon, hexColor: listing.hexColor, commodity: listing.commodity })
            }
        }

        // Guard against non-positive prices (e.g. a maliciously-listed negative price):
        // a negative total would pass the `cash >= total` check and turn the deduction
        // into a credit. Reject rather than move money.
        if (toPurchase.some(l => !Number.isFinite(l.price) || l.price <= 0)) {
            return Response.json({ error: "One or more items have an invalid price." }, { status: 409 })
        }

        const total = toPurchase.reduce((sum, listing) => sum + listing.price, 0)

        // Require public Steam inventory so the cron can verify trade completion
        if (!buyer.steam_id) {
            return Response.json({ error: "You must link your Steam account before making purchases." }, { status: 400 })
        }

        const GAME_APP_IDS: Record<string, string> = { CS2: "730", Dota2: "570", Rust: "252490", TF2: "440" }
        const games = [...new Set(toPurchase.map(l => GAME_APP_IDS[l.game ?? ""] ?? "730"))]
        for (const game of games) {
            const invRes = await fetch(`https://steamcommunity.com/inventory/${buyer.steam_id}/${game}/2?l=english&count=1`)
            if (invRes.status === 403) {
                return Response.json({ error: "Your Steam inventory must be set to public before making purchases." }, { status: 400 })
            }

            if (invRes.ok) {
                const invData = await invRes.json()
                if (invData?.success === false) {
                    return Response.json({ error: "Your Steam inventory must be set to public before making purchases." }, { status: 400 })
                }
            }
            // Other non-200 responses (rate limit, server error) — allow checkout
        }

        // Snapshot how many of each commodity the buyer already holds, so the cron can
        // prove delivery by a count increase rather than mere presence (see verifyBuyerHasItem).
        const preCounts = new Map<string, number | null>()
        for (const listing of toPurchase) {
            if (!listing.commodity || preCounts.has(listing.marketName)) {
                continue
            }

            preCounts.set(listing.marketName, await countInventoryItem(buyer.steam_id, listing.game, listing.marketName))
        }

        // Deduct buyer cash and create pending purchases
        const purchases = await prisma.$transaction(async (tx) => {
            const deducted = await tx.user.updateMany({
                where: { id: buyer.id, cash: { gte: total } },
                data: { cash: { decrement: total } },
            })
            if (deducted.count === 0) {
                throw new Error("Insufficient balance")
            }

            const created = []

            for (const listing of toPurchase) {
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
                        buyerPreCount: listing.commodity ? (preCounts.get(listing.marketName) ?? null) : null,
                        buyerId: buyer.id,
                        sellerId: listing.sellerId,
                    },
                })

                created.push(purchase)
            }

            return created
        })

        // Notify each seller
        const sellerIds = [...new Set(toPurchase.map(listing => listing.sellerId))]
        const sellers = await prisma.user.findMany({ where: { id: { in: sellerIds } } })

        for (const seller of sellers) {
            if (!seller.notificationEmail) continue

            const sellerItems = purchases.filter(p => p.sellerId === seller.id)

            await resend.emails.send({
                from: 'SkinSlinger <onboarding@skinslinger.com>',
                to: [seller.notificationEmail],
                subject: `New sale — send your item${sellerItems.length > 1 ? "s" : ""}`,
                react: PurchaseNotificationEmail({
                    buyerTradeUrl: buyer.steam_trade_url ?? "",
                    buyerName: buyer.name ?? buyer.email ?? "Buyer",
                    items: sellerItems.map(p => ({ marketName: p.marketName, price: p.price })),
                }),
            })
        }

        const updated = await prisma.user.findUnique({ where: { id: buyer.id }, select: { cash: true } })

        return Response.json({ newCash: updated!.cash })
    }
    catch (error) {
        if (error instanceof Error && error.message === "Insufficient balance") {
            return Response.json({ error: "Insufficient balance" }, { status: 402 })
        }

        if (error instanceof Error && error.message === "Item no longer available") {
            return Response.json({ error: "One or more items were purchased by someone else. Please refresh." }, { status: 409 })
        }

        console.error(error)
        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
