import { describe, it, expect, vi, beforeEach } from "vitest"
import { getServerSession } from "next-auth"
import { POST } from "@/app/api/prices/route"
import { fetchItemPrice } from "@/lib/steam"

//

const prisma = vi.hoisted(() => ({
    user: { findUnique: vi.fn() },
    item: { findMany: vi.fn(), upsert: vi.fn() },
}))

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/db", () => ({ prisma }))
vi.mock("@/lib/steam", () => ({ fetchItemPrice: vi.fn() }))

//

const SKIN = "AK-47 | Redline (Field-Tested)"
const STICKER = "Sticker | Crown (Foil)"

beforeEach(() => {
    vi.resetAllMocks()

    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "seller@example.com" } })
    vi.mocked(fetchItemPrice).mockResolvedValue(12)
    prisma.item.findMany.mockResolvedValue([])

    prisma.user.findUnique.mockResolvedValue({
        inventoryCache: [{
            market_name: SKIN,
            market_hash_name: SKIN,
            game: "CS2",
            stickers: [{ name: "Crown (Foil)" }],
        }],
    })
})

//

async function requestPrices(items: object[]) {
    const request = new Request("http://localhost/api/prices", {
        method: "POST",
        body: JSON.stringify({ items }),
    })

    const response = await POST(request)
    const lines = (await response.text()).trim().split("\n")

    return lines.filter(Boolean).map((line) => JSON.parse(line))
}

//

describe("prices", () => {

    it("Prices an item from the user's inventory under its own name.", async () => {
        const prices = await requestPrices([{ market_name: SKIN, market_hash_name: SKIN, game: "CS2" }])

        expect(prices).toEqual([{ market_name: SKIN, price: 12 }])
        expect(fetchItemPrice).toHaveBeenCalledWith(SKIN, "CS2")
    })


    it("Uses the inventory's hash name, so another item's price can't be stored under this name.", async () => {
        await requestPrices([{ market_name: SKIN, market_hash_name: "Sticker | Cheap", game: "Dota2" }])

        expect(fetchItemPrice).toHaveBeenCalledWith(SKIN, "CS2")

        expect(prisma.item.upsert).toHaveBeenCalledWith(expect.objectContaining({
            create: expect.objectContaining({ marketName: SKIN, marketHashName: SKIN, game: "CS2" }),
        }))
    })


    it("Ignores items that aren't in the user's inventory.", async () => {
        const prices = await requestPrices([{ market_name: "Karambit | Fade (Factory New)", market_hash_name: "x", game: "CS2" }])

        expect(prices).toEqual([])
        expect(fetchItemPrice).not.toHaveBeenCalled()
        expect(prisma.item.upsert).not.toHaveBeenCalled()
    })


    it("Prices the stickers on the user's skins.", async () => {
        const prices = await requestPrices([{ market_name: STICKER, market_hash_name: STICKER, game: "CS2" }])

        expect(prices).toEqual([{ market_name: STICKER, price: 12 }])
    })


    it("Looks each name up once, even when the request repeats it.", async () => {
        const item = { market_name: SKIN, market_hash_name: SKIN, game: "CS2" }

        await requestPrices([item, item, item])

        expect(fetchItemPrice).toHaveBeenCalledTimes(1)
    })

})
