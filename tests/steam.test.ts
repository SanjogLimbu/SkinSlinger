import { describe, it, expect, vi, afterEach } from "vitest"
import { checkCanTrade, fetchItemPrice, fetchOwnedAssetIds, fetchPriceHistory, verifyBuyerHasItem } from "@/lib/steam"

//

const TRADE_URL = "https://steamcommunity.com/tradeoffer/new/?partner=12345&token=AbC_d-9"
const SKIN = "AK-47 | Redline (Field-Tested)"
const CASE = "Kilowatt Case"
const SKIN_FLOAT = { floatValue: 0.25, paintSeed: 661 }
const FULL_PAGE = Array.from({ length: 2000 }, (_, i) => ({ assetid: String(i) }))

afterEach(() => vi.unstubAllGlobals())

//

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), { status, headers })
}


// Replaces fetch with one that returns these responses in order
function mockFetch(...responses: Response[]) {
    const fetch = vi.fn()

    for (const response of responses) fetch.mockResolvedValueOnce(response)

    vi.stubGlobal("fetch", fetch)

    return fetch
}


function skin(floatvalue: number, paintseed: number) {
    return { marketname: SKIN, float: { floatvalue, paintseed } }
}

//

describe("verifyBuyerHasItem", () => {

    it("A private inventory is reported as private.", async () => {
        mockFetch(json({}, 403))

        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("private")
    })


    it("A private error in the response body is reported as private.", async () => {
        mockFetch(json({ error: "PRIVATE" }))

        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("private")
    })


    it("A 410 or 411 means the inventory is readable but has no such item.", async () => {
        mockFetch(json({}, 410), json({}, 411))

        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("no_item")
        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("no_item")
    })


    it("A failed live fetch is retried once against cached data.", async () => {
        const fetch = mockFetch(json({}, 500), json([skin(0.25, 661)]))

        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("has_item")
        expect(new URL(fetch.mock.calls[0][0]).searchParams.has("no_cache")).toBe(true)
        expect(new URL(fetch.mock.calls[1][0]).searchParams.has("no_cache")).toBe(false)
    })


    it("Returns error when the retry fails too.", async () => {
        mockFetch(json({}, 500), json({}, 500))

        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("error")
    })


    it("Returns error when the request throws.", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))

        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("error")
    })


    it("An inventory without the item has no item.", async () => {
        mockFetch(json([{ marketname: "AWP | Asiimov (Field-Tested)" }]))

        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("no_item")
    })


    it("A single copy of a skin counts even before its float data loads.", async () => {
        mockFetch(json([{ marketname: SKIN }]))

        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("has_item")
    })


    it("With several copies of a skin, the exact float and pattern must match.", async () => {
        mockFetch(json([skin(0.31, 100), skin(0.25, 661)]))

        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("has_item")
    })


    it("With several copies of a skin, a matching float with the wrong pattern is not the traded item.", async () => {
        mockFetch(json([skin(0.31, 100), skin(0.25, 999)]))

        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("no_item")
    })


    it("A commodity only counts once the buyer holds more than before the trade.", async () => {
        mockFetch(json([{ marketname: CASE }, { marketname: CASE }]))

        expect(await verifyBuyerHasItem("1", "CS2", CASE, null, null, 2)).toBe("no_item")
    })


    it("A commodity counts once the buyer's count has gone up.", async () => {
        mockFetch(json([{ marketname: CASE }, { marketname: CASE }, { marketname: CASE }]))

        expect(await verifyBuyerHasItem("1", "CS2", CASE, null, null, 2)).toBe("has_item")
    })


    it("A commodity with no pre-trade count falls back to any copy counting.", async () => {
        mockFetch(json([{ marketname: CASE }]))

        expect(await verifyBuyerHasItem("1", "CS2", CASE, null)).toBe("has_item")
    })


    it("Asks for the right game, defaulting to CS2.", async () => {
        const fetch = mockFetch(json([]), json([]), json([]))

        await verifyBuyerHasItem("1", "Dota2", SKIN, null)
        await verifyBuyerHasItem("1", null, SKIN, null)
        await verifyBuyerHasItem("1", "Unknown", SKIN, null)

        const games = fetch.mock.calls.map(([url]) => new URL(url).searchParams.get("game"))

        expect(games).toEqual(["dota", "cs2", "cs2"])
    })


    it("Passes the buyer's trade URL, so trade-locked CS2 items are visible.", async () => {
        const fetch = mockFetch(json([]))

        await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT, TRADE_URL)

        expect(new URL(fetch.mock.calls[0][0]).searchParams.get("trade_url")).toBe(TRADE_URL)
    })


    it("Any other unexpected response is an error.", async () => {
        mockFetch(json({ error: "RATE_LIMITED" }), json({}))

        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("error")
        expect(await verifyBuyerHasItem("1", "CS2", SKIN, SKIN_FLOAT)).toBe("error")
    })


})

