import { describe, it, expect, vi, beforeEach } from "vitest"
import { getServerSession } from "next-auth"
import { POST } from "@/app/api/market/orders/buy/route"

//

const { prisma, sendEmail } = vi.hoisted(() => ({
    prisma: {
        user: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
        buy_order: { findFirst: vi.fn(), create: vi.fn() },
        item_listing: { findMany: vi.fn(), deleteMany: vi.fn() },
        purchase: { create: vi.fn() },
        $transaction: vi.fn(),
    },
    sendEmail: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/db", () => ({ prisma }))
vi.mock("@/lib/steam", () => ({ countInventoryItem: vi.fn() }))
vi.mock("resend", () => ({ Resend: class { emails = { send: sendEmail } } }))

//

const SKIN = "AK-47 | Redline (Field-Tested)"
const TRADE_URL = "https://steamcommunity.com/tradeoffer/new/?partner=12345&token=AbC_d-9"
const BUYER = { id: "buyer", name: "Buyer", email: "buyer@example.com", cash: 100, steam_id: "76561198000000000", steam_trade_url: TRADE_URL }

beforeEach(() => {
    vi.resetAllMocks()

    prisma.$transaction.mockImplementation(fn => fn(prisma))
    prisma.user.findUnique.mockResolvedValue(BUYER)
    prisma.user.updateMany.mockResolvedValue({ count: 1 })
    prisma.buy_order.findFirst.mockResolvedValue(null)
    prisma.item_listing.findMany.mockResolvedValue([])
    prisma.item_listing.deleteMany.mockResolvedValue({ count: 1 })
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "buyer" } })
})

//

function listing(overrides: object = {}) {
    return {
        id: "l1", assetId: "CS2:1", marketName: SKIN, price: 8, game: "CS2", icon: "icon.png", hexColor: "eb4b4b", commodity: false,
        userId: "seller", user: { id: "seller", notificationEmail: null },
        ...overrides,
    }
}


async function placeOrder(order: object = {}) {
    const body = { marketName: SKIN, price: 10, quantity: 1, game: "CS2", icon: "icon.png", hexColor: "eb4b4b", ...order }
    const response = await POST(new Request("http://localhost/api/market/orders/buy", { method: "POST", body: JSON.stringify(body) }))

    return { status: response.status, body: await response.json() }
}

//

describe("place buy order", () => {

    it("A buyer needs a linked Steam account and trade URL.", async () => {
        prisma.user.findUnique.mockResolvedValue({ ...BUYER, steam_trade_url: null })

        expect((await placeOrder()).status).toBe(400)
    })


    it.each([0, -5, "10"])("Rejects a price of %j.", async (price) => {
        expect(await placeOrder({ price })).toEqual({ status: 400, body: { error: "Invalid price" } })
    })


    it.each([0, 1.5])("Rejects a quantity of %j.", async (quantity) => {
        expect(await placeOrder({ quantity })).toEqual({ status: 400, body: { error: "Invalid quantity" } })
    })


    it("A buyer can only have one buy order per item.", async () => {
        prisma.buy_order.findFirst.mockResolvedValue({ id: "existing" })

        expect((await placeOrder()).status).toBe(409)
    })


    it("A buyer who can't afford the whole order is turned away before any money moves.", async () => {
        prisma.user.findUnique.mockResolvedValue({ ...BUYER, cash: 15 })

        expect((await placeOrder({ price: 10, quantity: 2 })).status).toBe(400)
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })


    it("A bid buys a cheaper listing at the listing's price, and refunds the difference.", async () => {
        prisma.item_listing.findMany.mockResolvedValue([listing({ price: 8 })])

        expect(await placeOrder({ price: 10 })).toEqual({ status: 200, body: { matched: 1, remaining: 0 } })
        expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: "buyer", cash: { gte: 10 } }, data: { cash: { decrement: 10 } } })
        expect(prisma.purchase.create).toHaveBeenCalledWith({ data: expect.objectContaining({ price: 8, buyerId: "buyer", sellerId: "seller" }) })
        expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "buyer" }, data: { cash: { increment: 2 } } })
        expect(prisma.buy_order.create).not.toHaveBeenCalled()
    })


    it("Any quantity not matched becomes a standing buy order.", async () => {
        prisma.item_listing.findMany.mockResolvedValue([listing({ price: 10 })])

        expect(await placeOrder({ price: 10, quantity: 3 })).toEqual({ status: 200, body: { matched: 1, remaining: 2 } })
        expect(prisma.buy_order.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "buyer", marketName: SKIN, price: 10, quantity: 2 }) })
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it("A listing someone else buys mid-request becomes part of the standing order.", async () => {
        prisma.item_listing.findMany.mockResolvedValue([listing()])
        prisma.item_listing.deleteMany.mockResolvedValue({ count: 0 })

        expect(await placeOrder()).toEqual({ status: 200, body: { matched: 0, remaining: 1 } })
        expect(prisma.purchase.create).not.toHaveBeenCalled()
        expect(prisma.buy_order.create).toHaveBeenCalledWith({ data: expect.objectContaining({ quantity: 1 }) })
    })


    it("If the cash deduction fails, nothing is bought and no order is placed.", async () => {
        prisma.item_listing.findMany.mockResolvedValue([listing()])
        prisma.user.updateMany.mockResolvedValue({ count: 0 })

        expect(await placeOrder()).toEqual({ status: 400, body: { error: "Insufficient balance" } })
        expect(prisma.purchase.create).not.toHaveBeenCalled()
        expect(prisma.buy_order.create).not.toHaveBeenCalled()
    })


    it("The seller is emailed about the sale.", async () => {
        prisma.item_listing.findMany.mockResolvedValue([listing({ user: { id: "seller", notificationEmail: "seller@example.com" } })])

        await placeOrder()

        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ["seller@example.com"] }))
    })

})
