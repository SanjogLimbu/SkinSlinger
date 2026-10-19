const base_url = "https://www.steamwebapi.com"
const api_key = process.env.STEAM_WEB_KEY!

const game_slugs: Record<string, string> = {
    "CS2": "cs2",
    "Dota2": "dota",
    "Rust": "rust",
    "TF2": "tf2",
}

export type SteamSticker = {
    stickerId: number
    slot: number
    name: string
    image: string
    wear: number | null
}

export type SteamItem = {
    assetId: string,
    market_name: string,
    market_hash_name: string,
    icon: string,
    tradable: boolean,
    type: string,
    price: number,
    hexColor: string,
    game: string,
    commodity: boolean,
    inspectLink: string | null,
    floatValue: number | null,
    paintSeed: number | null,
    stickers: SteamSticker[] | null,
}

export const STEAM_APP_IDS: Record<string, number> = {
    CS2: 730,
    Dota2: 570,
    Rust: 252490,
    TF2: 440,
}

export type PricePoint = { date: string, price: number }

export type VerifyResult = "has_item" | "no_item" | "private" | "error"

type TradeCheck = { allowed: boolean, reason: string | null }

type RawInventoryItem = {
    assetid: string
    tradable?: boolean
    marketname: string
    markethashname: string
    image: string
    itemtype?: string
    inspectlink?: string
    color?: string
    bordercolor?: string
    tags?: { category: string, color?: string }[]
    float?: {
        paintindex?: number
        floatvalue?: number
        paintseed?: number
        stickers?: SteamSticker[]
    }
}

type InventoryPages = { items: RawInventoryItem[], complete: boolean }

type InventoryEntry = {
    marketname?: string
    float?: { floatvalue?: number, paintseed?: number }
}

//

const tradeCache = new Map<string, TradeCheck & { at: number }>()
const TRADE_CACHE_TTL = 60 * 60 * 1000 // 1 hour
const TRADE_URL_PATTERN = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=(\d+)&token=[a-zA-Z0-9_-]+$/

const PRICE_HISTORY_DAYS = 180

// Steam caps a page at 2000 items, and the next page starts at the last_assetid header.
const INVENTORY_PAGE_SIZE = 2000
const MAX_INVENTORY_PAGES = 25

//

// Fails open, so a steamwebapi outage doesn't block every trade.
export async function checkCanTrade(steamId: string, tradeUrl?: string | null): Promise<TradeCheck> {
    const cached = tradeCache.get(steamId)

    if (cached && Date.now() - cached.at < TRADE_CACHE_TTL) {
        return {
            allowed: cached.allowed,
            reason: cached.reason,
        }
    }


    const store = (result: TradeCheck) => {
        tradeCache.set(steamId, { ...result, at: Date.now() })

        return result
    }


    if (!tradeUrl) {
        return store({
            allowed: true,
            reason: null,
        })
    }


    if (!TRADE_URL_PATTERN.test(tradeUrl)) {
        return store({
            allowed: false,
            reason: "corrupt_url",
        })
    }


    try {
        const url = new URL(`${base_url}/steam/api/profile/trade-eligibility`)

        url.searchParams.set("key", api_key)
        url.searchParams.set("trade_url", tradeUrl)

        const response = await fetch(url.toString())

        if (!response.ok) {
            return {
                allowed: true,
                reason: null,
            }
        }


        const data = await response.json()

        if (!data.tradeurlvalid) {
            return store({
                allowed: false,
                reason: "Your Steam account cannot trade at this time.",
            })
        }


        if (data.isescrow && data.escrowdays > 0) {
            const liftDate = new Date(Date.now() + data.escrowdays * 24 * 60 * 60 * 1000)

            const formatted = liftDate.toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "UTC",
                timeZoneName: "short",
            })

            return store({
                allowed: false,
                reason: `Your Steam account has a trade hold due to Steam Guard settings. It lifts on ${formatted}.`,
            })
        }


        return store({
            allowed: true,
            reason: null,
        })
    }
    catch {
        return {
            allowed: true,
            reason: null,
        }
    }
}