//

// Results are cached per steam id for an hour, so each test uses its own id
describe("checkCanTrade", () => {

    it("A user with no trade URL is allowed without calling the API.", async () => {
        const fetch = mockFetch()

        expect(await checkCanTrade("no-url", null)).toEqual({ allowed: true, reason: null })
        expect(fetch).not.toHaveBeenCalled()
    })


    it("A malformed trade URL is rejected without calling the API.", async () => {
        const fetch = mockFetch()

        expect(await checkCanTrade("bad-url", "https://example.com/tradeoffer/new/?partner=1&token=x")).toEqual({ allowed: false, reason: "corrupt_url" })
        expect(fetch).not.toHaveBeenCalled()
    })


    it("An account Steam says cannot trade is blocked.", async () => {
        mockFetch(json({ tradeurlvalid: false }))

        expect(await checkCanTrade("cannot-trade", TRADE_URL)).toEqual({ allowed: false, reason: "Your Steam account cannot trade at this time." })
    })


    it("An account with a trade hold is blocked.", async () => {
        mockFetch(json({ tradeurlvalid: true, isescrow: true, escrowdays: 7 }))

        const result = await checkCanTrade("trade-hold", TRADE_URL)

        expect(result.allowed).toBe(false)
        expect(result.reason).toContain("trade hold")
    })


    it("The result is cached, so a second check does not call the API.", async () => {
        const fetch = mockFetch(json({ tradeurlvalid: true }))

        expect(await checkCanTrade("cached", TRADE_URL)).toEqual({ allowed: true, reason: null })
        expect(await checkCanTrade("cached", TRADE_URL)).toEqual({ allowed: true, reason: null })
        expect(fetch).toHaveBeenCalledTimes(1)
    })


    it("An API error lets the user trade, and is not cached.", async () => {
        const fetch = mockFetch(json({}, 500), json({}, 500))

        expect(await checkCanTrade("api-down", TRADE_URL)).toEqual({ allowed: true, reason: null })
        expect(await checkCanTrade("api-down", TRADE_URL)).toEqual({ allowed: true, reason: null })
        expect(fetch).toHaveBeenCalledTimes(2)
    })


    it("A network failure lets the user trade.", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))

        expect(await checkCanTrade("offline", TRADE_URL)).toEqual({ allowed: true, reason: null })
    })

})

//

