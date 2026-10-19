import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { cache, Suspense } from "react"
import type { Metadata } from "next"
import BuyButton from "./BuyButton"
import FloatBar from "@/app/components/FloatBar"
import PriceHistory from "@/app/components/PriceHistory"
import { GAME_NAMES, GAME_SLUGS, getBaseUrl, JsonLd } from "@/app/lib/site"
import { RARITIES, rarityBackground } from "@/lib/rarity"

//

type Props = { params: Promise<{ slug: string; id: string }> }
type PageProps = Props & { searchParams: Promise<{ from?: string }> }
type Sticker = { stickerId: number; slot: number; name: string; image: string; wear: number | null }

function wearLabel(f: number): string {
    if (f < 0.07) {
        return 'Factory New'
    }
    else if (f < 0.15) {
        return 'Minimal Wear'
    }
    else if (f < 0.38) {
        return 'Field-Tested'
    }
    else if (f < 0.45) {
        return 'Well-Worn'
    }
    else {
        return 'Battle-Scarred'
    }
}

//

const getListing = cache(async (id: string) => {
    const listing = await prisma.item_listing.findUnique({ where: { id } })

    if (
        !listing
        || !listing.icon
        || !listing.hexColor
        || !listing.game
    ) {
        return null
    }


    const countQuery = listing.commodity
        ? prisma.item_listing.count({
            where: { marketName: listing.marketName, commodity: true },
        })
        : Promise.resolve(1)

    const sellerQuery = prisma.user.findUnique({
        where: { id: listing.userId },
        select: { steam_id: true, name: true, image: true },
    })

    // A skin's Steam inspect link is kept in its seller's inventory snapshot.
    const inspectQuery = listing.game === "CS2" && !listing.commodity
        ? prisma.$queryRaw<{ link: string | null }[]>`
            SELECT item->>'inspectLink' AS link
            FROM "user", jsonb_array_elements("inventoryCache"::jsonb) AS item
            WHERE "user".id = ${listing.userId} AND item->>'assetId' = ${listing.assetId}
            LIMIT 1
        `
        : Promise.resolve([])

    const [float, commodityCount, seller, inspectRows] = await Promise.all([
        prisma.item_float.findUnique({ where: { assetId: listing.assetId } }),
        countQuery,
        sellerQuery,
        inspectQuery,
    ])

    return {
        listing,
        float,
        commodityCount,
        seller,
        inspectLink: inspectRows[0]?.link ?? null,
    }
})

//

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug, id } = await params
    const data = await getListing(id)

    if (!data) {
        return {}
    }


    const { listing } = data
    const gameName = GAME_NAMES[listing.game!] ?? listing.game!
    const title = `${listing.marketName} - ${gameName} - SkinSlinger`
    const description = `Buy ${listing.marketName}. No KYC, 0% sales fee, pay with crypto. Your ${gameName} skin marketplace.`

    return {
        title,
        description,
        alternates: { canonical: `/item/${slug}` },
        openGraph: {
            title,
            description,
            url: `/item/${slug}/${id}`,
            images: [{ url: listing.icon!, alt: listing.marketName }],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [listing.icon!],
        },
    }
}

//

