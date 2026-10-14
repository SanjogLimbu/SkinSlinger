import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import OrdersClient from "./OrdersClient"
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'My Orders',
    robots: { index: false, follow: false },
}

//

export default async function OrdersPage() {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) redirect("/")

    const userId = session.user.id

    const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { notificationEmail: true, pendingEmail: true },
    })

    const rows = await prisma.purchase.findMany({
        where: {
            OR: [
                { buyerId: userId },
                { sellerId: userId },
            ],
        },
        include: {
            buyer: { select: { name: true, image: true, steam_trade_url: true } },
            seller: { select: { name: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
    })

    // Build a sanitized DTO — never ship counterparty emails to the client
    // (anything passed to a client component is readable in the RSC payload,
    // even if it's never rendered). The buyer's trade URL is only needed by
    // the seller, to send the trade offer.
    const purchases = rows.map(p => ({
        id: p.id,
        createdAt: p.createdAt,
        deliveredAt: p.deliveredAt,
        tradeOfferSentAt: p.tradeOfferSentAt,
        status: p.status,
        price: p.price,
        marketName: p.marketName,
        icon: p.icon,
        hexColor: p.hexColor,
        commodity: p.commodity,
        buyerId: p.buyerId,
        sellerId: p.sellerId,
        buyerName: p.buyer.name,
        sellerName: p.seller.name,
        buyerImage: p.buyer.image,
        sellerImage: p.seller.image,
        buyerTradeUrl: p.sellerId === userId ? (p.buyerTradeUrl ?? p.buyer.steam_trade_url) : null,
    }))

    return (
        <OrdersClient
            purchases={purchases}
            currentUserId={userId}
            notificationEmail={me?.notificationEmail ?? null}
            pendingEmail={me?.pendingEmail ?? null}
        />
    )
}
