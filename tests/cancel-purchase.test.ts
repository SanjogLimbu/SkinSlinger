import { describe, it, expect, vi, beforeEach } from "vitest"
import { getServerSession } from "next-auth"
import { POST } from "@/app/api/purchase/[id]/cancel/route"
import { verifyBuyerHasItem } from "@/lib/steam"

//

const prisma = vi.hoisted(() => ({
    purchase: { findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    item_float: { findUnique: vi.fn() },
    item_listing: { create: vi.fn() },
    cancelled_trade_offer: { createMany: vi.fn() },
    user: { update: vi.fn() },
    $transaction: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/db", () => ({ prisma }))
vi.mock("@/lib/steam", () => ({ verifyBuyerHasItem: vi.fn() }))

//

const SKIN = "AK-47 | Redline (Field-Tested)"

beforeEach(() => {
    vi.resetAllMocks()

    prisma.$transaction.mockImplementation(fn => fn(prisma))
    prisma.purchase.deleteMany.mockResolvedValue({ count: 1 })
    vi.mocked(verifyBuyerHasItem).mockResolvedValue("no_item")
    signIn("seller")
})

//

function signIn(id: string | null) {
    vi.mocked(getServerSession).mockResolvedValue(id ? { user: { id } } : null)
}


// The route reads the purchase, then re-reads its trade offer id inside the transaction
function stored(overrides: object = {}, tradeOfferId: string | null = null) {
    const row = {
        id: "p1", status: "pending", price: 10, assetId: "CS2:1", marketName: SKIN, game: "CS2", icon: "icon.png", hexColor: "eb4b4b", commodity: false,
        buyerId: "buyer", sellerId: "seller", buyerTradeUrl: null,
        buyer: { steam_id: "76561198000000000", steam_trade_url: null },
        ...overrides,
    }

    prisma.purchase.findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce({ tradeOfferId })
}


async function cancel() {
    const response = await POST(new Request("http://localhost/api/purchase/p1/cancel", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) })

    return { status: response.status, body: await response.json() }
}

//

describe("cancel purchase", () => {

    it("Rejects a user who is not signed in.", async () => {
        signIn(null)

        expect((await cancel()).status).toBe(401)
    })


    it("Only the seller can cancel, not the buyer.", async () => {
        signIn("buyer")
        stored()

        expect((await cancel()).status).toBe(403)
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it.each(["holding", "completed", "reversed"])("A %s order can't be cancelled.", async (status) => {
        stored({ status })

        expect((await cancel()).status).toBe(409)
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it("Refuses to cancel when Steam can't be reached.", async () => {
        stored()
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("error")

        expect((await cancel()).status).toBe(503)
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it("Refuses to cancel while the buyer's inventory is private.", async () => {
        stored()
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("private")

        expect((await cancel()).status).toBe(409)
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it("If the buyer already has the item, the order starts the hold instead of being refunded.", async () => {
        stored()
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("has_item")

        expect((await cancel()).status).toBe(409)
        expect(prisma.purchase.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "pending" }, data: { status: "holding", deliveredAt: expect.any(Date) } })
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it("A cancel refunds the buyer and puts the listing back.", async () => {
        stored()

        expect((await cancel()).status).toBe(200)
        expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "buyer" }, data: { cash: { increment: 10 } } })
        expect(prisma.item_listing.create).toHaveBeenCalledWith({
            data: { assetId: "CS2:1", marketName: SKIN, price: 10, game: "CS2", icon: "icon.png", hexColor: "eb4b4b", commodity: false, userId: "seller" },
        })
        expect(prisma.cancelled_trade_offer.createMany).not.toHaveBeenCalled()
    })


    it("A trade offer that was already sent is queued for the extension to cancel on Steam.", async () => {
        stored({}, "offer-123")

        expect((await cancel()).status).toBe(200)
        expect(prisma.cancelled_trade_offer.createMany).toHaveBeenCalledWith({ data: [{ tradeOfferId: "offer-123", sellerId: "seller" }], skipDuplicates: true })
    })


    it("An order another request already finished is not refunded twice.", async () => {
        stored()
        prisma.purchase.deleteMany.mockResolvedValue({ count: 0 })

        expect((await cancel()).status).toBe(200)
        expect(prisma.user.update).not.toHaveBeenCalled()
        expect(prisma.item_listing.create).not.toHaveBeenCalled()
    })

})