export default async function ItemPage({ params, searchParams }: PageProps) {
    const { slug, id } = await params
    const { from } = await searchParams
    const data = await getListing(id)

    if (!data) {
        notFound()
    }


    const { listing, float, commodityCount, seller, inspectLink } = data
    const gameName = GAME_NAMES[listing.game!] ?? listing.game!
    const gameSlug = GAME_SLUGS[listing.game!] ?? "cs2"

    const sellerSteamId = from === "profile" ? seller : null
    const stickers = float?.stickers as Sticker[] | null

    // CS2 commodities reuse these colours under other tier names, so only skins get a label.
    const hasRarityName = !(listing.game === "CS2" && listing.commodity)
    const rarityHex = listing.hexColor!.toLowerCase()
    const rarity = hasRarityName
        ? RARITIES[listing.game!]?.find(r => r.hex === rarityHex)
        : undefined

    const artStyle = {
        border: `1px solid #${listing.hexColor}`,
        background: rarityBackground(listing.hexColor!, 50),
    }

    const iconStyle = {
        width: 'auto',
        height: 'auto',
        maxHeight: '300px',
        filter: `drop-shadow(0 12px 24px #${listing.hexColor}66)`,
    }

    const base = getBaseUrl()

    const jsonLd = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": `${listing.marketName} - ${gameName}`,
        "url": `${base}/item/${slug}/${id}`,
        "image": listing.icon,
        "description": `Buy ${listing.marketName}. No KYC, 0% sales fee, pay with crypto.`,
        "offers": {
            "@type": "Offer",
            "price": listing.price.toFixed(2),
            "priceCurrency": "USD",
            "availability": "https://schema.org/InStock",
            "url": `${base}/item/${slug}/${id}`,
            "seller": {
                "@type": "Organization",
                "name": "SkinSlinger",
                "url": base,
            },
        },
    }

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
                "name": gameName,
                "item": `${base}/market/${gameSlug}`,
            },
            {
                "@type": "ListItem",
                "position": 3,
                "name": listing.marketName,
                "item": `${base}/item/${slug}`,
            },
            {
                "@type": "ListItem",
                "position": 4,
                "name": `$${listing.price.toFixed(2)}`,
                "item": `${base}/item/${slug}/${id}`,
            },
        ],
    }

    return (
        <div className="overflow-y-auto h-full pt-24 pb-12 px-4 flex justify-center">
            <div className="w-full max-w-4xl flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                    {sellerSteamId?.steam_id ? (
                        <Link
                            href={`/user/${sellerSteamId.steam_id}`}
                            className="text-sm text-gray-400 hover:text-white transition-colors"
                        >
                            ← Back to {sellerSteamId.name ?? "seller"}'s profile
                        </Link>
                    ) : (
                        <>
                            <Link
                                href={`/market/${gameSlug}`}
                                className="text-sm text-gray-400 hover:text-white transition-colors"
                            >
                                ← Back to {gameName} market
                            </Link>

                            <Link
                                href={`/item/${slug}`}
                                className="text-sm text-gray-400 hover:text-white transition-colors"
                            >
                                ← All {listing.marketName} listings
                            </Link>
                        </>
                    )}
                </div>

                <div className="flex flex-col md:flex-row gap-4">

                    {/* Item art */}
                    <div
                        className="bg-accent rounded-sm frame-shadow flex-1 min-h-72 md:min-h-112 flex items-center justify-center p-8"
                        style={artStyle}
                    >
                        <Image
                            src={listing.icon!}
                            alt={listing.marketName}
                            width={360}
                            height={360}
                            style={iconStyle}
                            priority
                        />
                    </div>

                    {/* Details and buy */}
                    <div className="bg-secondary rounded-sm frame-shadow p-6 flex flex-col gap-4 w-full md:w-88 shrink-0">
                        <div className="flex flex-col gap-2.5">
                            <h1 style={{ color: `#${listing.hexColor}` }} className="text-xl font-semibold">
                                {listing.marketName}
                            </h1>

                            <div className="flex flex-wrap gap-1.5 text-xs">
                                <span className="text-gray-400 bg-accent px-2 py-1 rounded-sm">
                                    {gameName}
                                </span>

                                {rarity && (
                                    <span style={{ color: `#${rarity.hex}` }} className="bg-accent px-2 py-1 rounded-sm">
                                        {rarity.label}
                                    </span>
                                )}

                                {float?.floatValue != null && (
                                    <span className="text-gray-400 bg-accent px-2 py-1 rounded-sm">
                                        {wearLabel(float.floatValue)}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-baseline justify-between border-t border-gray-700/60 pt-4">
                            <span className="text-sm text-gray-400">Price</span>

                            <span className="text-3xl font-semibold [font-family:var(--font-display)]">
                                ${listing.price.toFixed(2)}
                            </span>
                        </div>

                        {float?.floatValue != null && (
                            <div className="flex flex-col gap-1.5 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Float</span>

                                    <span className="font-mono">
                                        {float.floatValue.toFixed(10).replace(/0+$/, '')}
                                    </span>
                                </div>

                                <FloatBar value={float.floatValue} showLabels={false} />
                            </div>
                        )}

                        {float?.paintSeed != null && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Pattern</span>

                                <span>#{float.paintSeed}</span>
                            </div>
                        )}

                        {stickers && stickers.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                                <span className="text-sm text-gray-400">Stickers</span>

                                {stickers.map((s, i) => (
                                    <div key={i} className="flex items-center gap-2.5 bg-accent rounded-sm px-2 py-1.5">
                                        <Image
                                            src={s.image}
                                            alt={s.name}
                                            width={40}
                                            height={40}
                                            className="h-8 w-auto shrink-0"
                                        />

                                        <span className="text-xs truncate" title={s.name}>
                                            {s.name}
                                        </span>

                                        {s.wear ? (
                                            <span className="text-[11px] text-gray-500 ml-auto shrink-0">
                                                {Math.round(s.wear * 100)}% worn
                                            </span>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-auto pt-2 flex flex-col gap-4">
                            {seller?.steam_id && (
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-sm text-gray-400">Seller</span>

                                    <Link
                                        href={`/user/${seller.steam_id}`}
                                        className="flex items-center gap-2.5 bg-accent rounded-sm px-2 py-1.5 button"
                                    >
                                        {seller.image && (
                                            <Image
                                                src={seller.image}
                                                alt=""
                                                width={36}
                                                height={36}
                                                className="rounded-sm shrink-0"
                                            />
                                        )}

                                        <div className="flex flex-col min-w-0">
                                            <span className="text-sm truncate">
                                                {seller.name ?? "Seller"}
                                            </span>

                                            <span className="text-[11px] text-gray-500">
                                                Steam ID <span className="font-mono text-gray-400">{seller.steam_id}</span>
                                            </span>
                                        </div>
                                    </Link>
                                </div>
                            )}

                            <BuyButton
                                id={listing.id}
                                marketName={listing.marketName}
                                price={listing.price}
                                icon={listing.icon!}
                                hexColor={listing.hexColor!}
                                commodity={listing.commodity}
                                maxQuantity={commodityCount}
                            />

                            {/* Opens the item in CS2, so it's hidden on phones. */}
                            {inspectLink?.startsWith("steam://") && (
                                <a
                                    href={inspectLink}
                                    className="hidden md:flex -mt-2 h-10 rounded-sm bg-accent button text-sm items-center justify-center"
                                >
                                    Inspect in game
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                <Suspense fallback={null}>
                    <PriceHistory marketName={listing.marketName} game={listing.game!} />
                </Suspense>
            </div>

            <JsonLd data={jsonLd} />

            <JsonLd data={breadcrumbJsonLd} />
        </div>
    )
}
