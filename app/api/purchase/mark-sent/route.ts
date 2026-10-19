import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendTradeOfferSentEmail } from "@/lib/tradeNotifications"

//

// Only notifies the buyer, since status and payout wait on the Steam inventory check.
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }


        const { ids, tradeofferid } = await req.json()

        const idsAreStrings = Array.isArray(ids) && ids.every(id => typeof id === "string")

        if (!idsAreStrings || ids.length === 0) {
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

        const allFound = purchases.length === ids.length
        const allOwned = purchases.every(p => p.sellerId === session.user.id)

        if (!allFound || !allOwned) {
            return Response.json({ error: "Forbidden" }, { status: 403 })
        }


        if (purchases.some(p => p.status !== "pending")) {
            return Response.json(
                { error: "This order is no longer awaiting delivery." },
                { status: 409 },
            )
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


        const buyerEmail = purchases[0].buyer.notificationEmail

        if (updated.count > 0 && buyerEmail) {
            await sendTradeOfferSentEmail(
                buyerEmail,
                purchases[0].seller.name ?? "The seller",
                purchases.map(p => ({ marketName: p.marketName, price: p.price })),
            )
        }


        return Response.json(null, { status: 200 })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