export async function fetchItemPrice(market_hash_name: string, game: string): Promise<number | null> {
    try {
        const url = new URL(`${base_url}/markets/prices`)

        url.searchParams.set("key", api_key)
        url.searchParams.set("market_hash_name", market_hash_name)

        const response = await fetch(url.toString())

        if (response.ok) {
            const data = await response.json()

            if (Array.isArray(data) && data.length > 0) {
                const markets = Object.values(data[0].prices as Record<string, { price: number }>)
                const prices: number[] = []

                for (const market of markets) {
                    if (typeof market.price === "number" && market.price > 0) {
                        prices.push(market.price)
                    }
                }


                if (prices.length > 0) {
                    const total = prices.reduce((sum, price) => sum + price, 0)

                    return total / prices.length
                }
            }
        }
    }
    catch {
        // Falls through to the Steam market.
    }


    try {
        const appId = STEAM_APP_IDS[game]

        if (!appId) {
            return null
        }


        const url = new URL("https://steamcommunity.com/market/priceoverview/")

        url.searchParams.set("appid", String(appId))
        url.searchParams.set("currency", "1")
        url.searchParams.set("market_hash_name", market_hash_name)

        const response = await fetch(url.toString())

        if (!response.ok) {
            return null
        }


        const data = await response.json()

        if (!data.success) {
            return null
        }


        const raw = data.median_price ?? data.lowest_price

        if (!raw) {
            return null
        }


        const price = parseFloat(raw.replace(/[^0-9.]/g, ""))

        if (isNaN(price)) {
            return null
        }


        // Steam prices run high, so they're scaled to 80%, except for items under 5 cents.
        return price < 0.05 ? price : price * 0.8
    }
    catch {
        return null
    }
}


// Throws on failure, so a failed lookup is never cached as "no history".
export async function fetchPriceHistory(market_hash_name: string): Promise<PricePoint[]> {
    const url = new URL(`${base_url}/steam/api/history`)

    url.searchParams.set("key", api_key)
    url.searchParams.set("market_hash_name", market_hash_name)
    url.searchParams.set("origin", "markets")
    url.searchParams.set("interval", "1")

    const response = await fetch(url.toString())

    if (response.status === 404) {
        return []
    }


    if (!response.ok) {
        throw new Error(`Price history lookup failed with status ${response.status}`)
    }


    const days: { price: number, createdat: string }[] = await response.json()
    const history: PricePoint[] = []

    for (const day of days.slice(0, PRICE_HISTORY_DAYS)) {
        if (typeof day.price === "number" && day.price > 0) {
            history.push({
                date: day.createdat.slice(0, 10),
                price: day.price,
            })
        }
    }


    // The API lists the newest day first.
    return history.reverse()
}

//

async function fetchInventoryPages(
    steam_id: string,
    game: string,
    includeUntradable: boolean,
): Promise<InventoryPages> {
    try {
        const items: RawInventoryItem[] = []
        let startAssetId: string | null = null

        for (let page = 0; page < MAX_INVENTORY_PAGES; page++) {
            const url = new URL(`${base_url}/steam/api/inventory`)

            url.searchParams.set("key", api_key)
            url.searchParams.set("steam_id", steam_id)
            url.searchParams.set("game", game_slugs[game] ?? "cs2")
            url.searchParams.set("limit", String(INVENTORY_PAGE_SIZE))
            url.searchParams.set("no_cache", "1")

            if (includeUntradable) {
                url.searchParams.set("with_no_tradable", "1")
            }


            if (startAssetId) {
                url.searchParams.set("start_assetid", startAssetId)
            }


            const response = await fetch(url.toString())

            if (!response.ok) {
                return { items, complete: false }
            }


            const pageItems: RawInventoryItem[] = await response.json()

            if (!Array.isArray(pageItems)) {
                return { items, complete: false }
            }


            if (pageItems.length === 0) {
                return { items, complete: true }
            }


            items.push(...pageItems)

            if (pageItems.length < INVENTORY_PAGE_SIZE) {
                return { items, complete: true }
            }


            // A full page with no cursor may have more behind it.
            const lastAssetId = response.headers.get("last_assetid")

            if (!lastAssetId) {
                return { items, complete: false }
            }


            startAssetId = lastAssetId
        }


        return { items, complete: false }
    }
    catch {
        return { items: [], complete: false }
    }
}


// Dota 2's `color` is the item's quality (mostly one grey), so it uses the rarity tag's colour.
function itemColor(item: RawInventoryItem, game: string): string {
    const rarityTag = game === "Dota2" ? item.tags?.find((tag) => tag.category === "Rarity") : null

    return rarityTag?.color ?? item.color ?? item.bordercolor ?? ""
}


// Prices come from our own database, so steamwebapi's are ignored.
async function fetchGameInventory(steam_id: string, game: string): Promise<SteamItem[]> {
    try {
        const { items: raw } = await fetchInventoryPages(steam_id, game, false)
        const items: SteamItem[] = []

        for (const item of raw) {
            if (!item.tradable) {
                continue
            }


            items.push({
                assetId: `${game}:${item.assetid}`,
                market_name: item.marketname,
                market_hash_name: item.markethashname,
                icon: item.image,
                tradable: true,
                type: item.itemtype ?? "",
                price: 0,
                hexColor: itemColor(item, game),
                game,
                commodity: game === "CS2" ? !(item.float?.paintindex) : true,
                inspectLink: item.inspectlink ?? null,
                floatValue: item.float?.floatvalue ?? null,
                paintSeed: item.float?.paintseed ?? null,
                stickers: item.float?.stickers ?? null,
            })
        }


        return items
    }
    catch {
        return []
    }
}


