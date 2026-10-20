import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GET } from "@/app/api/cron/process-purchases/route"
import { verifyBuyerHasItem } from "@/lib/steam"
import { sendTradeCompleteEmails, sendReversalRefundEmails } from "@/lib/tradeNotifications"

//

const prisma = vi.hoisted(() => ({
    purchase: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    item_float: { findMany: vi.fn() },
    item_listing: { createMany: vi.fn() },
    cancelled_trade_offer: { createMany: vi.fn() },
    user: { update: vi.fn() },
    $transaction: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ prisma }))
vi.mock("@/lib/steam", () => ({ verifyBuyerHasItem: vi.fn() }))

vi.mock("@/lib/tradeNotifications", () => ({
    sendTradeCompleteEmails: vi.fn(),
    sendReversalRefundEmails: vi.fn(),
}))

//

const SKIN = "AK-47 | Redline (Field-Tested)"
const DAY = 24 * 60 * 60 * 1000
const BUYER_STEAM_ID = "76561198000000000"
const SELLER_STEAM_ID = "76561198000000001"

beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("CRON_SECRET", "test-secret")

    prisma.$transaction.mockImplementation((fn) => fn(prisma))
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
        id: "p1",
        status: "pending",
        price: 10,
        assetId: "CS2:1",
        marketName: SKIN,
        game: "CS2",
        icon: "icon.png",
        hexColor: "eb4b4b",
        commodity: false,
        buyerId: "buyer",
        sellerId: "seller",
        buyerTradeUrl: null,
        buyerPreCount: null,
        createdAt: daysAgo(1),
        deliveredAt: null,
        tradeOfferSentAt: null,
        tradeOfferId: null,
        buyer: { steam_id: BUYER_STEAM_ID, steam_trade_url: null, notificationEmail: "buyer@example.com" },
        seller: { steam_id: SELLER_STEAM_ID, steam_trade_url: null, notificationEmail: "seller@example.com" },
        ...overrides,
    }
}


function heldPastHold(overrides: object = {}) {
    return purchase({ status: "holding", deliveredAt: daysAgo(9), ...overrides })
}


function skinFloat() {
    prisma.item_float.findMany.mockResolvedValue([{ assetId: "CS2:1", floatValue: 0.25, paintSeed: 7 }])
}


function inventories(buyer: string, seller?: string) {
    vi.mocked(verifyBuyerHasItem).mockImplementation(async (steamId) => {
        return (steamId === BUYER_STEAM_ID ? buyer : seller) as never
    })
}


function expectRefund() {
    expect(prisma.purchase.updateMany).toHaveBeenCalledWith({
        where: { id: "p1", status: "holding" },
        data: { status: "reversed" },
    })

    expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "buyer" },
        data: { cash: { increment: 10 } },
    })
}


function expectSellerPaid() {
    expect(prisma.purchase.updateMany).toHaveBeenCalledWith({
        where: { id: "p1", status: "holding" },
        data: { status: "completed" },
    })

    expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "seller" },
        data: { cash: { increment: 10 } },
    })
}


