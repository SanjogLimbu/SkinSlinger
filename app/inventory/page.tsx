import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Prisma } from "@/lib/generated/prisma/client"
import { redirect } from "next/navigation"
import { getInventory, checkCanTrade, SteamSticker } from '@/lib/steam'
import { SteamItem } from "@/lib/steam"
import { signInventoryToken } from "@/lib/inventoryToken"
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'My Inventory',
    robots: { index: false, follow: false },
}

import InventoryClient from "./InventoryClient"
import TradeRestrictedClient from "./TradeRestrictedClient"

//

export default async function Inventory() {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
        redirect("/")
    }


    const user = await prisma.user.findUnique({
        where: { email: session.user!.email! },
    })

    if (!user) {
        redirect("/")
    }


    if (user.steam_id) {
        const { allowed, reason } = await checkCanTrade(user.steam_id, user.steam_trade_url)

        if (!allowed) {
            return <TradeRestrictedClient reason={reason} />
        }
    }


    const COOLDOWN_MS = 20 * 60 * 1000
    const now = new Date()
    const lastRefresh = user.lastInventoryRefresh
    const cacheValid = lastRefresh && now.getTime() - lastRefresh.getTime() < COOLDOWN_MS

    let rawInventory: SteamItem[] = []

    if (user.steam_id) {
        if (cacheValid && user.inventoryCache) {
            rawInventory = user.inventoryCache as SteamItem[]
        }
        else {
            const fetched = await getInventory(user.steam_id)

            if (fetched.length > 0) {
                const byAssetId = new Map(fetched.map(i => [i.assetId, i]))
                rawInventory = [...byAssetId.values()]

                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        lastInventoryRefresh: now,
                        inventoryCache: rawInventory as any,
                    },
                })
            }
        }
    }


    const [listings, pendingSales] = await Promise.all([
        prisma.item_listing.findMany({
            where: { userId: user.id },
            select: { assetId: true },
        }),
        prisma.purchase.findMany({
            where: { sellerId: user.id, status: { in: ['pending', 'holding'] } },
            select: { assetId: true },
        }),
    ])

    const listedIds = listings.map(l => l.assetId)
    const pendingSaleIds = pendingSales.map(p => p.assetId)
    const listedAssetIds = new Set([...listedIds, ...pendingSaleIds])


    // Float data comes straight from steamwebapi's inventory, so it's cached here.
    const floatCandidates = rawInventory.filter(i => {
        const isSkin = i.game === 'CS2' && !i.commodity

        return isSkin && !listedAssetIds.has(i.assetId) && i.floatValue !== null
    })

    if (floatCandidates.length > 0) {
        const upserts = floatCandidates.map(item => prisma.item_float.upsert({
            where: { assetId: item.assetId },
            update: {
                floatValue: item.floatValue,
                paintSeed: item.paintSeed,
                stickers: item.stickers ?? Prisma.JsonNull,
                fetchedAt: new Date(),
            },
            create: {
                assetId: item.assetId,
                floatValue: item.floatValue,
                paintSeed: item.paintSeed,
                stickers: item.stickers ?? Prisma.JsonNull,
            },
        }))

        // One transaction, since parallel upserts exhaust the connection pool on large inventories.
        await prisma.$transaction(upserts)
    }


    const floatRows = await prisma.item_float.findMany({
        where: { assetId: { in: rawInventory.map(i => i.assetId) } },
    })
    const floatMap = new Map(floatRows.map(f => [f.assetId, f]))

    const names = rawInventory.map(i => i.market_name)
    const prices = await prisma.item.findMany({
        where: { marketName: { in: names } },
    })
    const priceMap = new Map(prices.map(p => [p.marketName, p.price]))

    const unlisted = rawInventory.filter(item => !listedAssetIds.has(item.assetId))
    const inventoryWithPrices = unlisted.map(item => {
        const f = floatMap.get(item.assetId)

        return {
            ...item,
            price: priceMap.get(item.market_name) ?? 0,
            floatValue: f?.floatValue ?? null,
            paintSeed: f?.paintSeed ?? null,
            stickers: (f?.stickers ?? null) as SteamSticker[] | null,
        }
    })


    // Lets the listings API check that the seller owned these items when the page loaded.
    const tokenItems = rawInventory.map(i => ({
        assetId: i.assetId,
        marketName: i.market_name,
    }))
    const inventoryToken = await signInventoryToken(user.id, tokenItems)

    const isSteamLinked = !!(user?.steam_id && user?.steam_trade_url)

    return (
        <InventoryClient
            isSteamLinked={isSteamLinked}
            hasNotificationEmail={!!user.notificationEmail}
            inventory={inventoryWithPrices}
            lastRefresh={cacheValid ? user.lastInventoryRefresh! : now}
            inventoryToken={inventoryToken}
        />
    )
}
