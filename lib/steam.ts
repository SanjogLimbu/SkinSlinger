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

//

const tradeCache = new Map<string, { allowed: boolean; reason: string | null; at: number }>()
const TRADE_CACHE_TTL = 60 * 60 * 1000 // 1 hour
const TRADE_URL_PATTERN = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=(\d+)&token=[a-zA-Z0-9_-]+$/

// Checks whether a Steam account can trade. Returns { allowed, reason }.
// Fails open if external APIs are unavailable.
export async function checkCanTrade(
    steamId: string,
    tradeUrl?: string | null,
): Promise<{ allowed: boolean; reason: string | null }> {
    const cached = tradeCache.get(steamId)

    if (cached && Date.now() - cached.at < TRADE_CACHE_TTL) {
        return { allowed: cached.allowed, reason: cached.reason }
    }


    const store = (result: { allowed: boolean; reason: string | null }) => {
        tradeCache.set(steamId, { ...result, at: Date.now() })

        return result
    }


    if (!tradeUrl) {
        return store({ allowed: true, reason: null })
    }

    if (!TRADE_URL_PATTERN.test(tradeUrl)) {
        return store({ allowed: false, reason: "corrupt_url" })
    }


    try {
        const url = new URL(`${base_url}/steam/api/profile/trade-eligibility`)
        url.searchParams.set("key", api_key)
        url.searchParams.set("trade_url", tradeUrl)

        const res = await fetch(url.toString())

        if (!res.ok) {
            return { allowed: true, reason: null } // Fail open.
        }

        const data = await res.json()

        if (!data.tradeurlvalid) {
            return store({ allowed: false, reason: "Your Steam account cannot trade at this time." })
        }


        if (data.isescrow && data.escrowdays > 0) {
            const liftDate = new Date(Date.now() + data.escrowdays * 24 * 60 * 60 * 1000)
            const formatted = liftDate.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })
            
            return store({ allowed: false, reason: `Your Steam account has a trade hold due to Steam Guard settings. It lifts on ${formatted}.` })
        }


        return store({ allowed: true, reason: null })
    }
    catch {
        return { allowed: true, reason: null } // Fail open.
    }
}


// Fetches the average price for an item across all markets from steamwebapi.
// Falls back to the Steam Community Market price if no third-party market has the item.
export async function fetchItemPrice(market_hash_name: string, game: string): Promise<number | null> {
    try {
        const url = new URL(`${base_url}/markets/prices`)
        url.searchParams.set("key", api_key)
        url.searchParams.set("market_hash_name", market_hash_name)

        const response = await fetch(url.toString())
        
        if (response.ok) {
            const data = await response.json()

            if (Array.isArray(data) && data.length > 0) {
                const prices = Object.values(data[0].prices as Record<string, { price: number }>)
                    .map(m => m.price)
                    .filter((p): p is number => typeof p === 'number' && p > 0)

                if (prices.length > 0) {
                    return prices.reduce((sum, p) => sum + p, 0) / prices.length
                }
            }
        }
    } 
    catch {
 
    }


    // Fallback to Steam Community Market if we failed to get a price from third-party markets.
    try {
        const appId = STEAM_APP_IDS[game]

        if (!appId) return null

        const steamUrl = new URL("https://steamcommunity.com/market/priceoverview/")
        steamUrl.searchParams.set("appid", String(appId))
        steamUrl.searchParams.set("currency", "1")
        steamUrl.searchParams.set("market_hash_name", market_hash_name)

        const res = await fetch(steamUrl.toString())

        if (!res.ok) return null

        const data = await res.json()

        if (!data.success) return null

        const raw = data.median_price ?? data.lowest_price

        if (!raw) return null

        const numeric = parseFloat(raw.replace(/[^0-9.]/g, ""))

        if (isNaN(numeric)) return null

        return numeric < 0.05 ? numeric : numeric * 0.8

    } 
    catch {
        return null
    }
}


export type PricePoint = { date: string, price: number }

const PRICE_HISTORY_DAYS = 180

// An item's daily third-party price, oldest first; empty when there is no history.
// Throws on a failed lookup, so a failure is never cached as "no history".
export async function fetchPriceHistory(market_hash_name: string): Promise<PricePoint[]> {
    const url = new URL(`${base_url}/steam/api/history`)
    url.searchParams.set("key", api_key)
    url.searchParams.set("market_hash_name", market_hash_name)
    url.searchParams.set("origin", "markets")
    url.searchParams.set("interval", "1")

    const response = await fetch(url.toString())

    if (response.status === 404) return []
    if (!response.ok) throw new Error(`Price history lookup failed with status ${response.status}`)

    // One entry a day, newest first
    const days: { price: number, createdat: string }[] = await response.json()

    return days
        .slice(0, PRICE_HISTORY_DAYS)
        .filter(day => typeof day.price === "number" && day.price > 0)
        .map(day => ({ date: day.createdat.slice(0, 10), price: day.price }))
        .reverse()
}


