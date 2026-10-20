import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchItemPrice, SteamItem } from '@/lib/steam'
import { prisma } from '@/lib/db'
import { stickerMarketName } from '@/lib/pricing'

//

type PriceRequest = { market_name: string, market_hash_name: string, game: string }

//

// Names come from the user's own inventory snapshot, so a request can't store one item's price under another's name.
function ownedPriceRequests(inventory: SteamItem[]): Map<string, PriceRequest> {
    const owned = new Map<string, PriceRequest>()

    for (const item of inventory) {
        owned.set(item.market_name, {
            market_name: item.market_name,
            market_hash_name: item.market_hash_name,
            game: item.game,
        })

        for (const sticker of item.stickers ?? []) {
            const name = stickerMarketName(sticker.name)

            owned.set(name, {
                market_name: name,
                market_hash_name: name,
                game: 'CS2',
            })
        }
    }


    return owned
}


export async function POST(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }


    let requested: PriceRequest[]

    try {
        ({ items: requested } = await request.json())
    }
    catch {
        return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }


    if (!Array.isArray(requested) || requested.length === 0) {
        return Response.json({ error: 'items must be a non-empty array' }, { status: 400 })
    }


    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { inventoryCache: true },
    })

    const owned = ownedPriceRequests((user?.inventoryCache ?? []) as SteamItem[])
    const items: PriceRequest[] = []
    const seen = new Set<string>()

    // Each name is looked up once, so a repeated name can't spend the steamwebapi quota again.
    for (const item of requested) {
        const ownedItem = owned.get(item?.market_name)

        if (!ownedItem || seen.has(ownedItem.market_name)) {
            continue
        }


        seen.add(ownedItem.market_name)
        items.push(ownedItem)
    }


    const encoder = new TextEncoder()

    const weekAgoUtc = new Date()
    weekAgoUtc.setDate(weekAgoUtc.getDate() - 7)
    weekAgoUtc.setUTCHours(0, 0, 0, 0)

    const marketNames = items.map(item => item.market_name)
    const cached = await prisma.item.findMany({
        where: { marketName: { in: marketNames } },
        select: { marketName: true, price: true, updatedAt: true },
    })
    const cacheMap = new Map(cached.map(c => [c.marketName, c]))

    const stream = new ReadableStream({
        async start(controller) {
            function send(marketName: string, price: number) {
                const line = JSON.stringify({ market_name: marketName, price }) + '\n'

                controller.enqueue(encoder.encode(line))
            }


            await Promise.all(items.map(async item => {
                const hit = cacheMap.get(item.market_name)

                // A cached price of 0 is a failed lookup, so it isn't trusted.
                if (hit && hit.price > 0 && hit.updatedAt >= weekAgoUtc) {
                    send(item.market_name, hit.price)

                    return
                }


                const price = await fetchItemPrice(item.market_hash_name, item.game) ?? 0

                if (price > 0) {
                    // The hash name is rewritten too, so a row stored under a wrong one is repaired.
                    await prisma.item.upsert({
                        where: { marketName: item.market_name },
                        update: {
                            price,
                            marketHashName: item.market_hash_name,
                            game: item.game,
                        },
                        create: {
                            marketName: item.market_name,
                            marketHashName: item.market_hash_name,
                            price,
                            game: item.game,
                        },
                    })
                }


                send(item.market_name, price)
            }))

            controller.close()
        }
    })

    return new Response(stream, {
        headers: { 'Content-Type': 'application/x-ndjson' }
    })
}
