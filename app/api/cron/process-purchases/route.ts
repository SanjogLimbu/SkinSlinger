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

// Steam expires a trade offer after 14 days, so by then a sent offer can no longer deliver.
const OFFER_DEADLINE_MS = 15 * 24 * 60 * 60 * 1000

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

type HeldPurchase = {
    game: string | null
    marketName: string
    seller: { steam_id: string | null, steam_trade_url: string | null }
}

type FloatRow = { floatValue: number | null, paintSeed: number | null }

type MissingItem = "reversed" | "moved" | "unknown"

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
        // Re-read, since the extension may have recorded a trade offer after this run loaded the order.
        const current = await tx.purchase.findUnique({
            where: { id: purchase.id },
            select: { tradeOfferId: true },
        })

        const removed = await tx.purchase.deleteMany({ where: { id: purchase.id, status: "pending" } })

        if (removed.count === 0) {
            return false
        }


        // Queued for the seller's extension to cancel on Steam, or the buyer could accept it after the refund.
        if (current?.tradeOfferId) {
            await tx.cancelled_trade_offer.createMany({
                data: [{ tradeOfferId: current.tradeOfferId, sellerId: purchase.sellerId }],
                skipDuplicates: true,
            })
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


// A reversal sends the item back to the seller, while a CS2 buyer can't move it until protection ends.
async function traceMissingItem(purchase: HeldPurchase, float: FloatRow | null): Promise<MissingItem> {
    // Steam can only reverse CS2 trades, so in other games the buyer moved the item themselves.
    if ((purchase.game ?? "CS2") !== "CS2") {
        return "moved"
    }


    // A stack's copies can't be told apart, so a missing copy still counts as a reversal.
    if (float?.floatValue == null || !purchase.seller.steam_id) {
        return "reversed"
    }


    const result = await verifyBuyerHasItem(
        purchase.seller.steam_id,
        purchase.game,
        purchase.marketName,
        float,
        purchase.seller.steam_trade_url,
        null,
    )

    if (result === "error") {
        return "unknown"
    }


    // A private inventory can't show the item didn't come back, so the buyer gets the benefit of the doubt.
    if (result === "has_item" || result === "private") {
        return "reversed"
    }


    return "moved"
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
                seller: { select: { notificationEmail: true, steam_id: true, steam_trade_url: true } },
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

                // A trade can only be reversed during the hold, so the order is settled once it ends.
                if (holding && !matured) {
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

                if (purchase.status === "pending") {
                    const offerSentAt = purchase.tradeOfferSentAt?.getTime()

                    // A sent offer gets until Steam would expire it, so the buyer's cash is never stuck for good.
                    const deadline = offerSentAt != null
                        ? offerSentAt + OFFER_DEADLINE_MS
                        : purchase.createdAt.getTime() + AUTO_CANCEL_MS

                    if (itemArrived) {
                        const moved = await prisma.purchase.updateMany({
                            where: { id: purchase.id, status: "pending" },
                            data: { status: "holding", deliveredAt: new Date() },
                        })

                        if (moved.count > 0) {
                            delivered++
                        }
                    }
                    else if (now >= deadline) {
                        const cancelled = await autoCancelPurchase(purchase)

                        if (cancelled) {
                            autoCancelled++
                        }
                    }
                }
                else {
                    const missing = itemArrived ? null : await traceMissingItem(purchase, float)

                    // Money never moves on a guess, so the order waits for the next run.
                    if (missing === "unknown") {
                        continue
                    }


                    if (missing === "reversed") {
                        const refunded = await refundReversal(purchase.id, purchase.buyerId, purchase.price)

                        if (refunded) {
                            reversedTrades.push({
                                marketName: purchase.marketName,
                                price: purchase.price,
                                buyerEmail: purchase.buyer.notificationEmail,
                            })
                        }
                    }
                    else {
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
