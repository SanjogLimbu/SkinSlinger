import { prisma } from "@/lib/db"
import { verifyBuyerHasItem } from "@/lib/steam"
import { sendTradeCompleteEmails, sendReversalRefundEmails, CompletedTrade, ReversedTrade } from "@/lib/tradeNotifications"

//

// Funds are held after delivery for the Steam trade-reversal window before being
// released to the seller, so a seller can't deliver, get paid, then reverse the trade.
const HOLD_MS = 8 * 24 * 60 * 60 * 1000

// A pending order that the seller hasn't even sent a trade offer for yet (stage 2) is
// auto-cancelled after this long, so a buyer's cash isn't held hostage by an unresponsive seller.
const AUTO_CANCEL_MS = 3 * 24 * 60 * 60 * 1000

//

// Releases held funds to the seller once the hold has elapsed and the item is still
// with the buyer. Returns true only on the real holding -> completed transition.
async function completePurchase(id: string, sellerId: string, price: number): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const updated = await tx.purchase.updateMany({ where: { id, status: "holding" }, data: { status: "completed" } })
        if (updated.count === 0) return false
        await tx.user.update({ where: { id: sellerId }, data: { cash: { increment: price } } })
        return true
    })
}

// Refunds the buyer when a delivered item disappears during the hold window (a Steam
// trade reversal). Returns true only on the real holding -> reversed transition.
async function refundReversal(id: string, buyerId: string, price: number): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const updated = await tx.purchase.updateMany({ where: { id, status: "holding" }, data: { status: "reversed" } })
        if (updated.count === 0) return false
        await tx.user.update({ where: { id: buyerId }, data: { cash: { increment: price } } })
        return true
    })
}

// Auto-cancels a pending order that never made it past stage 2 (no trade offer sent):
// refunds the buyer and restores the listing, same as a manual cancel. Returns true only
// on the real pending -> deleted transition.
async function autoCancelPurchase(p: {
    id: string; buyerId: string; sellerId: string; price: number; assetId: string
    marketName: string; game: string | null; icon: string | null; hexColor: string | null; commodity: boolean
}): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const removed = await tx.purchase.deleteMany({ where: { id: p.id, status: "pending" } })
        if (removed.count === 0) return false

        await tx.user.update({ where: { id: p.buyerId }, data: { cash: { increment: p.price } } })

        await tx.item_listing.create({
            data: {
                assetId: p.assetId,
                marketName: p.marketName,
                price: p.price,
                game: p.game,
                icon: p.icon,
                hexColor: p.hexColor,
                commodity: p.commodity,
                userId: p.sellerId,
            },
        })

        return true
    })
}

//

export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET

    if (secret) {
        const auth = req.headers.get("authorization")

        if (auth !== `Bearer ${secret}`) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }
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

        // Float/pattern data is keyed by the seller's listing assetId (= purchase.assetId)
        // and is used to verify a skin precisely, since assetid itself changes on trade.
        const floatRows = await prisma.item_float.findMany({ where: { assetId: { in: active.map(p => p.assetId) } } })
        const floatMap = new Map(floatRows.map(f => [f.assetId, f]))

        const now = Date.now()
        const completedTrades: CompletedTrade[] = []
        const reversedTrades: ReversedTrade[] = []
        let delivered = 0
        let autoCancelled = 0

        for (const p of active) {
            if (!p.buyer.steam_id) continue

            // Never move money for a non-positive price. Such a row can only exist from a bad
            // listing that predates the price validation; skip it so it can't pay out or refund.
            if (!Number.isFinite(p.price) || p.price <= 0) continue

            // Holding orders only need checking once the hold has elapsed — no point polling
            // Steam during the window since the item is trade-locked and can't move.
            const matured = p.status === "holding" && p.deliveredAt != null && (now - p.deliveredAt.getTime()) >= HOLD_MS
            if (p.status === "holding" && !matured) continue

            // Orders the extension is tracking wait for its own acceptance report
            // (POST /api/extension/offer-status) instead of this inventory heuristic:
            // Steam hides recently-traded/trade-locked items from third-party inventory
            // lookups, which makes this check unreliable for freshly-sent trades anyway.
            if (p.status === "pending" && p.tradeOfferId) continue

            const f = floatMap.get(p.assetId)
            const float = f ? { floatValue: f.floatValue, paintSeed: f.paintSeed } : null
            const buyerTradeUrl = p.buyerTradeUrl ?? p.buyer.steam_trade_url
            const result = await verifyBuyerHasItem(p.buyer.steam_id, p.game, p.marketName, float, buyerTradeUrl, p.buyerPreCount)

            if (result === "error") {
                continue // Steam unreachable — retry next run
            }

            if (p.status === "pending") {
                // Awaiting delivery. has_item or private => delivered; start the hold.
                if (result === "has_item" || result === "private") {
                    const moved = await prisma.purchase.updateMany({
                        where: { id: p.id, status: "pending" },
                        data: { status: "holding", deliveredAt: new Date() },
                    })
                    if (moved.count > 0) delivered++
                }
                // "no_item" => not delivered yet. If the seller hasn't even sent the trade
                // offer within the window, auto-cancel rather than leave the buyer's cash stuck.
                else if (p.tradeOfferSentAt == null && (now - p.createdAt.getTime()) >= AUTO_CANCEL_MS) {
                    const cancelled = await autoCancelPurchase(p)
                    if (cancelled) autoCancelled++
                }
            }
            else {
                // Holding and matured. Item still there (or hidden) => pay seller; gone => reversal.
                if (result === "has_item" || result === "private") {
                    const ok = await completePurchase(p.id, p.sellerId, p.price)
                    if (ok) {
                        completedTrades.push({
                            marketName: p.marketName, price: p.price,
                            buyerEmail: p.buyer.notificationEmail, sellerEmail: p.seller.notificationEmail,
                        })
                    }
                }
                else {
                    const ok = await refundReversal(p.id, p.buyerId, p.price)
                    if (ok) {
                        reversedTrades.push({
                            marketName: p.marketName, price: p.price, buyerEmail: p.buyer.notificationEmail,
                        })
                    }
                }
            }
        }

        await sendTradeCompleteEmails(completedTrades)
        await sendReversalRefundEmails(reversedTrades)

        return Response.json({ delivered, completed: completedTrades.length, reversed: reversedTrades.length, autoCancelled })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
