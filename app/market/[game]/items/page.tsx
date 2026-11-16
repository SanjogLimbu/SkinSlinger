import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { GAME_NAMES, GAME_SLUGS, toSlug } from "@/app/lib/site"

//

type Props = { params: Promise<{ game: string }> }

// The market grid loads most items by infinite scroll, which crawlers don't follow, so this page links them all.
export const revalidate = 3600
export const dynamicParams = false

//

function findGame(slug: string) {
    const dbValue = Object.keys(GAME_SLUGS).find(key => GAME_SLUGS[key] === slug)

    if (!dbValue) {
        return null
    }


    return {
        dbValue,
        slug,
        name: GAME_NAMES[dbValue],
    }
}

//

export function generateStaticParams() {
    return Object.values(GAME_SLUGS).map(game => ({ game }))
}


export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { game } = await params
    const config = findGame(game)

    if (!config) {
        return {}
    }


    const title = `All ${config.name} Items A-Z`
    const description = `Every ${config.name} item currently listed on SkinSlinger, with its lowest price and number of listings.`

    return {
        title,
        description,
        alternates: { canonical: `/market/${config.slug}/items` },
        openGraph: {
            title,
            description,
            url: `/market/${config.slug}/items`,
        },
    }
}

//

export default async function GameItemsPage({ params }: Props) {
    const { game } = await params
    const config = findGame(game)

    if (!config) {
        notFound()
    }


    const groups = await prisma.item_listing.groupBy({
        by: ["marketName"],
        where: { game: config.dbValue },
        _min: { price: true },
        _count: { _all: true },
        orderBy: { marketName: "asc" },
    })

    return (
        <div className="overflow-y-auto h-full pt-24 pb-12 px-4 flex justify-center">
            <div className="w-full max-w-4xl flex flex-col gap-4">
                <Link
                    href={`/market/${config.slug}`}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                    ← Back to {config.name} market
                </Link>

                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-semibold">
                        All {config.name} items
                    </h1>

                    <p className="text-sm text-gray-400">
                        {groups.length} items listed, sorted A-Z.
                    </p>
                </div>

                <ul className="bg-secondary rounded-sm frame-shadow divide-y divide-gray-700/60">
                    {groups.map(g => (
                        <li key={g.marketName}>
                            <Link
                                href={`/item/${toSlug(g.marketName)}`}
                                className="flex justify-between gap-4 px-4 py-2 text-sm hover:bg-accent"
                            >
                                <span className="truncate">
                                    {g.marketName}
                                </span>

                                <span className="shrink-0 text-gray-400">
                                    {g._count._all > 1 ? `${g._count._all} from ` : ""}${(g._min.price ?? 0).toFixed(2)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}
