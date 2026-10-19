import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { verifyBuyerHasItem } from "@/lib/steam"

//

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }


        const { id } = await params

        const purchase = await prisma.purchase.findUnique({
            where: { id },
            include: {
                buyer: { select: { steam_id: true, steam_trade_url: true } },
            },
        })

        if (!purchase) {
            return Response.json({ error: "Purchase not found" }, { status: 404 })
        }


        // A buyer cancelling could race a trade offer the seller already sent, so only the seller can cancel.
        if (purchase.sellerId !== session.user.id) {
            return Response.json({ error: "Forbidden" }, { status: 403 })
        }


        if (purchase.status === "completed" || purchase.status === "reversed") {
            return Response.json({ error: "This order has already been finalised." }, { status: 409 })
        }


        if (purchase.status === "holding") {
            return Response.json(
                { error: "This item has been delivered and is in the 8-day clearing period — it can't be cancelled." },
                { status: 409 },
            )
        }


        // Stops a buyer from receiving the item and then getting a refund as well.
        if (purchase.buyer.steam_id) {
            const float = await prisma.item_float.findUnique({ where: { assetId: purchase.assetId } })

            const result = await verifyBuyerHasItem(
                purchase.buyer.steam_id,
                purchase.game,
                purchase.marketName,
                float,
                purchase.buyerTradeUrl ?? purchase.buyer.steam_trade_url,
                purchase.buyerPreCount,
            )

            // No money moves on a guess.
            if (result === "error") {
                return Response.json(
                    { error: "Couldn't verify the trade with Steam right now. Please try again in a moment." },
                    { status: 503 },
                )
            }


            if (result === "private") {
                return Response.json(
                    { error: "Make your Steam inventory public so we can verify the trade, then try again." },
                    { status: 409 },
                )
            }


            // Already delivered, so the order starts its hold instead of being cancelled.
            if (result === "has_item") {
                await prisma.purchase.updateMany({
                    where: { id, status: "pending" },
                    data: { status: "holding", deliveredAt: new Date() },
                })

                return Response.json(
                    { error: "The item has already been delivered — it's now in the 8-day clearing period and can't be cancelled." },
                    { status: 409 },
                )
            }
        }


        await prisma.$transaction(async (tx) => {
            // Re-read, since the extension may have recorded a trade offer during the Steam check.
            const current = await tx.purchase.findUnique({
                where: { id },
                select: { tradeOfferId: true },
            })

            // Only the request that removes the order refunds it, so a race can't refund twice.
            const removed = await tx.purchase.deleteMany({ where: { id, status: "pending" } })

            if (removed.count === 0) {
                return
            }


            // Queued for the seller's extension to cancel on Steam, or the buyer could still accept it.
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

            // The icon comes back too, or the market would hide the listing.
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
        })

        return Response.json(null, { status: 200 })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
