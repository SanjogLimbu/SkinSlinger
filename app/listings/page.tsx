import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import ListingsClient from "./ListingsClient"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "My Listings",
    robots: { index: false, follow: false },
}

//

export default async function ListingsPage() {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        redirect("/")
    }


    const activePurchases = await prisma.purchase.findMany({
        where: { sellerId: session.user.id, status: "pending" },
        select: { assetId: true },
    })
    const lockedAssetIds = new Set(activePurchases.map(p => p.assetId))

    const rows = await prisma.item_listing.findMany({
        where: { userId: session.user.id },
        orderBy: { price: "desc" },
    })

    const nonCommodities = rows.filter(l => !l.commodity)
    const nonCommodityAssetIds = nonCommodities.map(l => l.assetId)
    const floatRows = nonCommodityAssetIds.length > 0
        ? await prisma.item_float.findMany({
            where: { assetId: { in: nonCommodityAssetIds } },
            select: { assetId: true, floatValue: true, paintSeed: true },
        })
        : []
    const floatMap = new Map(floatRows.map(f => [f.assetId, f]))

    const unlocked = rows.filter(l => !lockedAssetIds.has(l.assetId))
    const listings = unlocked.map(l => {
        const float = floatMap.get(l.assetId)

        return {
            id: l.id,
            assetId: l.assetId,
            marketName: l.marketName,
            price: l.price,
            game: l.game,
            icon: l.icon,
            hexColor: l.hexColor,
            commodity: l.commodity,
            floatValue: float?.floatValue ?? null,
            paintSeed: float?.paintSeed ?? null,
        }
    })

    return <ListingsClient listings={listings} />
}