describe("fetchItemPrice", () => {

    it("Averages the price across markets, ignoring missing and zero prices.", async () => {
        mockFetch(json([{ prices: { buff: { price: 10 }, skinport: { price: 20 }, empty: { price: 0 }, broken: { price: null } } }]))

        expect(await fetchItemPrice(SKIN, "CS2")).toBe(15)
    })


    it("Falls back to 80% of the Steam market price when no other market has the item.", async () => {
        const fetch = mockFetch(json([]), json({ success: true, median_price: "$1,234.50" }))

        expect(await fetchItemPrice(SKIN, "CS2")).toBeCloseTo(987.6)
        expect(new URL(fetch.mock.calls[1][0]).searchParams.get("appid")).toBe("730")
    })


    it("Falls back to Steam when the markets API fails.", async () => {
        mockFetch(json({}, 500), json({ success: true, median_price: "$10.00" }))

        expect(await fetchItemPrice(SKIN, "CS2")).toBe(8)
    })


    it("Uses Steam's lowest price when there is no median.", async () => {
        mockFetch(json([]), json({ success: true, lowest_price: "$10.00" }))

        expect(await fetchItemPrice(SKIN, "CS2")).toBe(8)
    })


    it("Items under 5 cents keep their full Steam price.", async () => {
        mockFetch(json([]), json({ success: true, median_price: "$0.03" }))

        expect(await fetchItemPrice(SKIN, "CS2")).toBe(0.03)
    })


    it("Returns null when Steam has no price either.", async () => {
        mockFetch(json([]), json({ success: false }))

        expect(await fetchItemPrice(SKIN, "CS2")).toBeNull()
    })


    it("Returns null for a game Steam doesn't know, without asking Steam.", async () => {
        const fetch = mockFetch(json([]))

        expect(await fetchItemPrice(SKIN, "Unknown")).toBeNull()
        expect(fetch).toHaveBeenCalledTimes(1)
    })

})

//

describe("fetchPriceHistory", () => {

    it("Returns daily prices oldest first, skipping days with no price.", async () => {
        mockFetch(json([
            { price: 3, createdat: "2026-10-03T00:00:00Z" },
            { price: 0, createdat: "2026-10-02T00:00:00Z" },
            { price: 1, createdat: "2026-10-01T00:00:00Z" },
        ]))

        expect(await fetchPriceHistory(SKIN)).toEqual([{ date: "2026-10-01", price: 1 }, { date: "2026-10-03", price: 3 }])
    })


    it("Keeps only the newest 180 days.", async () => {
        mockFetch(json(Array.from({ length: 200 }, (_, i) => ({ price: 200 - i, createdat: "2026-10-01T00:00:00Z" }))))

        const history = await fetchPriceHistory(SKIN)

        expect(history).toHaveLength(180)
        expect(history[0].price).toBe(21)
        expect(history[179].price).toBe(200)
    })


    it("An item with no history returns an empty list.", async () => {
        mockFetch(json({}, 404))

        expect(await fetchPriceHistory(SKIN)).toEqual([])
    })


    it("A failed lookup throws, so it is never cached as having no history.", async () => {
        mockFetch(json({}, 500))

        await expect(fetchPriceHistory(SKIN)).rejects.toThrow("status 500")
    })

})

//

describe("fetchOwnedAssetIds", () => {

    it("Returns the asset ids in a seller's inventory.", async () => {
        mockFetch(json([{ assetid: "1" }, { assetid: "2" }]))

        expect(await fetchOwnedAssetIds("1", "CS2")).toEqual(new Set(["CS2:1", "CS2:2"]))
    })


    it("Pages through inventories of more than 2,000 items.", async () => {
        const fetch = mockFetch(json(FULL_PAGE, 200, { last_assetid: "1999" }), json([{ assetid: "2000" }]))

        expect((await fetchOwnedAssetIds("1", "CS2"))?.size).toBe(2001)
        expect(new URL(fetch.mock.calls[1][0]).searchParams.get("start_assetid")).toBe("1999")
    })


    it("A failed page returns null, so listings aren't removed after a bad lookup.", async () => {
        mockFetch(json(FULL_PAGE, 200, { last_assetid: "1999" }), json({}, 500))

        expect(await fetchOwnedAssetIds("1", "CS2")).toBeNull()
    })


    it("A full page with no cursor returns null, since more items may follow.", async () => {
        mockFetch(json(FULL_PAGE))

        expect(await fetchOwnedAssetIds("1", "CS2")).toBeNull()
    })


    it("An empty inventory returns null rather than 'owns nothing'.", async () => {
        mockFetch(json([]))

        expect(await fetchOwnedAssetIds("1", "CS2")).toBeNull()
    })

})
