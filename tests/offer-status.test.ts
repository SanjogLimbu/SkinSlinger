import { describe, it, expect, vi, beforeEach } from "vitest"
import { getServerSession } from "next-auth"
import { POST } from "@/app/api/extension/offer-status/route"

//

const prisma = vi.hoisted(() => ({
    purchase: { findMany: vi.fn(), updateMany: vi.fn() },
    cancelled_trade_offer: { deleteMany: vi.fn() },
}))

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/db", () => ({ prisma }))
vi.mock("@/lib/tradeNotifications", () => ({ sendTradeOfferSentEmail: vi.fn() }))

//

beforeEach(() => {
    vi.resetAllMocks()

    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "seller" } })
    prisma.purchase.updateMany.mockResolvedValue({ count: 1 })

    prisma.purchase.findMany.mockResolvedValue([{
        id: "p1",
        sellerId: "seller",
        status: "pending",
        marketName: "AK-47 | Redline (Field-Tested)",
        price: 10,
        buyer: { notificationEmail: null },
        seller: { name: "Seller" },
    }])
})

//

async function report(update: object) {
    const request = new Request("http://localhost/api/extension/offer-status", {
        method: "POST",
        body: JSON.stringify({ updates: [{ orderId: "p1", ...update }] }),
    })

    return POST(request)
}

//

describe("extension offer status", () => {

    it("An 'accepted' report doesn't start the hold, since only our own inventory check can.", async () => {
        expect((await report({ state: "accepted" })).status).toBe(200)

        expect(prisma.purchase.updateMany).not.toHaveBeenCalled()
    })


    it("An 'active' report records the trade offer.", async () => {
        await report({ state: "active", tradeOfferId: "12345" })

        expect(prisma.purchase.updateMany).toHaveBeenCalledWith({
            where: { id: "p1", status: "pending" },
            data: { tradeOfferId: "12345" },
        })
    })


    it("A 'gone' report clears the trade offer, so the order can be cancelled.", async () => {
        await report({ state: "gone" })

        expect(prisma.purchase.updateMany).toHaveBeenCalledWith({
            where: { id: "p1", status: "pending" },
            data: { tradeOfferSentAt: null, tradeOfferId: null },
        })
    })

})
