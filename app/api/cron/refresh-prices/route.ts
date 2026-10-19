import { prisma } from "@/lib/db"
import { fetchItemPrice } from "@/lib/steam"

//

export const maxDuration = 300

// steamwebapi allows 20 requests a minute, shared with the live site.
const LOOKUP_INTERVAL_MS = 4000

// Stops before the function's time limit.
const TIME_BUDGET_MS = 240_000

//

export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET

    if (secret) {
        const auth = req.headers.get("authorization")

        if (auth !== `Bearer ${secret}`) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }
    }


    const dryRun = new URL(req.url).searchParams.has("dryRun")

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const listings = await prisma.item_listing.findMany({
        distinct: ["marketName"],
        select: { marketName: true },
    })

    const staleItems = await prisma.item.findMany({
        where: {
            updatedAt: { lt: sevenDaysAgo },
            marketName: { in: listings.map(listing => listing.marketName) },
        },
        select: { marketName: true, marketHashName: true, game: true },
    })

    // Random order, so a lookup that keeps failing can't block the rest.
    const queue = staleItems.sort(() => Math.random() - 0.5)

    const startedAt = Date.now()
    let updated = 0
    let failed = 0

    for (const item of queue) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) {
            break
        }


        const price = await fetchItemPrice(item.marketHashName, item.game)

        await new Promise(resolve => setTimeout(resolve, LOOKUP_INTERVAL_MS))

        if (price && price > 0) {
            if (!dryRun) {
                await prisma.item.update({
                    where: { marketName: item.marketName },
                    data: { price },
                })
            }


            updated++
        }
        else {
            failed++
        }
    }


    return Response.json({
        dryRun,
        updated,
        failed,
        remaining: queue.length - updated - failed,
    })
}
