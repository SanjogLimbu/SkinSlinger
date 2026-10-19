import { prisma } from "@/lib/db"
import { verifyBuyerHasItem } from "@/lib/steam"
import {
    sendTradeCompleteEmails,
    sendReversalRefundEmails,
    CompletedTrade,
    ReversedTrade,
} from "@/lib/tradeNotifications"

//

// Steam's trade-reversal window, so a seller can't deliver, get paid, then reverse the trade.
const HOLD_MS = 8 * 24 * 60 * 60 * 1000

// A seller who hasn't sent a trade offer by then loses the sale, so the buyer's cash isn't stuck.
const AUTO_CANCEL_MS = 3 * 24 * 60 * 60 * 1000

//

type CancellablePurchase = {
    id: string
    buyerId: string
    sellerId: string
    price: number
    assetId: string
    marketName: string
    game: string | null
    icon: string | null
    hexColor: string | null
    commodity: boolean
}

//

// The status check makes a repeat run a no-op, so the seller is never paid twice.
async function completePurchase(id: string, sellerId: string, price: number): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const updated = await tx.purchase.updateMany({
            where: { id, status: "holding" },
            data: { status: "completed" },
        })

        if (updated.count === 0) {
            return false
        }


        await tx.user.update({
            where: { id: sellerId },
            data: { cash: { increment: price } },
        })

        return true
    })
}


// The status check makes a repeat run a no-op, so the buyer is never refunded twice.
async function refundReversal(id: string, buyerId: string, price: number): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const updated = await tx.purchase.updateMany({
            where: { id, status: "holding" },
            data: { status: "reversed" },
        })

        if (updated.count === 0) {
            return false
        }


        await tx.user.update({
            where: { id: buyerId },
            data: { cash: { increment: price } },
        })

        return true
    })
}


// Only the run that removes the order refunds it, so the buyer is never refunded twice.
async function autoCancelPurchase(purchase: CancellablePurchase): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const removed = await tx.purchase.deleteMany({ where: { id: purchase.id, status: "pending" } })

        if (removed.count === 0) {
            return false
        }


        await tx.user.update({
            where: { id: purchase.buyerId },
            data: { cash: { increment: purchase.price } },
        })

        const listing = {
            assetId: purchase.assetId,
            marketName: purchase.marketName,
            price: purchase.price,
            game: purchase.game,
            icon: purchase.icon,
            hexColor: purchase.hexColor,
            commodity: purchase.commodity,
            userId: purchase.sellerId,
        }

        // The seller may have listed the item again, and a duplicate would fail the whole refund.
        await tx.item_listing.createMany({ data: [listing], skipDuplicates: true })

        return true
    })
}

//

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET

    if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 })
    }


    try {
        const active = await prisma.purchase.findMany({
            where: {
                status: { in: ["pending", "holding"] },
                buyer: { steam_id: { not: null } },
            },
            include: {
                buyer: { select: { steam_id: true, steam_trade_url: true, notificationEmail: true } },
                seller: { select: { notificationEmail: true } },
            },
        })

        // Float data is stored under the seller's asset id, since an item's asset id changes when it's traded.
        const floatRows = await prisma.item_float.findMany({
            where: { assetId: { in: active.map((purchase) => purchase.assetId) } },
        })

        const floatByAssetId = new Map(floatRows.map((row) => [row.assetId, row]))

        const now = Date.now()
        const completedTrades: CompletedTrade[] = []
        const reversedTrades: ReversedTrade[] = []
        let delivered = 0
        let autoCancelled = 0

        for (const purchase of active) {
            try {
                if (!purchase.buyer.steam_id) {
                    continue
                }


                // Money never moves on a price of zero or less, which only listings older than price validation have.
                if (!Number.isFinite(purchase.price) || purchase.price <= 0) {
                    continue
                }


                const holding = purchase.status === "holding"
                const deliveredAt = purchase.deliveredAt?.getTime()
                const matured = holding && deliveredAt != null && now - deliveredAt >= HOLD_MS

                // The item is trade-locked during the hold, so there's nothing to check until it ends.
                if (holding && !matured) {
                    continue
                }


                // The extension reports these itself, and Steam hides freshly traded items from inventory lookups.
                if (purchase.status === "pending" && purchase.tradeOfferId) {
                    continue
                }


                const float = floatByAssetId.get(purchase.assetId) ?? null

                const result = await verifyBuyerHasItem(
                    purchase.buyer.steam_id,
                    purchase.game,
                    purchase.marketName,
                    float,
                    purchase.buyerTradeUrl ?? purchase.buyer.steam_trade_url,
                    purchase.buyerPreCount,
                )

                // Money never moves on a guess, so the order waits for the next run.
                if (result === "error") {
                    continue
                }


                const itemArrived = result === "has_item" || result === "private"
                const offerSent = purchase.tradeOfferSentAt != null
                const overdue = now - purchase.createdAt.getTime() >= AUTO_CANCEL_MS

                if (purchase.status === "pending") {
                    if (itemArrived) {
                        const moved = await prisma.purchase.updateMany({
                            where: { id: purchase.id, status: "pending" },
                            data: { status: "holding", deliveredAt: new Date() },
                        })

                        if (moved.count > 0) {
                            delivered++
                        }
                    }
                    // No trade offer in time, so the order is cancelled rather than leaving the buyer's cash stuck.
                    else if (!offerSent && overdue) {
                        const cancelled = await autoCancelPurchase(purchase)

                        if (cancelled) {
                            autoCancelled++
                        }
                    }
                }
                else if (itemArrived) {
                    const completed = await completePurchase(
                        purchase.id,
                        purchase.sellerId,
                        purchase.price,
                    )

                    if (completed) {
                        completedTrades.push({
                            marketName: purchase.marketName,
                            price: purchase.price,
                            buyerEmail: purchase.buyer.notificationEmail,
                            sellerEmail: purchase.seller.notificationEmail,
                        })
                    }
                }
                // The item left the buyer during the hold, so the trade was reversed.
                else {
                    const refunded = await refundReversal(purchase.id, purchase.buyerId, purchase.price)

                    if (refunded) {
                        reversedTrades.push({
                            marketName: purchase.marketName,
                            price: purchase.price,
                            buyerEmail: purchase.buyer.notificationEmail,
                        })
                    }
                }
            }
            catch (error) {
                // One failing order mustn't hold up the rest.
                console.error(`[process-purchases] purchase ${purchase.id} failed:`, error)
            }
        }


        await sendTradeCompleteEmails(completedTrades)
        await sendReversalRefundEmails(reversedTrades)

        return Response.json({
            delivered,
            completed: completedTrades.length,
            reversed: reversedTrades.length,
            autoCancelled,
        })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
