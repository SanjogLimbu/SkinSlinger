import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Resend } from "resend"
import { PurchaseNotificationEmail } from "@/app/components/emails/PurchaseNotificationEmail"
import { countInventoryItem } from "@/lib/steam"

//

const resend = new Resend(process.env.RESEND_API)

//

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const buyer = await prisma.user.findUnique({ where: { id: session.user.id } })
        if (!buyer) {
            return Response.json({ error: "User not found" }, { status: 404 })
        }

        // A match creates a deliverable purchase, so the buyer must be able to receive trades.
        if (!buyer.steam_id || !buyer.steam_trade_url) {
            return Response.json({ error: "Link your Steam account and trade URL before placing a buy order." }, { status: 400 })
        }

        const { marketName, price, quantity, game, icon, hexColor } = await request.json()

        if (!marketName || typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
            return Response.json({ error: "Invalid price" }, { status: 400 })
        }

        if (!Number.isInteger(quantity) || quantity < 1) {
            return Response.json({ error: "Invalid quantity" }, { status: 400 })
        }

        const existingOrder = await prisma.buy_order.findFirst({
            where: { userId: buyer.id, marketName },
        })
        if (existingOrder) {
            return Response.json({ error: "You already have an active buy order for this item. Cancel it before placing a new one." }, { status: 409 })
        }

        const totalCost = price * quantity

        if (buyer.cash < totalCost) {
            return Response.json({ error: "Insufficient balance" }, { status: 400 })
        }

        // Auto-match against existing sell orders (cheapest first, not own listings)
        const matchable = await prisma.item_listing.findMany({
            where: { marketName, price: { lte: price }, userId: { not: buyer.id } },
            orderBy: [{ price: "asc" }, { createdAt: "asc" }],
            take: quantity,
            include: {
                user: { select: { id: true, notificationEmail: true } },
            },
        })

        let matched = 0
        const sellerNotifications = new Map<string, { email: string | null; items: { marketName: string; price: number }[] }>()

        // Snapshot how many of this commodity the buyer already holds, so the cron can
        // prove delivery by a count increase rather than mere presence (see verifyBuyerHasItem).
        const buyerPreCount = matchable.length > 0 && matchable[0].commodity
            ? await countInventoryItem(buyer.steam_id, matchable[0].game, marketName)
            : null

        // Deduction, matching, and the remainder buy order all commit together — a
        // failure anywhere rolls back the deduction too, so the buyer can never be
        // charged without receiving purchases and/or a standing order.
        let insufficient = false
        try {
            await prisma.$transaction(async (tx) => {
                // Deduct full bid amount upfront
                const deducted = await tx.user.updateMany({
                    where: { id: buyer.id, cash: { gte: totalCost } },
                    data: { cash: { decrement: totalCost } },
                })
                if (deducted.count === 0) {
                    insufficient = true
                    throw new Error("Insufficient balance")
                }

                for (const listing of matchable) {
                    // Count-guarded claim: if the listing was bought or delisted since
                    // the findMany above, skip it (it becomes part of the standing order)
                    // instead of failing the whole transaction.
                    const claimed = await tx.item_listing.deleteMany({ where: { id: listing.id } })
                    if (claimed.count === 0) continue

                    await tx.purchase.create({
                        data: {
                            price: listing.price,
                            assetId: listing.assetId,
                            marketName: listing.marketName,
                            game: listing.game,
                            icon: listing.icon,
                            hexColor: listing.hexColor,
                            commodity: listing.commodity,
                            buyerTradeUrl: buyer.steam_trade_url,
                            buyerPreCount: listing.commodity ? buyerPreCount : null,
                            buyerId: buyer.id,
                            sellerId: listing.userId,
                        },
                    })

                    // Refund the difference (buyer bid higher than sell price)
                    const diff = price - listing.price
                    if (diff > 0.001) {
                        await tx.user.update({
                            where: { id: buyer.id },
                            data: { cash: { increment: diff } },
                        })
                    }

                    matched++

                    // Collect seller notification
                    const existing = sellerNotifications.get(listing.userId)
                    if (existing) {
                        existing.items.push({ marketName: listing.marketName, price: listing.price })
                    } else {
                        sellerNotifications.set(listing.userId, {
                            email: listing.user.notificationEmail,
                            items: [{ marketName: listing.marketName, price: listing.price }],
                        })
                    }
                }

                // Create buy order for unmatched quantity
                const remaining = quantity - matched
                if (remaining > 0) {
                    await tx.buy_order.create({
                        data: {
                            userId: buyer.id,
                            marketName,
                            price,
                            quantity: remaining,
                            game: game ?? null,
                            icon: icon ?? null,
                            hexColor: hexColor ?? null,
                        },
                    })
                }
            })
        } catch (error) {
            if (insufficient) {
                return Response.json({ error: "Insufficient balance" }, { status: 400 })
            }

            throw error
        }

        // Notify sellers
        for (const [, seller] of sellerNotifications) {
            if (!seller.email) continue
            await resend.emails.send({
                from: "SkinSlinger <onboarding@skinslinger.com>",
                to: [seller.email],
                subject: `New sale — send your item${seller.items.length > 1 ? "s" : ""}`,
                react: PurchaseNotificationEmail({
                    buyerTradeUrl: buyer.steam_trade_url ?? "",
                    buyerName: buyer.name ?? buyer.email ?? "Buyer",
                    items: seller.items,
                }),
            })
        }

        return Response.json({ matched, remaining: quantity - matched })
    } catch (error) {
        console.error(error)
        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
