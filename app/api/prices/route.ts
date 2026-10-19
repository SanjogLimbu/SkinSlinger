import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchItemPrice } from '@/lib/steam'
import { prisma } from '@/lib/db'

//

type PriceRequest = { market_name: string, market_hash_name: string, game: string }

//

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }


    let items: PriceRequest[]

    try {
        ({ items } = await request.json())
    }
    catch {
        return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }


    if (!Array.isArray(items) || items.length === 0) {
        return Response.json({ error: 'items must be a non-empty array' }, { status: 400 })
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
                    await prisma.item.upsert({
                        where: { marketName: item.market_name },
                        update: { price },
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
