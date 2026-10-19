import { unstable_cache } from "next/cache"
import { fetchPriceHistory } from "@/lib/steam"
import PriceHistoryChart from "./PriceHistoryChart"

//

const WEEK_SECONDS = 7 * 24 * 60 * 60

// Cached for a week, since steamwebapi's rate limit is shared with the live site.
const getPriceHistory = unstable_cache(
    fetchPriceHistory,
    ["price-history"],
    { revalidate: WEEK_SECONDS },
)

//

export default async function PriceHistory({ marketName, game }: {
    marketName: string,
    game: string,
}) {
    // steamwebapi only has this history for CS2.
    if (game !== "CS2") {
        return null
    }


    // A failed lookup isn't cached, so the next view retries.
    const points = await getPriceHistory(marketName).catch(() => [])

    if (points.length < 2) {
        return null
    }


    return <PriceHistoryChart points={points} />
}