// Pages through a player's raw inventory for one game from steamwebapi. `complete` is false
// when a page failed, so a failed lookup can't be mistaken for a small or empty inventory.
async function fetchInventoryPages(steam_id: string, game: string, includeUntradable: boolean): Promise<{ items: { assetid: string }[], complete: boolean }> {
    // Steam caps each request at 2000 items, so larger inventories must be paged using start_assetid (the last_assetid response header).
    const PAGE_SIZE = 2000
    const MAX_PAGES = 25

    try {
        const slug = game_slugs[game] ?? "cs2"
        const items: { assetid: string }[] = []
        let startAssetId: string | null = null

        for (let page = 0; page < MAX_PAGES; page++) {
            const url = new URL(`${base_url}/steam/api/inventory`)
            url.searchParams.set("key", api_key)
            url.searchParams.set("steam_id", steam_id)
            url.searchParams.set("game", slug)
            url.searchParams.set("limit", String(PAGE_SIZE))
            url.searchParams.set("no_cache", "1")

            if (includeUntradable) {
                url.searchParams.set("with_no_tradable", "1")
            }

            if (startAssetId) {
                url.searchParams.set("start_assetid", startAssetId)
            }

            const response = await fetch(url.toString())

            if (!response.ok) return { items, complete: false }

            const pageItems: { assetid: string }[] = await response.json()

            if (!Array.isArray(pageItems)) return { items, complete: false }
            if (pageItems.length === 0) return { items, complete: true }

            items.push(...pageItems)

            // Last page when the API returns a partial page or stops handing back a cursor.
            // A full page with no cursor may have more behind it, so it doesn't count as complete.
            const lastAssetId = response.headers.get("last_assetid")

            if (pageItems.length < PAGE_SIZE) return { items, complete: true }
            if (!lastAssetId) return { items, complete: false }

            startAssetId = lastAssetId
        }

        return { items, complete: false }
    }
    catch {
        return { items: [], complete: false }
    }
}


// Dota 2's `color` is the item's quality (mostly one grey), so it uses its rarity tag's colour
function itemColor(item: { color?: string, bordercolor?: string, tags?: { category: string, color?: string }[] }, game: string): string {
    const rarityTag = game === 'Dota2' ? item.tags?.find(tag => tag.category === 'Rarity') : null

    return rarityTag?.color ?? item.color ?? item.bordercolor ?? ''
}


// Fetches a player's inventory for any supported game from steamwebapi.
// Returns tradable items with price set to 0 (prices are looked up separately from our DB).
async function fetchGameInventory(steam_id: string, game: string): Promise<SteamItem[]> {
    try {
        const { items: raw } = await fetchInventoryPages(steam_id, game, false)

        return raw
            .filter((item: any) => item.tradable)
            .map((item: any) => ({
                assetId: `${game}:${item.assetid}`,
                market_name: item.marketname,
                market_hash_name: item.markethashname,
                icon: item.image,
                tradable: true,
                type: item.itemtype ?? '',
                price: 0,
                hexColor: itemColor(item, game),
                game,
                commodity: game === 'CS2' ? !(item.float?.paintindex) : true,
                inspectLink: item.inspectlink ?? null,
                floatValue: item.float?.floatvalue ?? null,
                paintSeed: item.float?.paintseed ?? null,
                stickers: item.float?.stickers ?? null,
            }))
    } 
    catch {
        return []
    }
}


// Fetches a user's combined inventory.
export async function getInventory(steam_id: string): Promise<SteamItem[]> {
    const [cs2, dota2, rust, tf2] = await Promise.all([
        fetchGameInventory(steam_id, 'CS2'),
        fetchGameInventory(steam_id, 'Dota2'),
        fetchGameInventory(steam_id, 'Rust'),
        fetchGameInventory(steam_id, 'TF2'),
    ])


    return [...cs2, ...dota2, ...rust, ...tf2]
}


// Every asset a player currently holds in one game, in the `${game}:${assetid}` form listings
// use. Null when the inventory couldn't be read in full or came back empty, so a caller that
// removes listings never acts on a failed lookup.
export async function fetchOwnedAssetIds(steam_id: string, game: string): Promise<Set<string> | null> {
    const { items, complete } = await fetchInventoryPages(steam_id, game, true)

    if (!complete || items.length === 0) return null

    return new Set(items.map(item => `${game}:${item.assetid}`))
}


export type VerifyResult = "has_item" | "no_item" | "private" | "error"

