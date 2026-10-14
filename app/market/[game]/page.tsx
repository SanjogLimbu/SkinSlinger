import { prisma } from "@/lib/db"
import HomeClient from "./Market"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import type { Metadata } from 'next'
import { toSlug, getBaseUrl, JsonLd } from "@/app/lib/site"

//

const PAGE_SIZE = 30

type GameConfig = {
    dbValue: string
    displayName: string
    slug: string
}

const GAMES: Record<string, GameConfig> = {
    cs2: {
        dbValue: "CS2", displayName: "CS2", slug: "cs2",
    },
    dota2: {
        dbValue: "Dota2", displayName: "Dota 2", slug: "dota2",
    },
    rust: {
        dbValue: "Rust", displayName: "Rust", slug: "rust",
    },
    tf2: {
        dbValue: "TF2", displayName: "TF2", slug: "tf2",
    },
}

const OG_IMAGE = { url: '/logo.png', width: 512, height: 512, alt: 'SkinSlinger' }

//

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
    const { game } = await params
    const config = GAMES[game]
    if (!config) return {}
    const title = config.displayName
    return {
        title,
        alternates: { canonical: `/market/${config.slug}` },
        openGraph: {
            title,
            url: `/market/${config.slug}`,
            images: [OG_IMAGE],
        },
        twitter: {
            card: 'summary',
            title,
            images: ['/logo.png'],
        },
    }
}

//

export default async function GameMarketPage({ params }: { params: Promise<{ game: string }> }) {
    const { game } = await params
    const config = GAMES[game]
    if (!config) notFound()

    const session = await getServerSession(authOptions)
    const currentUserId = session?.user?.id ?? null

    const hasPendingPurchase = currentUserId ? (await prisma.purchase.count({
        where: { buyerId: currentUserId, status: "pending" },
    })) > 0 : false

    const rows = await prisma.item_listing.findMany({
        take: PAGE_SIZE + 1,
        where: { game: config.dbValue },
        // Must match /api/listings exactly — the last id of this page is used as the
        // cursor for infinite scroll, so a different sort would skip/duplicate items.
        orderBy: [{ price: "desc" }, { id: "asc" }],
    })

    const page = rows.slice(0, PAGE_SIZE)
    const hasMore = rows.length > PAGE_SIZE

    const assetIds = page.map(l => l.assetId)
    const floatItems = await prisma.item_float.findMany({ where: { assetId: { in: assetIds } } })
    const floatMap = new Map(floatItems.map(i => [i.assetId, i]))

    const cards = page
        .filter(l => l.icon)
        .map(l => ({
            id: l.id,
            marketName: l.marketName,
            price: l.price,
            icon: l.icon!,
            hexColor: l.hexColor!,
            game: l.game ?? '',
            commodity: l.commodity,
            sellerId: l.userId,
            floatValue: floatMap.get(l.assetId)?.floatValue ?? null,
            paintSeed: floatMap.get(l.assetId)?.paintSeed ?? null,
            stickers: (floatMap.get(l.assetId)?.stickers ?? null) as { stickerId: number; slot: number; name: string; image: string; wear: number | null }[] | null,
        }))

    const base = getBaseUrl()

    const breadcrumbJsonLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": `${base}/` },
            { "@type": "ListItem", "position": 2, "name": config.displayName, "item": `${base}/market/${config.slug}` },
        ],
    }

    const seen = new Set<string>()
    const itemListJsonLd = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": `${config.displayName} Skins for Sale on SkinSlinger`,
        "url": `${getBaseUrl()}/market/${config.slug}`,
        "itemListElement": cards
            .filter(c => { const s = toSlug(c.marketName); if (seen.has(s)) return false; seen.add(s); return true; })
            .slice(0, 20)
            .map((c, i) => ({
                "@type": "ListItem",
                "position": i + 1,
                "name": c.marketName,
                "url": `${getBaseUrl()}/item/${toSlug(c.marketName)}`,
            })),
    }

    return (
        <>
            {/* Suspense boundary required: HomeClient reads the URL via useSearchParams */}
            <Suspense>
                <HomeClient
                    initialListings={cards}
                    initialHasMore={hasMore}
                    currentUserId={currentUserId}
                    hasPendingPurchase={hasPendingPurchase}
                    initialGame={config.dbValue as "CS2" | "Dota2" | "Rust" | "TF2"}
                />
            </Suspense>
            <JsonLd data={itemListJsonLd} />
            <JsonLd data={breadcrumbJsonLd} />
        </>
    )
}
