import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Resend } from "resend"
import { PurchaseNotificationEmail } from "@/app/components/emails/PurchaseNotificationEmail"
import { countInventoryItem } from "@/lib/steam"

//

const resend = new Resend(process.env.RESEND_API)

//

type SellerNotice = {
    email: string | null
    items: { marketName: string, price: number }[]
}

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


        // A match creates a purchase straight away, so the buyer must be able to receive trades.
        if (!buyer.steam_id || !buyer.steam_trade_url) {
            return Response.json(
                { error: "Link your Steam account and trade URL before placing a buy order." },
                { status: 400 },
            )
        }


        const { marketName, price, quantity, game, icon, hexColor } = await request.json()
        const validPrice = typeof price === "number" && Number.isFinite(price) && price > 0

        if (!marketName || !validPrice) {
            return Response.json({ error: "Invalid price" }, { status: 400 })
        }


        if (!Number.isInteger(quantity) || quantity < 1) {
            return Response.json({ error: "Invalid quantity" }, { status: 400 })
        }


        const existingOrder = await prisma.buy_order.findFirst({
            where: { userId: buyer.id, marketName },
        })

        if (existingOrder) {
            return Response.json(
                { error: "You already have an active buy order for this item. Cancel it before placing a new one." },
                { status: 409 },
            )
        }


        const totalCost = price * quantity

        if (buyer.cash < totalCost) {
            return Response.json({ error: "Insufficient balance" }, { status: 400 })
        }


        const matchable = await prisma.item_listing.findMany({
            where: {
                marketName,
                price: { lte: price },
                userId: { not: buyer.id },
            },
            orderBy: [{ price: "asc" }, { createdAt: "asc" }],
            take: quantity,
            include: {
                user: { select: { id: true, notificationEmail: true } },
            },
        })

        // Copies the buyer already owns must not count as the delivery.
        let ownedBefore: number | null = null

        if (matchable.length > 0 && matchable[0].commodity) {
            ownedBefore = await countInventoryItem(
                buyer.steam_id,
                matchable[0].game,
                marketName,
                buyer.steam_trade_url,
            )

            if (ownedBefore === null) {
                return Response.json(
                    { error: "Couldn't check your Steam inventory. Make sure it's public, then try again." },
                    { status: 503 },
                )
            }
        }


        let matched = 0
        let insufficient = false
        const sellerNotices = new Map<string, SellerNotice>()

        // The deduction, the matches and the standing order commit together, so a failure undoes all of them.
        try {
            await prisma.$transaction(async (tx) => {
                const deducted = await tx.user.updateMany({
                    where: { id: buyer.id, cash: { gte: totalCost } },
                    data: { cash: { decrement: totalCost } },
                })

                if (deducted.count === 0) {
                    insufficient = true
                    throw new Error("Insufficient balance")
                }


                for (const listing of matchable) {
                    // Skipped rather than failing the order, so it becomes part of the standing order instead.
                    const claimed = await tx.item_listing.deleteMany({ where: { id: listing.id } })

                    if (claimed.count === 0) {
                        continue
                    }


                    let buyerPreCount: number | null = null

                    // Each copy needs its own rise in the count, so one delivery can't settle several purchases.
                    if (listing.commodity && ownedBefore !== null) {
                        buyerPreCount = ownedBefore + matched
                    }


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
                            buyerPreCount,
                            buyerId: buyer.id,
                            sellerId: listing.userId,
                        },
                    })

                    // The trade clears at the listed price, so the rest of the bid goes back to the buyer.
                    const refund = price - listing.price

                    if (refund > 0.001) {
                        await tx.user.update({
                            where: { id: buyer.id },
                            data: { cash: { increment: refund } },
                        })
                    }


                    matched++

                    const sale = { marketName: listing.marketName, price: listing.price }
                    const notice = sellerNotices.get(listing.userId)

                    if (notice) {
                        notice.items.push(sale)
                    }
                    else {
                        sellerNotices.set(listing.userId, {
                            email: listing.user.notificationEmail,
                            items: [sale],
                        })
                    }
                }


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
        }
        catch (error) {
            if (insufficient) {
                return Response.json({ error: "Insufficient balance" }, { status: 400 })
            }


            throw error
        }


        for (const notice of sellerNotices.values()) {
            if (!notice.email) {
                continue
            }


            const plural = notice.items.length > 1 ? "s" : ""

            await resend.emails.send({
                from: "SkinSlinger <onboarding@skinslinger.com>",
                to: [notice.email],
                subject: `New sale — send your item${plural}`,
                react: PurchaseNotificationEmail({
                    buyerTradeUrl: buyer.steam_trade_url,
                    buyerName: buyer.name ?? buyer.email ?? "Buyer",
                    items: notice.items,
                }),
            })
        }


        return Response.json({ matched, remaining: quantity - matched })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
