import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import ProfileClient from "@/app/profile/ProfileClient"

//

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params

    const user = await prisma.user.findFirst({
        where: { steam_id: id },
        select: { name: true },
    })

    if (!user) {
        return {}
    }


    return {
        title: `${user.name ?? "Trader"}'s Profile`,
        robots: { index: false, follow: false },
    }
}

//

export default async function PublicProfile({ params }: Props) {
    const { id } = await params

    const user = await prisma.user.findFirst({
        where: { steam_id: id },
        select: {
            id: true,
            name: true,
            image: true,
            createdAt: true,
            steam_id: true,
        },
    })

    if (!user) {
        redirect("/")
    }


    // Volume comes from completed trades, since the user's sales and purchases columns are never updated.
    const [bought, sold, listings] = await Promise.all([
        prisma.purchase.aggregate({
            where: { buyer: { steam_id: id }, status: "completed" },
            _count: true,
            _sum: { price: true },
        }),
        prisma.purchase.aggregate({
            where: { seller: { steam_id: id }, status: "completed" },
            _count: true,
            _sum: { price: true },
        }),
        prisma.item_listing.findMany({
            where: { userId: user.id },
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
            orderBy: { createdAt: "desc" },
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
            name={user.name ?? null}
            image={user.image ?? null}
            sales={sold._sum.price ?? 0}
            purchases={bought._sum.price ?? 0}
            saleCount={sold._count}
            purchaseCount={bought._count}
            createdAt={user.createdAt}
            steamId={user.steam_id ?? null}
            listings={listingsWithFloat}
        />
    )
}
