import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GET } from "@/app/api/cron/process-purchases/route"
import { verifyBuyerHasItem } from "@/lib/steam"
import { sendTradeCompleteEmails, sendReversalRefundEmails } from "@/lib/tradeNotifications"

//

const prisma = vi.hoisted(() => ({
    purchase: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    item_float: { findMany: vi.fn() },
    item_listing: { create: vi.fn() },
    user: { update: vi.fn() },
    $transaction: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ prisma }))
vi.mock("@/lib/steam", () => ({ verifyBuyerHasItem: vi.fn() }))
vi.mock("@/lib/tradeNotifications", () => ({ sendTradeCompleteEmails: vi.fn(), sendReversalRefundEmails: vi.fn() }))

//

const SKIN = "AK-47 | Redline (Field-Tested)"
const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("CRON_SECRET", "test-secret")

    prisma.$transaction.mockImplementation(fn => fn(prisma))
    prisma.item_float.findMany.mockResolvedValue([])
    prisma.purchase.updateMany.mockResolvedValue({ count: 1 })
    prisma.purchase.deleteMany.mockResolvedValue({ count: 1 })
})

afterEach(() => vi.unstubAllEnvs())

//

function daysAgo(days: number) {
    return new Date(Date.now() - days * DAY)
}


function purchase(overrides: object = {}) {
    return {
        id: "p1", status: "pending", price: 10, assetId: "CS2:1", marketName: SKIN, game: "CS2", icon: "icon.png", hexColor: "eb4b4b", commodity: false,
        buyerId: "buyer", sellerId: "seller", buyerTradeUrl: null, buyerPreCount: null,
        createdAt: daysAgo(1), deliveredAt: null, tradeOfferSentAt: null, tradeOfferId: null,
        buyer: { steam_id: "76561198000000000", steam_trade_url: null, notificationEmail: "buyer@example.com" },
        seller: { notificationEmail: "seller@example.com" },
        ...overrides,
    }
}


async function run(...purchases: object[]) {
    prisma.purchase.findMany.mockResolvedValue(purchases)

    const response = await GET(new Request("http://localhost/api/cron/process-purchases", { headers: { authorization: "Bearer test-secret" } }))

    return response.json()
}

//

describe("process-purchases cron", () => {

    it("Rejects a request without the cron secret.", async () => {
        const response = await GET(new Request("http://localhost/api/cron/process-purchases"))

        expect(response.status).toBe(401)
        expect(prisma.purchase.findMany).not.toHaveBeenCalled()
    })


    it("An order still inside the 8-day hold is not checked.", async () => {
        await run(purchase({ status: "holding", deliveredAt: daysAgo(7) }))

        expect(verifyBuyerHasItem).not.toHaveBeenCalled()
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it.each(["has_item", "private"] as const)("After the hold, the seller is paid when the check returns %s.", async (result) => {
        vi.mocked(verifyBuyerHasItem).mockResolvedValue(result)

        const summary = await run(purchase({ status: "holding", deliveredAt: daysAgo(9) }))

        expect(prisma.purchase.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "holding" }, data: { status: "completed" } })
        expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "seller" }, data: { cash: { increment: 10 } } })
        expect(sendTradeCompleteEmails).toHaveBeenCalledWith([{ marketName: SKIN, price: 10, buyerEmail: "buyer@example.com", sellerEmail: "seller@example.com" }])
        expect(summary.completed).toBe(1)
    })


    it("After the hold, the buyer is refunded if the item has gone (a trade reversal).", async () => {
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("no_item")

        const summary = await run(purchase({ status: "holding", deliveredAt: daysAgo(9) }))

        expect(prisma.purchase.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "holding" }, data: { status: "reversed" } })
        expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "buyer" }, data: { cash: { increment: 10 } } })
        expect(sendReversalRefundEmails).toHaveBeenCalledWith([{ marketName: SKIN, price: 10, buyerEmail: "buyer@example.com" }])
        expect(summary.reversed).toBe(1)
    })


    it("A finished order is not paid twice when another run got there first.", async () => {
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("has_item")
        prisma.purchase.updateMany.mockResolvedValue({ count: 0 })

        const summary = await run(purchase({ status: "holding", deliveredAt: daysAgo(9) }))

        expect(prisma.user.update).not.toHaveBeenCalled()
        expect(summary.completed).toBe(0)
    })


    it("A pending order whose item has arrived starts the hold, without paying anyone.", async () => {
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("has_item")

        const summary = await run(purchase())

        expect(prisma.purchase.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "pending" }, data: { status: "holding", deliveredAt: expect.any(Date) } })
        expect(prisma.user.update).not.toHaveBeenCalled()
        expect(summary.delivered).toBe(1)
    })


    it("A pending order with no trade offer after 3 days is cancelled, refunded and relisted.", async () => {
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("no_item")

        const summary = await run(purchase({ createdAt: daysAgo(4) }))

        expect(prisma.purchase.deleteMany).toHaveBeenCalledWith({ where: { id: "p1", status: "pending" } })
        expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "buyer" }, data: { cash: { increment: 10 } } })
        expect(prisma.item_listing.create).toHaveBeenCalledWith({
            data: { assetId: "CS2:1", marketName: SKIN, price: 10, game: "CS2", icon: "icon.png", hexColor: "eb4b4b", commodity: false, userId: "seller" },
        })
        expect(summary.autoCancelled).toBe(1)
    })


    it("A pending order is not cancelled once the seller has sent a trade offer.", async () => {
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("no_item")

        await run(purchase({ createdAt: daysAgo(4), tradeOfferSentAt: daysAgo(3) }))

        expect(prisma.purchase.deleteMany).not.toHaveBeenCalled()
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it("An order the extension is tracking is left for the extension to report.", async () => {
        await run(purchase({ tradeOfferId: "12345" }))

        expect(verifyBuyerHasItem).not.toHaveBeenCalled()
    })


    it("A Steam error moves no money, so the order is retried next run.", async () => {
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("error")

        await run(purchase({ status: "holding", deliveredAt: daysAgo(9) }), purchase({ id: "p2", createdAt: daysAgo(4) }))

        expect(prisma.purchase.updateMany).not.toHaveBeenCalled()
        expect(prisma.purchase.deleteMany).not.toHaveBeenCalled()
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it("An order with a price of zero or less never moves money.", async () => {
        await run(purchase({ status: "holding", deliveredAt: daysAgo(9), price: -5 }), purchase({ id: "p2", price: 0 }))

        expect(verifyBuyerHasItem).not.toHaveBeenCalled()
        expect(prisma.user.update).not.toHaveBeenCalled()
    })

})
