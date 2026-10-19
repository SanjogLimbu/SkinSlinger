import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import ProfileClient from "./ProfileClient"

//

export default async function Profile() {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        redirect("/")
    }


    const [user, purchaseCount, saleCount, listings] = await Promise.all([
        prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                sales: true,
                purchases: true,
                createdAt: true,
                steam_id: true,
                name: true,
                image: true,
            },
        }),
        prisma.purchase.count({ where: { buyerId: session.user.id, status: "completed" } }),
        prisma.purchase.count({ where: { sellerId: session.user.id, status: "completed" } }),
        prisma.item_listing.findMany({
            where: { userId: session.user.id },
            select: {
                id: true,
                assetId: true,
                marketName: true,
                price: true,
                icon: true,
                hexColor: true,
                game: true,
                commodity: true,
            },
            orderBy: { price: "desc" },
        }),
    ])

    const assetIds = listings.map(l => l.assetId)

    const floats = listings.length > 0
        ? await prisma.item_float.findMany({
            where: { assetId: { in: assetIds } },
            select: { assetId: true, floatValue: true, stickers: true },
        })
        : []

    const floatMap = new Map(floats.map(f => [f.assetId, f]))

    const listingsWithFloat = listings.map(l => {
        const float = floatMap.get(l.assetId)

        return {
            ...l,
            floatValue: float?.floatValue ?? null,
            stickers: float?.stickers ?? null,
        }
    })

    return (
        <ProfileClient
            sales={user?.sales ?? 0}
            purchases={user?.purchases ?? 0}
            saleCount={saleCount}
            purchaseCount={purchaseCount}
            createdAt={user?.createdAt ?? new Date()}
            steamId={user?.steam_id ?? null}
            listings={listingsWithFloat}
            name={user?.name ?? null}
            image={user?.image ?? null}
        />
    )
}
