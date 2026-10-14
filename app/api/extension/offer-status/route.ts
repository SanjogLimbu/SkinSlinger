import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendTradeOfferSentEmail } from "@/lib/tradeNotifications"

//

// Reported by the extension after checking the seller's own sent-offers page on Steam:
// "active" means a live offer to the buyer genuinely exists (covers offers sent outside
// the browser, which the send hook never sees); "gone" means an offer we recorded was
// cancelled/declined/deleted, so the "trade sent" flag is rolled back and the buyer
// stops waiting on a dead offer; "accepted" means Steam shows the recorded offer as
// accepted, so delivery is confirmed and the 8-day escrow hold starts (same transition
// as trade-status). "cancelledOfferIds" lists queued offers the extension has now
// cancelled on Steam, clearing them from cancelled_trade_offer. Payout itself still
// only ever advances on real inventory checks (see cron/process-purchases).
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await req.json()
        const updates = body.updates ?? []
        const cancelledOfferIds = body.cancelledOfferIds ?? []

        const valid = Array.isArray(updates)
            && updates.every((u: { orderId?: unknown; state?: unknown; tradeOfferId?: unknown }) =>
                typeof u?.orderId === "string"
                && (u.state === "active" || u.state === "gone" || u.state === "accepted")
                && (u.tradeOfferId === undefined || typeof u.tradeOfferId === "string")
            )
            && Array.isArray(cancelledOfferIds) && cancelledOfferIds.every((id: unknown) => typeof id === "string")
            && (updates.length > 0 || cancelledOfferIds.length > 0)

        if (!valid) {
            return Response.json({ error: "Invalid request" }, { status: 400 })
        }

        // Offers the extension confirmed as cancelled on Steam (or found already dead):
        // their queue entries are done.
        if (cancelledOfferIds.length > 0) {
            await prisma.cancelled_trade_offer.deleteMany({
                where: { tradeOfferId: { in: cancelledOfferIds }, sellerId: session.user.id },
            })
        }

        if (updates.length === 0) {
            return Response.json(null, { status: 200 })
        }

        const purchases = await prisma.purchase.findMany({
            where: { id: { in: updates.map((u: { orderId: string }) => u.orderId) } },
            include: {
                buyer: { select: { notificationEmail: true } },
                seller: { select: { name: true } },
            },
        })

        // The extension polls asynchronously, so an order can complete or change hands
        // between its pending-sales fetch and this report: skip those rather than
        // failing the whole batch.
        const owned = new Map(
            purchases
                .filter(p => p.sellerId === session.user.id && p.status === "pending")
                .map(p => [p.id, p])
        )

        const newlySent: typeof purchases = []

        for (const update of updates) {
            const purchase = owned.get(update.orderId)
            if (!purchase) continue

            if (update.state === "active") {
                const marked = await prisma.purchase.updateMany({
                    where: { id: purchase.id, status: "pending", tradeOfferSentAt: null },
                    data: { tradeOfferSentAt: new Date() },
                })

                if (update.tradeOfferId) {
                    await prisma.purchase.updateMany({
                        where: { id: purchase.id, status: "pending" },
                        data: { tradeOfferId: update.tradeOfferId },
                    })
                }

                if (marked.count > 0) newlySent.push(purchase)
            }

            if (update.state === "gone") {
                await prisma.purchase.updateMany({
                    where: { id: purchase.id, status: "pending" },
                    data: { tradeOfferSentAt: null, tradeOfferId: null },
                })
            }

            if (update.state === "accepted") {
                await prisma.purchase.updateMany({
                    where: { id: purchase.id, status: "pending" },
                    data: { status: "holding", deliveredAt: new Date() },
                })
            }
        }

        // One report can cover orders from several buyers: group the emails per buyer.
        const byBuyer = new Map<string, typeof newlySent>()
        for (const p of newlySent) {
            if (!p.buyer.notificationEmail) continue
            const group = byBuyer.get(p.buyer.notificationEmail) ?? []
            group.push(p)
            byBuyer.set(p.buyer.notificationEmail, group)
        }

        for (const [buyerEmail, group] of byBuyer) {
            await sendTradeOfferSentEmail(
                buyerEmail,
                group[0].seller.name ?? "The seller",
                group.map(p => ({ marketName: p.marketName, price: p.price })),
            )
        }

        return Response.json(null, { status: 200 })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
