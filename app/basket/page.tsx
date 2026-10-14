import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import BasketClient from "./BasketClient"
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Basket',
    robots: { index: false, follow: false },
}

//

export default async function BasketPage() {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id ?? null

    const hasPendingPurchase = userId ? (await prisma.purchase.count({
        where: { buyerId: userId, status: "pending" },
    })) > 0 : false

    return <BasketClient hasPendingPurchase={hasPendingPurchase} />
}