export async function getInventory(steam_id: string): Promise<SteamItem[]> {
    const [cs2, dota2, rust, tf2] = await Promise.all([
        fetchGameInventory(steam_id, "CS2"),
        fetchGameInventory(steam_id, "Dota2"),
        fetchGameInventory(steam_id, "Rust"),
        fetchGameInventory(steam_id, "TF2"),
    ])

    return [...cs2, ...dota2, ...rust, ...tf2]
}


// Null on a failed or empty read, so listings are never removed after a bad lookup.
export async function fetchOwnedAssetIds(steam_id: string, game: string): Promise<Set<string> | null> {
    const { items, complete } = await fetchInventoryPages(steam_id, game, true)

    if (!complete || items.length === 0) {
        return null
    }


    const assetIds = items.map((item) => `${game}:${item.assetid}`)

    return new Set(assetIds)
}

//

// The buyer's inventory with trade-locked items included, so a fresh delivery shows up.
function buyerInventoryUrl(steamId: string, game: string | null, tradeUrl?: string | null): URL {
    const url = new URL(`${base_url}/steam/api/inventory`)

    url.searchParams.set("key", api_key)
    url.searchParams.set("steam_id", steamId)
    url.searchParams.set("game", game_slugs[game ?? ""] ?? "cs2")
    url.searchParams.set("with_no_tradable", "1")
    url.searchParams.set("no_cache", "1")

    // Without the trade URL, trade-locked CS2 items are hidden.
    if (tradeUrl) {
        url.searchParams.set("trade_url", tradeUrl)
    }


    return url
}


// The live fetch can fail where the cached one works, so it's retried once from the cache.
async function fetchBuyerInventory(url: URL): Promise<Response> {
    const response = await fetch(url.toString())
    const conclusive = [403, 410, 411].includes(response.status)

    if (response.ok || conclusive) {
        return response
    }


    const cachedUrl = new URL(url)

    cachedUrl.searchParams.delete("no_cache")

    return fetch(cachedUrl.toString())
}


// Taken before a trade, from the same view verifyBuyerHasItem reads, so copies the buyer already owned don't count.
export async function countInventoryItem(
    steamId: string,
    game: string | null,
    marketName: string,
    tradeUrl?: string | null,
): Promise<number | null> {
    try {
        const response = await fetchBuyerInventory(buyerInventoryUrl(steamId, game, tradeUrl))

        // steamwebapi answers 410 or 411 for a readable inventory without the item.
        if (response.status === 410 || response.status === 411) {
            return 0
        }


        if (!response.ok) {
            return null
        }


        const items: InventoryEntry[] = await response.json()

        if (!Array.isArray(items)) {
            return null
        }


        const matches = items.filter((item) => item.marketname === marketName)

        return matches.length
    }
    catch {
        return null
    }
}


// A skin's float and pattern survive trades, so they identify the exact copy that was sold.
function holdsSoldSkin(
    matches: InventoryEntry[],
    floatValue: number,
    paintSeed: number | null,
): boolean {
    // A lone copy counts until its float loads, but a different float means it's the buyer's own.
    if (matches.length === 1 && typeof matches[0].float?.floatvalue !== "number") {
        return true
    }


    for (const match of matches) {
        const matchFloat = match.float?.floatvalue

        if (typeof matchFloat !== "number" || Math.abs(matchFloat - floatValue) > 1e-7) {
            continue
        }


        if (paintSeed != null && match.float?.paintseed !== paintSeed) {
            continue
        }


        return true
    }


    return false
}


export async function verifyBuyerHasItem(
    steamId: string,
    game: string | null,
    marketName: string,
    float: { floatValue: number | null, paintSeed: number | null } | null,
    buyerTradeUrl?: string | null,
    buyerPreCount?: number | null,
): Promise<VerifyResult> {
    try {
        const response = await fetchBuyerInventory(buyerInventoryUrl(steamId, game, buyerTradeUrl))

        if (response.status === 403) {
            return "private"
        }


        // steamwebapi answers 410 or 411 for a readable inventory without the item.
        if (response.status === 410 || response.status === 411) {
            return "no_item"
        }


        if (!response.ok) {
            return "error"
        }


        const items = await response.json()

        if (!Array.isArray(items)) {
            return items?.error === "PRIVATE" ? "private" : "error"
        }


        const matches = items.filter((item: InventoryEntry) => item.marketname === marketName)

        if (matches.length === 0) {
            return "no_item"
        }


        if (float?.floatValue != null) {
            return holdsSoldSkin(matches, float.floatValue, float.paintSeed) ? "has_item" : "no_item"
        }


        // Commodities are interchangeable, so the count must rise past the pre-trade count.
        const required = (buyerPreCount ?? 0) + 1

        return matches.length >= required ? "has_item" : "no_item"
    }
    catch {
        return "error"
    }
}
