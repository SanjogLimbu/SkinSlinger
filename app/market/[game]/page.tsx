import { prisma } from "@/lib/db"
import HomeClient, { type ListingCard } from "./Market"
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

type Props = { params: Promise<{ game: string }> }

const GAMES: Record<string, GameConfig> = {
    cs2: {
        dbValue: "CS2",
        displayName: "CS2",
        slug: "cs2",
    },
    dota2: {
        dbValue: "Dota2",
        displayName: "Dota 2",
        slug: "dota2",
    },
    rust: {
        dbValue: "Rust",
        displayName: "Rust",
        slug: "rust",
    },
    tf2: {
        dbValue: "TF2",
        displayName: "TF2",
        slug: "tf2",
    },
}

const OG_IMAGE = {
    url: '/logo.png',
    width: 512,
    height: 512,
    alt: 'SkinSlinger',
}

//

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { game } = await params
    const config = GAMES[game]

    if (!config) {
        return {}
    }


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

export default async function GameMarketPage({ params }: Props) {
    const { game } = await params
    const config = GAMES[game]

    if (!config) {
        notFound()
    }


    const session = await getServerSession(authOptions)
    const currentUserId = session?.user?.id ?? null

    let hasPendingPurchase = false

    if (currentUserId) {
        const pendingCount = await prisma.purchase.count({
            where: { buyerId: currentUserId, status: "pending" },
        })

        hasPendingPurchase = pendingCount > 0
    }


    const rows = await prisma.item_listing.findMany({
        take: PAGE_SIZE + 1,
        where: { game: config.dbValue },
        // Must match /api/listings, since this page's last id is the cursor for infinite scroll.
        orderBy: [{ price: "desc" }, { id: "asc" }],
    })

    const page = rows.slice(0, PAGE_SIZE)
    const hasMore = rows.length > PAGE_SIZE

    const assetIds = page.map(l => l.assetId)
    const floatItems = await prisma.item_float.findMany({
        where: { assetId: { in: assetIds } },
    })
    const floatMap = new Map(floatItems.map(i => [i.assetId, i]))

    const withIcons = page.filter(l => l.icon)
    const cards = withIcons.map(l => {
        const float = floatMap.get(l.assetId)

        return {
            id: l.id,
            marketName: l.marketName,
            price: l.price,
            icon: l.icon!,
            hexColor: l.hexColor!,
            game: l.game ?? '',
            commodity: l.commodity,
            sellerId: l.userId,
            floatValue: float?.floatValue ?? null,
            paintSeed: float?.paintSeed ?? null,
            stickers: (float?.stickers ?? null) as ListingCard["stickers"],
        }
    })

    const base = getBaseUrl()

    const breadcrumbJsonLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": `${base}/`,
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": config.displayName,
                "item": `${base}/market/${config.slug}`,
            },
        ],
    }


    // One entry per item page, since several listings can share a name.
    const uniqueCards: typeof cards = []
    const seen = new Set<string>()

    for (const card of cards) {
        const slug = toSlug(card.marketName)

        if (seen.has(slug)) {
            continue
        }


        seen.add(slug)
        uniqueCards.push(card)
    }


    const topCards = uniqueCards.slice(0, 20)
    const listedItems = topCards.map((c, i) => ({
        "@type": "ListItem",
        "position": i + 1,
        "name": c.marketName,
        "url": `${getBaseUrl()}/item/${toSlug(c.marketName)}`,
    }))

    const itemListJsonLd = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": `${config.displayName} Skins for Sale on SkinSlinger`,
        "url": `${getBaseUrl()}/market/${config.slug}`,
        "itemListElement": listedItems,
    }

    return (
        <>
            {/* HomeClient reads the URL with useSearchParams, which needs a Suspense boundary. */}
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