// Counts how many of the given item the buyer currently holds. Used to snapshot the
// buyer's pre-trade count for commodities, which have no per-unit identity — without
// this, a buyer who already owned one of these before the trade would pass verification
// immediately, whether or not the seller ever delivered. Returns null if the count
// couldn't be determined (private/unreachable inventory); callers should treat that as
// "unknown" rather than zero.
export async function countInventoryItem(steamId: string, game: string | null, marketName: string): Promise<number | null> {
    try {
        const slug = game ? (game_slugs[game] ?? "cs2") : "cs2"
        const url = new URL(`${base_url}/steam/api/inventory`)
        url.searchParams.set("key", api_key)
        url.searchParams.set("steam_id", steamId)
        url.searchParams.set("game", slug)
        url.searchParams.set("no_cache", "1")

        const res = await fetch(url.toString())
        if (!res.ok) return null

        const items = await res.json()
        if (!Array.isArray(items)) return null

        return items.filter((i: { marketname?: string }) => i.marketname === marketName).length
    }
    catch {
        return null
    }
}

// Checks whether the buyer's inventory contains the purchased item. assetid changes
// when an item is traded, so we match on the trade-stable market name and — for CS2
// skins with stored float data — the exact float value and paint seed (these are
// intrinsic to the item and survive trades). Commodities have no such per-unit identity,
// so delivery is proven by the buyer's count rising past their pre-trade snapshot
// (buyerPreCount) rather than by mere presence — otherwise a buyer who already owned one
// would pass instantly. buyerPreCount is only available for purchases created after this
// snapshot was introduced; older purchases pass it as null/undefined and fall back to the
// original "any match" check.
// with_no_tradable=1 surfaces generic non-tradeable items, but CS2's 7-10 day trade
// lock on freshly-received skins specifically needs the buyer's trade_url passed too,
// or steamwebapi won't return the item at all while it's locked.
export async function verifyBuyerHasItem(
    steamId: string,
    game: string | null,
    marketName: string,
    float: { floatValue: number | null; paintSeed: number | null } | null,
    buyerTradeUrl?: string | null,
    buyerPreCount?: number | null,
): Promise<VerifyResult> {
    try {
        const slug = game ? (game_slugs[game] ?? "cs2") : "cs2"
        const url = new URL(`${base_url}/steam/api/inventory`)
        url.searchParams.set("key", api_key)
        url.searchParams.set("steam_id", steamId)
        url.searchParams.set("game", slug)
        url.searchParams.set("with_no_tradable", "1")
        url.searchParams.set("no_cache", "1")
        if (buyerTradeUrl) {
            url.searchParams.set("trade_url", buyerTradeUrl)
        }

        let res = await fetch(url.toString())

        // steamwebapi's live (no_cache) fetch can fail specifically for the
        // with_no_tradable+trade_url combo (used to see trade-locked CS2 items) while
        // still succeeding on cached data with the same trade-lock visibility. Retry
        // once against the cache rather than surfacing "error" and stalling the
        // purchase (and its auto-cancel safety net) indefinitely.
        if (!res.ok && res.status !== 403 && res.status !== 410 && res.status !== 411) {
            const cachedUrl = new URL(url.toString())
            cachedUrl.searchParams.delete("no_cache")
            res = await fetch(cachedUrl.toString())
        }

        if (res.status === 403) return "private"
        if (res.status === 410 || res.status === 411) {
            return "no_item" // accessible, no such item
        }

        if (!res.ok) return "error"

        const items = await res.json()

        if (!Array.isArray(items)) {
            const err = typeof items?.error === "string" ? items.error : ""

            if (err === "PRIVATE") return "private"

            return "error"
        }


        const matches = items.filter((i: { marketname?: string }) => i.marketname === marketName)

        if (matches.length === 0) return "no_item"

        // CS2 skins have stored float data — an intrinsic, trade-surviving fingerprint that
        // identifies the exact unit traded, regardless of how many copies the buyer holds.
        if (float?.floatValue != null) {
            // Only one item with this name in the inventory — no ambiguity to resolve, so
            // there's no need for a float match (and freshly-received, trade-locked items
            // often don't have float data populated yet, which would otherwise false-negative).
            if (matches.length === 1) return "has_item"

            // Multiple items share this name — require an exact float + pattern match to
            // identify the specific one that was traded.
            const target = float.floatValue

            const hit = matches.some((i: { float?: { floatvalue?: number; paintseed?: number } }) => {
                const fv = i.float?.floatvalue

                if (typeof fv !== "number" || Math.abs(fv - target) > 1e-7) {
                    return false
                }

                if (float.paintSeed != null && i.float?.paintseed !== float.paintSeed) {
                    return false
                }

                return true
            })


            return hit ? "has_item" : "no_item"
        }

        // Commodities (and anything else with no stored float): fungible, so presence alone
        // doesn't prove delivery. Require the buyer's count to have risen past their
        // pre-trade snapshot. No snapshot (older purchases) => fall back to "any match".
        const required = (buyerPreCount ?? 0) + 1

        return matches.length >= required ? "has_item" : "no_item"
    }
    catch {
        return "error"
    }
}

