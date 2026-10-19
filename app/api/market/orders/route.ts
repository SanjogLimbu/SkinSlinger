import { prisma } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

//

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const marketName = searchParams.get("marketName")

        if (!marketName) {
            return Response.json({ error: "marketName required" }, { status: 400 })
        }


        const session = await getServerSession(authOptions)
        const userId = session?.user?.id ?? null

        const [listings, buyOrders, myBuyOrders] = await Promise.all([
            prisma.item_listing.findMany({
                where: { marketName },
                orderBy: { price: "asc" },
                select: { price: true },
            }),
            prisma.buy_order.findMany({
                where: { marketName },
                orderBy: { price: "desc" },
                select: { price: true, quantity: true },
            }),
            userId ? prisma.buy_order.findMany({
                where: { marketName, userId },
                orderBy: { createdAt: "desc" },
                select: { id: true, price: true, quantity: true },
            }) : Promise.resolve([]),
        ])

        const sellMap = new Map<number, number>()

        for (const l of listings) {
            sellMap.set(l.price, (sellMap.get(l.price) ?? 0) + 1)
        }


        const sellOrders = Array.from(sellMap, ([price, quantity]) => ({ price, quantity }))
        sellOrders.sort((a, b) => a.price - b.price)

        const buyMap = new Map<number, number>()

        for (const o of buyOrders) {
            buyMap.set(o.price, (buyMap.get(o.price) ?? 0) + o.quantity)
        }


        const buyOrderLevels = Array.from(buyMap, ([price, quantity]) => ({ price, quantity }))
        buyOrderLevels.sort((a, b) => b.price - a.price)

        return Response.json({
            sellOrders,
            buyOrders: buyOrderLevels,
            myBuyOrders,
        })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
