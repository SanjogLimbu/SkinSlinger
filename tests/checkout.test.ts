import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getServerSession } from "next-auth"
import { POST } from "@/app/api/checkout/route"
import { checkCanTrade, countInventoryItem } from "@/lib/steam"

//

const { prisma, sendEmail } = vi.hoisted(() => ({
    prisma: {
        user: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
        purchase: { count: vi.fn(), create: vi.fn() },
        item_listing: { findMany: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
        $transaction: vi.fn(),
    },
    sendEmail: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/db", () => ({ prisma }))
vi.mock("@/lib/steam", () => ({ checkCanTrade: vi.fn(), countInventoryItem: vi.fn() }))
vi.mock("resend", () => ({ Resend: class { emails = { send: sendEmail } } }))

//

const SKIN = "AK-47 | Redline (Field-Tested)"
const CASE = "Kilowatt Case"
const STEAM_ID = "76561198000000000"
const TRADE_URL = "https://steamcommunity.com/tradeoffer/new/?partner=12345&token=AbC_d-9"

const BUYER = {
    id: "buyer",
    name: "Buyer",
    email: "buyer@example.com",
    cash: 100,
    steam_id: STEAM_ID,
    steam_trade_url: TRADE_URL,
}

beforeEach(() => {
    vi.resetAllMocks()

    prisma.$transaction.mockImplementation((fn) => fn(prisma))
    prisma.user.findUnique.mockResolvedValue(BUYER)
    prisma.user.findMany.mockResolvedValue([])
    prisma.user.updateMany.mockResolvedValue({ count: 1 })
    prisma.purchase.count.mockResolvedValue(0)
    prisma.purchase.create.mockImplementation(({ data }) => ({ id: "p1", ...data }))
    prisma.item_listing.findUnique.mockResolvedValue(listing())
    prisma.item_listing.deleteMany.mockResolvedValue({ count: 1 })

    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "buyer@example.com" } })
    vi.mocked(checkCanTrade).mockResolvedValue({ allowed: true, reason: null })
    vi.mocked(countInventoryItem).mockResolvedValue(0)
    steamInventory(200)
})

afterEach(() => vi.unstubAllGlobals())

//

function listing(overrides: object = {}) {
    return {
        id: "l1",
        assetId: "CS2:1",
        marketName: SKIN,
        price: 10,
        game: "CS2",
        icon: "icon.png",
        hexColor: "eb4b4b",
        commodity: false,
        userId: "seller",
        ...overrides,
    }
}


function basketItem(overrides: object = {}) {
    return {
        id: "l1",
        marketName: SKIN,
        commodity: false,
        quantity: 1,
        expectedPrice: 10,
        ...overrides,
    }
}


// Steam's public inventory endpoint, which checkout uses to make sure the inventory isn't private.
function steamInventory(status: number) {
    const response = () => new Response(JSON.stringify({ success: true }), { status })

    vi.stubGlobal("fetch", vi.fn(async () => response()))
}


async function checkout(items: object[] = [basketItem()]) {
    const request = new Request("http://localhost/api/checkout", {
        method: "POST",
        body: JSON.stringify({ items }),
    })

    const response = await POST(request)

    return { status: response.status, body: await response.json() }
}

//

describe("checkout", () => {

    it("Rejects a user who is not signed in.", async () => {
        vi.mocked(getServerSession).mockResolvedValue(null)

        expect((await checkout()).status).toBe(401)
    })


    it("A buyer must link Steam before buying.", async () => {
        prisma.user.findUnique.mockResolvedValue({ ...BUYER, steam_id: null })

        expect((await checkout()).status).toBe(400)
    })


    it("A buyer must add a trade URL before buying, so the seller can send the item.", async () => {
        prisma.user.findUnique.mockResolvedValue({ ...BUYER, steam_trade_url: null })

        const { status, body } = await checkout()

        expect(status).toBe(400)
        expect(prisma.user.updateMany).not.toHaveBeenCalled()

        // The basket opens its Steam link prompt on this phrase.
        expect(body.error).toContain("link your Steam")
    })


    it("Blocks a buyer whose Steam account can't trade.", async () => {
        vi.mocked(checkCanTrade).mockResolvedValue({
            allowed: false,
            reason: "Your Steam account has a trade hold.",
        })

        expect(await checkout()).toEqual({
            status: 403,
            body: { error: "Your Steam account has a trade hold." },
        })
    })


    it("A buyer can't check out while they have an order in progress.", async () => {
        prisma.purchase.count.mockResolvedValue(1)

        expect((await checkout()).status).toBe(409)
    })


    it("A buyer can't buy their own listing.", async () => {
        prisma.item_listing.findUnique.mockResolvedValue(listing({ userId: "buyer" }))

        expect((await checkout()).status).toBe(400)
    })


    it("Rejects a listing that no longer exists.", async () => {
        prisma.item_listing.findUnique.mockResolvedValue(null)

        expect((await checkout()).status).toBe(409)
    })


    it("Rejects a listing whose price went up after it was added to the basket.", async () => {
        prisma.item_listing.findUnique.mockResolvedValue(listing({ price: 12 }))

        const { status, body } = await checkout()

        expect(status).toBe(409)
        expect(body.error).toContain("has changed")
    })


    it("Rejects a listing with a negative price, so the buyer's cash can't go up.", async () => {
        prisma.item_listing.findUnique.mockResolvedValue(listing({ price: -5 }))

        expect(await checkout()).toEqual({
            status: 409,
            body: { error: "One or more items have an invalid price." },
        })

        expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })


    it("Rejects a stack when there aren't enough listed.", async () => {
        prisma.item_listing.findMany.mockResolvedValue([listing({ marketName: CASE, commodity: true })])

        const stack = basketItem({ id: "", marketName: CASE, commodity: true, quantity: 3 })

        expect((await checkout([stack])).status).toBe(409)
    })


    it("Rejects a stack whose total cost went up.", async () => {
        prisma.item_listing.findMany.mockResolvedValue([
            listing({ id: "l1", price: 5, commodity: true }),
            listing({ id: "l2", price: 6, commodity: true }),
        ])

        const stack = basketItem({ id: "", marketName: CASE, commodity: true, quantity: 2, expectedPrice: 5 })
        const { status, body } = await checkout([stack])

        expect(status).toBe(409)
        expect(body.error).toContain("has changed")
    })


    it("Counts the buyer's copies of a stack before buying, using their trade URL to see trade-locked ones.", async () => {
        prisma.item_listing.findMany.mockResolvedValue([listing({ marketName: CASE, commodity: true })])
        vi.mocked(countInventoryItem).mockResolvedValue(2)

        const stack = basketItem({ id: "", marketName: CASE, commodity: true })

        expect((await checkout([stack])).status).toBe(200)
        expect(countInventoryItem).toHaveBeenCalledWith(STEAM_ID, "CS2", CASE, TRADE_URL)

        expect(prisma.purchase.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ buyerPreCount: 2 }),
        })
    })


    it("Each copy of a stack needs its own delivery, so sending one copy can't settle the whole stack.", async () => {
        prisma.item_listing.findMany.mockResolvedValue([
            listing({ id: "l1", marketName: CASE, commodity: true }),
            listing({ id: "l2", marketName: CASE, commodity: true }),
        ])

        vi.mocked(countInventoryItem).mockResolvedValue(2)

        const stack = basketItem({ id: "", marketName: CASE, commodity: true, quantity: 2 })

        expect((await checkout([stack])).status).toBe(200)

        const preCounts = prisma.purchase.create.mock.calls.map(([{ data }]) => data.buyerPreCount)

        expect(preCounts).toEqual([2, 3])
        expect(countInventoryItem).toHaveBeenCalledTimes(1)
    })


    it("Refuses a stack when the buyer's copies can't be counted, rather than guessing.", async () => {
        prisma.item_listing.findMany.mockResolvedValue([listing({ marketName: CASE, commodity: true })])
        vi.mocked(countInventoryItem).mockResolvedValue(null)

        const stack = basketItem({ id: "", marketName: CASE, commodity: true })

        expect((await checkout([stack])).status).toBe(503)
        expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })


    it("A buyer's Steam inventory must be public.", async () => {
        steamInventory(403)

        expect((await checkout()).status).toBe(400)
        expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })


    it("Rejects a buyer without enough cash.", async () => {
        prisma.user.updateMany.mockResolvedValue({ count: 0 })

        expect(await checkout()).toEqual({
            status: 402,
            body: { error: "Insufficient balance" },
        })

        expect(prisma.purchase.create).not.toHaveBeenCalled()
    })


    it("Rejects the order if someone else buys the listing first.", async () => {
        prisma.item_listing.deleteMany.mockResolvedValue({ count: 0 })

        expect((await checkout()).status).toBe(409)
    })


    it("A successful checkout takes the buyer's cash, creates the order and emails the seller.", async () => {
        prisma.user.findUnique.mockResolvedValueOnce(BUYER).mockResolvedValueOnce({ cash: 90 })
        prisma.user.findMany.mockResolvedValue([{ id: "seller", notificationEmail: "seller@example.com" }])

        expect(await checkout()).toEqual({
            status: 200,
            body: { newCash: 90 },
        })

        expect(prisma.user.updateMany).toHaveBeenCalledWith({
            where: { id: "buyer", cash: { gte: 10 } },
            data: { cash: { decrement: 10 } },
        })

        expect(prisma.purchase.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ price: 10, buyerId: "buyer", sellerId: "seller", buyerTradeUrl: TRADE_URL }),
        })

        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ["seller@example.com"] }))
    })

})
