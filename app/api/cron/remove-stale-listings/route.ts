import { prisma } from "@/lib/db"
import { fetchOwnedAssetIds } from "@/lib/steam"

//

export const maxDuration = 300

// steamwebapi allows 20 requests a minute, shared with the live site, so lookups are spaced out
const LOOKUP_INTERVAL_MS = 4000

// Stop starting lookups before the function's time limit; sellers not reached wait for a later run
const TIME_BUDGET_MS = 240_000

type SellerGame = { steamId: string, game: string, listings: { id: string, assetId: string }[] }

//

// Groups every listing by seller and game, since one inventory lookup covers each group.
// The game is read from the asset id, which is always `${game}:${assetid}`.
async function loadListingsBySellerGame(): Promise<SellerGame[]> {
    const listings = await prisma.item_listing.findMany({
        select: { id: true, assetId: true, user: { select: { steam_id: true } } },
    })
    const groups = new Map<string, SellerGame>()

    for (const listing of listings) {
        const steamId = listing.user.steam_id
        const game = listing.assetId.split(":")[0]

        if (!steamId) continue

        const key = `${steamId}:${game}`
        const group = groups.get(key) ?? { steamId, game, listings: [] }

        group.listings.push({ id: listing.id, assetId: listing.assetId })
        groups.set(key, group)
    }

    return [...groups.values()]
}


// Removes listings whose item is no longer in the seller's Steam inventory (sold or traded elsewhere). 
// A seller whose inventory can't be read is skipped.
export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET

    if (secret) {
        const auth = req.headers.get("authorization")

        if (auth !== `Bearer ${secret}`) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }
    }

    
    try {
        const dryRun = new URL(req.url).searchParams.has("dryRun")
        const startedAt = Date.now()
        const staleListingIds: string[] = []
        let checked = 0
        let skipped = 0

        
        // Random order, so if one run can't reach every seller, a different set is reached each day
        const groups = (await loadListingsBySellerGame()).sort(() => Math.random() - 0.5)

        for (const group of groups) {
            if (Date.now() - startedAt > TIME_BUDGET_MS) {
                skipped += group.listings.length

                continue
            }


            const ownedAssetIds = await fetchOwnedAssetIds(group.steamId, group.game)

            await new Promise(resolve => setTimeout(resolve, LOOKUP_INTERVAL_MS))

            if (ownedAssetIds === null) {
                skipped += group.listings.length

                continue
            }


            checked += group.listings.length

            for (const listing of group.listings) {
                if (!ownedAssetIds.has(listing.assetId)) staleListingIds.push(listing.id)
            }
        }

        if (!dryRun && staleListingIds.length > 0) {
            await prisma.item_listing.deleteMany({ where: { id: { in: staleListingIds } } })
        }


        return Response.json({ dryRun, checked, skipped, stale: staleListingIds.length })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