async function run(...purchases: object[]) {
    prisma.purchase.findMany.mockResolvedValue(purchases)

    const request = new Request("http://localhost/api/cron/process-purchases", {
        headers: { authorization: "Bearer test-secret" },
    })

    const response = await GET(request)

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

        expect(prisma.purchase.updateMany).toHaveBeenCalledWith({
            where: { id: "p1", status: "holding" },
            data: { status: "completed" },
        })

        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: "seller" },
            data: { cash: { increment: 10 } },
        })

        expect(sendTradeCompleteEmails).toHaveBeenCalledWith([{
            marketName: SKIN,
            price: 10,
            buyerEmail: "buyer@example.com",
            sellerEmail: "seller@example.com",
        }])

        expect(summary.completed).toBe(1)
    })


    it("After the hold, a missing skin that is back with the seller is refunded as a reversal.", async () => {
        skinFloat()
        inventories("no_item", "has_item")

        const summary = await run(heldPastHold())

        expect(verifyBuyerHasItem).toHaveBeenLastCalledWith(
            SELLER_STEAM_ID,
            "CS2",
            SKIN,
            expect.objectContaining({ floatValue: 0.25, paintSeed: 7 }),
            null,
            null,
        )

        expectRefund()

        expect(sendReversalRefundEmails).toHaveBeenCalledWith([{
            marketName: SKIN,
            price: 10,
            buyerEmail: "buyer@example.com",
        }])

        expect(summary.reversed).toBe(1)
    })


    it("After the hold, a missing skin that isn't back with the seller pays the seller, since the buyer moved it.", async () => {
        skinFloat()
        inventories("no_item", "no_item")

        const summary = await run(heldPastHold())

        expectSellerPaid()
        expect(summary.completed).toBe(1)
        expect(summary.reversed).toBe(0)
    })


    it("A seller with a private inventory can't show the skin didn't come back, so the buyer is refunded.", async () => {
        skinFloat()
        inventories("no_item", "private")

        await run(heldPastHold())

        expectRefund()
    })


    it("A failed lookup of the seller's inventory moves no money.", async () => {
        skinFloat()
        inventories("no_item", "error")

        await run(heldPastHold())

        expect(prisma.purchase.updateMany).not.toHaveBeenCalled()
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it.each(["Dota2", "TF2", "Rust"])("A missing %s item pays the seller, since Steam can't reverse those trades.", async (game) => {
        inventories("no_item")

        await run(heldPastHold({ game, commodity: true }))

        expect(verifyBuyerHasItem).toHaveBeenCalledTimes(1)
        expectSellerPaid()
    })


    it("A missing CS2 stack is still refunded, since its copies can't be told apart.", async () => {
        inventories("no_item")

        await run(heldPastHold({ marketName: "Kilowatt Case", commodity: true }))

        expect(verifyBuyerHasItem).toHaveBeenCalledTimes(1)
        expectRefund()
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

        expect(prisma.purchase.updateMany).toHaveBeenCalledWith({
            where: { id: "p1", status: "pending" },
            data: { status: "holding", deliveredAt: expect.any(Date) },
        })

        expect(prisma.user.update).not.toHaveBeenCalled()
        expect(summary.delivered).toBe(1)
    })


    it("A pending order with no trade offer after 3 days is cancelled, refunded and relisted.", async () => {
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("no_item")

        const summary = await run(purchase({ createdAt: daysAgo(4) }))

        expect(prisma.purchase.deleteMany).toHaveBeenCalledWith({ where: { id: "p1", status: "pending" } })

        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: "buyer" },
            data: { cash: { increment: 10 } },
        })

        expect(prisma.item_listing.createMany).toHaveBeenCalledWith({
            data: [{
                assetId: "CS2:1",
                marketName: SKIN,
                price: 10,
                game: "CS2",
                icon: "icon.png",
                hexColor: "eb4b4b",
                commodity: false,
                userId: "seller",
            }],
            skipDuplicates: true,
        })

        expect(summary.autoCancelled).toBe(1)
    })


    it("A sent trade offer gets until Steam would expire it before the order is cancelled.", async () => {
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("no_item")

        await run(purchase({ createdAt: daysAgo(14), tradeOfferSentAt: daysAgo(13) }))

        expect(prisma.purchase.deleteMany).not.toHaveBeenCalled()
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it("A sent trade offer that never delivers is cancelled after 15 days, and queued for cancelling on Steam.", async () => {
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("no_item")
        prisma.purchase.findUnique.mockResolvedValue({ tradeOfferId: "12345" })

        const summary = await run(purchase({
            createdAt: daysAgo(17),
            tradeOfferSentAt: daysAgo(16),
            tradeOfferId: "12345",
        }))

        expect(prisma.cancelled_trade_offer.createMany).toHaveBeenCalledWith({
            data: [{ tradeOfferId: "12345", sellerId: "seller" }],
            skipDuplicates: true,
        })

        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: "buyer" },
            data: { cash: { increment: 10 } },
        })

        expect(summary.autoCancelled).toBe(1)
    })


    it("An order the extension is tracking is still checked, so delivery is seen without the extension.", async () => {
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("has_item")

        const summary = await run(purchase({ tradeOfferSentAt: daysAgo(1), tradeOfferId: "12345" }))

        expect(prisma.purchase.updateMany).toHaveBeenCalledWith({
            where: { id: "p1", status: "pending" },
            data: { status: "holding", deliveredAt: expect.any(Date) },
        })

        expect(summary.delivered).toBe(1)
    })


    it("A Steam error moves no money, so the order is retried next run.", async () => {
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("error")

        await run(
            purchase({ status: "holding", deliveredAt: daysAgo(9) }),
            purchase({ id: "p2", createdAt: daysAgo(4) }),
        )

        expect(prisma.purchase.updateMany).not.toHaveBeenCalled()
        expect(prisma.purchase.deleteMany).not.toHaveBeenCalled()
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it("An order with a price of zero or less never moves money.", async () => {
        await run(
            purchase({ status: "holding", deliveredAt: daysAgo(9), price: -5 }),
            purchase({ id: "p2", price: 0 }),
        )

        expect(verifyBuyerHasItem).not.toHaveBeenCalled()
        expect(prisma.user.update).not.toHaveBeenCalled()
    })


    it("One order that fails doesn't stop the rest from being processed.", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        vi.mocked(verifyBuyerHasItem).mockResolvedValue("no_item")
        prisma.user.update.mockRejectedValueOnce(new Error("database down"))

        const response = await run(
            purchase({ id: "p1", createdAt: daysAgo(4) }),
            purchase({ id: "p2", createdAt: daysAgo(4) }),
        )

        expect(response.autoCancelled).toBe(1)
        expect(prisma.purchase.deleteMany).toHaveBeenCalledWith({ where: { id: "p2", status: "pending" } })
    })

})
