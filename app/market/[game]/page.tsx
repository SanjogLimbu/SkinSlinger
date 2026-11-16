import { prisma } from "@/lib/db"
import HomeClient, { type ListingCard } from "./Market"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import type { Metadata } from 'next'
import Link from "next/link"
import { toSlug, getBaseUrl, JsonLd } from "@/app/lib/site"
import { posts, type GameSlug } from "@/app/blog/posts"

//

const PAGE_SIZE = 30

type GameConfig = {
    dbValue: string
    displayName: string
    slug: GameSlug
    title: string
    description: string
    heading: string
    intro: string
}

type Props = { params: Promise<{ game: string }> }

const GAMES: Record<string, GameConfig> = {
    cs2: {
        dbValue: "CS2",
        displayName: "CS2",
        slug: "cs2",
        title: "Buy & Sell CS2 Skins with Crypto",
        description: "Buy and sell CS2 skins peer-to-peer with USDC. 0% sales fee, no KYC, and every payment held until the skin reaches the buyer's Steam inventory.",
        heading: "CS2 Skins Marketplace",
        intro: "Buy and sell Counter-Strike 2 skins directly with other players. Pay with USDC on Polygon, see the float, pattern and stickers on each listing, and pay no sales fee. Your payment is held until the skin is confirmed in your inventory.",
    },
    dota2: {
        dbValue: "Dota2",
        displayName: "Dota 2",
        slug: "dota2",
        title: "Buy & Sell Dota 2 Items with Crypto",
        description: "Buy and sell Dota 2 items peer-to-peer with USDC. 0% sales fee, no KYC, and every payment held until the item reaches the buyer's Steam inventory.",
        heading: "Dota 2 Items Marketplace",
        intro: "Buy and sell Dota 2 items directly with other players. Pay with USDC on Polygon and pay no sales fee. Your payment is held until the item is confirmed in your inventory.",
    },
    rust: {
        dbValue: "Rust",
        displayName: "Rust",
        slug: "rust",
        title: "Buy & Sell Rust Skins with Crypto",
        description: "Buy and sell Rust skins peer-to-peer with USDC. 0% sales fee, no KYC, and every payment held until the skin reaches the buyer's Steam inventory.",
        heading: "Rust Skins Marketplace",
        intro: "Buy and sell Rust skins directly with other players. Pay with USDC on Polygon and pay no sales fee. Your payment is held until the skin is confirmed in your inventory.",
    },
    tf2: {
        dbValue: "TF2",
        displayName: "TF2",
        slug: "tf2",
        title: "Buy & Sell TF2 Items with Crypto",
        description: "Buy and sell Team Fortress 2 items peer-to-peer with USDC. 0% sales fee, no KYC, and every payment held until the item reaches the buyer's Steam inventory.",
        heading: "TF2 Items Marketplace",
        intro: "Buy and sell Team Fortress 2 items directly with other players. Pay with USDC on Polygon and pay no sales fee. Your payment is held until the item is confirmed in your inventory.",
    },
}

const OG_IMAGE = {
    url: '/logo.png',
    width: 251,
    height: 251,
    alt: 'SkinSlinger',
}

//

function MarketHeader({ config }: { config: GameConfig }) {
    return (
        <div className="flex flex-col gap-1 mb-3">
            <h1 className="text-lg font-semibold">
                {config.heading}
            </h1>

            <p className="text-xs text-gray-400 max-w-3xl">
                {config.intro}{" "}

                <Link
                    href={`/market/${config.slug}/items`}
                    className="text-gray-200 hover:underline"
                >
                    Browse every {config.displayName} item A-Z
                </Link>
            </p>
        </div>
    )
}


function MarketFooter({ config }: { config: GameConfig }) {
    const guides = posts.filter(p => p.games.includes(config.slug))

    if (!guides.length) {
        return null
    }


    return (
        <div className="flex flex-col gap-2 mt-6 pt-4 border-t border-gray-800">
            <h2 className="text-sm font-semibold">
                {config.displayName} guides
            </h2>

            <ul className="flex flex-col gap-1.5 text-xs">
                {guides.map(p => (
                    <li key={p.slug}>
                        <Link
                            href={`/blog/${p.slug}`}
                            className="text-gray-400 hover:text-white hover:underline"
                        >
                            {p.title}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    )
}

//

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { game } = await params
    const config = GAMES[game]

    if (!config) {
        return {}
    }


    const { title, description } = config

    return {
        title,
        description,
        alternates: { canonical: `/market/${config.slug}` },
        openGraph: {
            title,
            description,
            url: `/market/${config.slug}`,
            images: [OG_IMAGE],
        },
        twitter: {
            card: 'summary',
            title,
            description,
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
                    header={<MarketHeader config={config} />}
                    footer={<MarketFooter config={config} />}
                />
            </Suspense>

            <JsonLd data={itemListJsonLd} />

            <JsonLd data={breadcrumbJsonLd} />
        </>
    )
}
