import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendTradeOfferSentEmail } from "@/lib/tradeNotifications"

//

// Seller self-reports that they've sent the Steam trade offer. This is purely a
// notification nudge for the buyer: it never touches purchase.status or payout/escrow,
// which only ever advance on the actual Steam inventory check (see cron/process-purchases).
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { ids, tradeofferid } = await req.json()

        if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === "string")) {
            return Response.json({ error: "Invalid request" }, { status: 400 })
        }

        if (tradeofferid !== undefined && typeof tradeofferid !== "string") {
            return Response.json({ error: "Invalid request" }, { status: 400 })
        }

        const purchases = await prisma.purchase.findMany({
            where: { id: { in: ids } },
            include: {
                buyer: { select: { notificationEmail: true } },
                seller: { select: { name: true } },
            },
        })

        if (purchases.length !== ids.length || purchases.some(p => p.sellerId !== session.user.id)) {
            return Response.json({ error: "Forbidden" }, { status: 403 })
        }

        if (purchases.some(p => p.status !== "pending")) {
            return Response.json({ error: "This order is no longer awaiting delivery." }, { status: 409 })
        }

        const updated = await prisma.purchase.updateMany({
            where: { id: { in: ids }, status: "pending", tradeOfferSentAt: null },
            data: { tradeOfferSentAt: new Date() },
        })

        if (tradeofferid) {
            await prisma.purchase.updateMany({
                where: { id: { in: ids }, status: "pending" },
                data: { tradeOfferId: tradeofferid },
            })
        }

        if (updated.count > 0) {
            const buyerEmail = purchases[0].buyer.notificationEmail
            if (buyerEmail) {
                await sendTradeOfferSentEmail(
                    buyerEmail,
                    purchases[0].seller.name ?? "The seller",
                    purchases.map(p => ({ marketName: p.marketName, price: p.price })),
                )
            }
        }

        return Response.json(null, { status: 200 })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
