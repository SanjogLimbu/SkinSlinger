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


        // Only the seller can cancel: a buyer cancelling could race a trade offer the
        // seller already sent (refund lands while the offer is still acceptable).
        if (purchase.sellerId !== session.user.id) {
            return Response.json({ error: "Forbidden" }, { status: 403 })
        }


        if (purchase.status === "completed" || purchase.status === "reversed") {
            return Response.json({ error: "This order has already been finalised." }, { status: 409 })
        }

        if (purchase.status === "holding") {
            return Response.json({ error: "This item has been delivered and is in the 8-day clearing period — it can't be cancelled." }, { status: 409 })
        }


        // Check the buyer's inventory before cancelling to prevent scamming.
        if (purchase.buyer.steam_id) {
            const float = await prisma.item_float.findUnique({ where: { assetId: purchase.assetId } })
            const floatData = float ? { floatValue: float.floatValue, paintSeed: float.paintSeed } : null
            const buyerTradeUrl = purchase.buyerTradeUrl ?? purchase.buyer.steam_trade_url
            const result = await verifyBuyerHasItem(purchase.buyer.steam_id, purchase.game, purchase.marketName, floatData, buyerTradeUrl)

            if (result === "error") {
                // Couldn't reach Steam — don't move money on a guess; let the caller retry.
                return Response.json({ error: "Couldn't verify the trade with Steam right now. Please try again in a moment." }, { status: 503 })
            }

            if (result === "private") {
                // Can't verify a private inventory — refuse rather than guess, so a buyer
                // can't receive the item, hide it, then cancel for a refund.
                return Response.json({ error: "Make your Steam inventory public so we can verify the trade, then try again." }, { status: 409 })
            }

            if (result === "has_item") {
                // The item has already been delivered — start the hold instead of cancelling,
                // so the seller still can't get paid until the clearing window passes.
                await prisma.purchase.updateMany({
                    where: { id, status: "pending" },
                    data: { status: "holding", deliveredAt: new Date() },
                })

                return Response.json({ error: "The item has already been delivered — it's now in the 8-day clearing period and can't be cancelled." }, { status: 409 })
            }
        }


        await prisma.$transaction(async (tx) => {
            // Re-read tradeOfferId here rather than trusting the value fetched before the
            // Steam verification call above: the extension can report a freshly-sent offer
            // (setting tradeOfferId) while that call is in flight, and using the stale value
            // would delete the purchase without queuing the now-live offer for cancellation.
            const current = await tx.purchase.findUnique({ where: { id }, select: { tradeOfferId: true } })

            // Only refund/restore if this request is the one that removes the still-pending
            // purchase — stops a concurrent delivery/completion from being refunded as well.
            const removed = await tx.purchase.deleteMany({ where: { id, status: "pending" } })
            if (removed.count === 0) return

            // If a Steam trade offer was already sent, queue it for the seller's
            // extension to cancel on Steam (the purchase row is gone after this, so the
            // offer id has to be remembered here).
            if (current?.tradeOfferId) {
                await tx.cancelled_trade_offer.createMany({
                    data: [{ tradeOfferId: current.tradeOfferId, sellerId: purchase.sellerId }],
                    skipDuplicates: true,
                })
            }

            // Refund buyer
            await tx.user.update({
                where: { id: purchase.buyerId },
                data: { cash: { increment: purchase.price } },
            })


            // Restore listing — carry over the display fields stored on the purchase, else the
            // listing comes back with a null icon and is filtered out of the market entirely.
            await tx.item_listing.create({
                data: {
                    assetId: purchase.assetId,
                    marketName: purchase.marketName,
                    price: purchase.price,
                    game: purchase.game,
                    icon: purchase.icon,
                    hexColor: purchase.hexColor,
                    commodity: purchase.commodity,
                    userId: purchase.sellerId,
                },
            })
        })


        return Response.json(null, { status: 200 })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
