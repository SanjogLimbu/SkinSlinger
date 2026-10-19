import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getServerSession } from "next-auth"
import { POST } from "@/app/api/checkout/route"
import { checkCanTrade } from "@/lib/steam"

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
const BUYER = { id: "buyer", name: "Buyer", email: "buyer@example.com", cash: 100, steam_id: "76561198000000000", steam_trade_url: null }

beforeEach(() => {
    vi.resetAllMocks()

    prisma.$transaction.mockImplementation(fn => fn(prisma))
    prisma.user.findUnique.mockResolvedValue(BUYER)
    prisma.user.findMany.mockResolvedValue([])
    prisma.user.updateMany.mockResolvedValue({ count: 1 })
    prisma.purchase.count.mockResolvedValue(0)
    prisma.purchase.create.mockImplementation(({ data }) => ({ id: "p1", ...data }))
    prisma.item_listing.findUnique.mockResolvedValue(listing())
    prisma.item_listing.deleteMany.mockResolvedValue({ count: 1 })

    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "buyer@example.com" } })
    vi.mocked(checkCanTrade).mockResolvedValue({ allowed: true, reason: null })
    steamInventory(200)
})

afterEach(() => vi.unstubAllGlobals())

//

function listing(overrides: object = {}) {
    return { id: "l1", assetId: "CS2:1", marketName: SKIN, price: 10, game: "CS2", icon: "icon.png", hexColor: "eb4b4b", commodity: false, userId: "seller", ...overrides }
}


// Steam's public inventory endpoint, used to check the buyer's inventory isn't private
function steamInventory(status: number) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status })))
}


async function checkout(items: object[] = [{ id: "l1", marketName: SKIN, commodity: false, quantity: 1, expectedPrice: 10 }]) {
    const response = await POST(new Request("http://localhost/api/checkout", { method: "POST", body: JSON.stringify({ items }) }))

    return { status: response.status, body: await response.json() }
}

//

describe("checkout", () => {

    it("Rejects a user who is not signed in.", async () => {
        vi.mocked(getServerSession).mockResolvedValue(null)

        expect((await checkout()).status).toBe(401)
    })


    it("Blocks a buyer whose Steam account can't trade.", async () => {
        vi.mocked(checkCanTrade).mockResolvedValue({ allowed: false, reason: "Your Steam account has a trade hold." })

        expect(await checkout()).toEqual({ status: 403, body: { error: "Your Steam account has a trade hold." } })
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

        expect(await checkout()).toEqual({ status: 409, body: { error: "One or more items have an invalid price." } })
        expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })


    it("Rejects a stack when there aren't enough listed.", async () => {
        prisma.item_listing.findMany.mockResolvedValue([listing({ marketName: CASE, commodity: true })])

        expect((await checkout([{ id: "", marketName: CASE, commodity: true, quantity: 3, expectedPrice: 10 }])).status).toBe(409)
    })


    it("Rejects a stack whose total cost went up.", async () => {
        prisma.item_listing.findMany.mockResolvedValue([listing({ id: "l1", price: 5, commodity: true }), listing({ id: "l2", price: 6, commodity: true })])

        const { status, body } = await checkout([{ id: "", marketName: CASE, commodity: true, quantity: 2, expectedPrice: 5 }])

        expect(status).toBe(409)
        expect(body.error).toContain("has changed")
    })


    it("A buyer must link Steam before buying.", async () => {
        prisma.user.findUnique.mockResolvedValue({ ...BUYER, steam_id: null })

        expect((await checkout()).status).toBe(400)
    })


    it("A buyer's Steam inventory must be public.", async () => {
        steamInventory(403)

        expect((await checkout()).status).toBe(400)
        expect(prisma.user.updateMany).not.toHaveBeenCalled()
    })


    it("Rejects a buyer without enough cash.", async () => {
        prisma.user.updateMany.mockResolvedValue({ count: 0 })

        expect(await checkout()).toEqual({ status: 402, body: { error: "Insufficient balance" } })
        expect(prisma.purchase.create).not.toHaveBeenCalled()
    })


    it("Rejects the order if someone else buys the listing first.", async () => {
        prisma.item_listing.deleteMany.mockResolvedValue({ count: 0 })

        expect((await checkout()).status).toBe(409)
    })


    it("A successful checkout takes the buyer's cash, creates the order and emails the seller.", async () => {
        prisma.user.findUnique.mockResolvedValueOnce(BUYER).mockResolvedValueOnce({ cash: 90 })
        prisma.user.findMany.mockResolvedValue([{ id: "seller", notificationEmail: "seller@example.com" }])

        expect(await checkout()).toEqual({ status: 200, body: { newCash: 90 } })
        expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: "buyer", cash: { gte: 10 } }, data: { cash: { decrement: 10 } } })
        expect(prisma.purchase.create).toHaveBeenCalledWith({ data: expect.objectContaining({ price: 10, buyerId: "buyer", sellerId: "seller" }) })
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ["seller@example.com"] }))
    })

})
