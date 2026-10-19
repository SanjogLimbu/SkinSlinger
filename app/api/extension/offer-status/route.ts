import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendTradeOfferSentEmail } from "@/lib/tradeNotifications"

//

type OfferUpdate = { orderId?: unknown, state?: unknown, tradeOfferId?: unknown }

const OFFER_STATES = ["active", "gone", "accepted"]

//

function isValidUpdate(update: OfferUpdate): boolean {
    const validOrderId = typeof update?.orderId === "string"
    const validState = OFFER_STATES.includes(update?.state as string)
    const validOfferId = update?.tradeOfferId === undefined || typeof update?.tradeOfferId === "string"

    return validOrderId && validState && validOfferId
}


// Trusting the extension is safe, since payout still waits on the cron's inventory check.
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }


        const body = await req.json()
        const updates = body.updates ?? []
        const cancelledOfferIds = body.cancelledOfferIds ?? []

        const updatesValid = Array.isArray(updates) && updates.every(isValidUpdate)
        const offerIdsValid = Array.isArray(cancelledOfferIds)
            && cancelledOfferIds.every((id: unknown) => typeof id === "string")
        const hasWork = updates.length > 0 || cancelledOfferIds.length > 0

        if (!updatesValid || !offerIdsValid || !hasWork) {
            return Response.json({ error: "Invalid request" }, { status: 400 })
        }


        if (cancelledOfferIds.length > 0) {
            await prisma.cancelled_trade_offer.deleteMany({
                where: { tradeOfferId: { in: cancelledOfferIds }, sellerId: session.user.id },
            })
        }


        if (updates.length === 0) {
            return Response.json(null, { status: 200 })
        }


        const orderIds = updates.map((update: { orderId: string }) => update.orderId)

        const purchases = await prisma.purchase.findMany({
            where: { id: { in: orderIds } },
            include: {
                buyer: { select: { notificationEmail: true } },
                seller: { select: { name: true } },
            },
        })

        // An order can change between the extension's fetch and this report, so those are skipped.
        const owned = new Map<string, (typeof purchases)[number]>()

        for (const purchase of purchases) {
            if (purchase.sellerId === session.user.id && purchase.status === "pending") {
                owned.set(purchase.id, purchase)
            }
        }


        const newlySent: typeof purchases = []

        for (const update of updates) {
            const purchase = owned.get(update.orderId)

            if (!purchase) {
                continue
            }


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


                if (marked.count > 0) {
                    newlySent.push(purchase)
                }
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


        // One report can cover several buyers, so emails are grouped per buyer.
        const byBuyer = new Map<string, typeof newlySent>()

        for (const p of newlySent) {
            if (!p.buyer.notificationEmail) {
                continue
            }


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
