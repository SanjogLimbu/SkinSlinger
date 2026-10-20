import { describe, it, expect, vi, beforeEach } from "vitest"
import { getServerSession } from "next-auth"
import { buildListings, findPriceFormatError, trustedMarketName, ListingRequest } from "@/lib/listings"
import { verifyInventoryToken } from "@/lib/inventoryToken"
import { countInventoryItem, SteamItem } from "@/lib/steam"
import { POST } from "@/app/api/listings/route"
import { PATCH } from "@/app/api/listings/[id]/route"

//

const prisma = vi.hoisted(() => ({
    user: { findUnique: vi.fn(), update: vi.fn() },
    item: { findMany: vi.fn() },
    item_float: { findMany: vi.fn() },
    item_listing: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
        update: vi.fn(),
    },
    buy_order: { findFirst: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    purchase: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/db", () => ({ prisma }))
vi.mock("@/lib/inventoryToken", () => ({ verifyInventoryToken: vi.fn() }))
vi.mock("@/lib/steam", () => ({ countInventoryItem: vi.fn() }))
vi.mock("resend", () => ({ Resend: class { emails = { send: vi.fn() } } }))

//

const SKIN = "P250 | Sand Dune (Field-Tested)"
const CASE = "Kilowatt Case"

//

function owned(assetId: string, market_name: string, commodity = false): SteamItem {
    return {
        assetId,
        market_name,
        market_hash_name: market_name,
        icon: "icon.png",
        tradable: true,
        type: "",
        price: 0,
        hexColor: "b0c3d9",
        game: "CS2",
        commodity,
        inspectLink: null,
        floatValue: null,
        paintSeed: null,
        stickers: null,
    }
}


function request(overrides: Partial<ListingRequest>): ListingRequest {
    return {
        assetId: "CS2:1",
        marketName: SKIN,
        price: 5,
        commodity: false,
        quantity: 1,
        ...overrides,
    }
}


function inventory(...items: SteamItem[]) {
    return new Map(items.map((item) => [item.assetId, item]))
}


function token(...items: SteamItem[]) {
    return items.map((item) => ({ assetId: item.assetId, marketName: item.market_name }))
}

//

describe("findPriceFormatError", () => {

    it("Accepts whole-cent prices from $0.01 to $1,000,000.", () => {
        const items = [request({ price: 0.01 }), request({ price: 12.5 }), request({ price: 1_000_000 })]

        expect(findPriceFormatError(items)).toBeNull()
    })


    it("Rejects negative and zero prices, which would turn a purchase into a credit.", () => {
        expect(findPriceFormatError([request({ price: -10 })])).toBe("Invalid price")
        expect(findPriceFormatError([request({ price: 0 })])).toBe("Invalid price")
    })


    it("Rejects prices above $1,000,000.", () => {
        expect(findPriceFormatError([request({ price: 1_000_000.01 })])).toBe("Invalid price")
    })


    it("Rejects prices that are not real numbers.", () => {
        const text = "5" as unknown as number

        expect(findPriceFormatError([request({ price: NaN })])).toBe("Invalid price")
        expect(findPriceFormatError([request({ price: Infinity })])).toBe("Invalid price")
        expect(findPriceFormatError([request({ price: text })])).toBe("Invalid price")
    })


    it("Rejects fractions of a cent.", () => {
        const error = findPriceFormatError([request({ price: 1.005 })])

        expect(error).toBe("Prices can't have more than two decimal places.")
    })


    it("Is not thrown off by floating-point error.", () => {
        // 0.1 + 0.2 is 0.30000000000000004 in JavaScript.
        expect(findPriceFormatError([request({ price: 0.1 + 0.2 })])).toBeNull()
    })


    it("One bad price fails the whole request.", () => {
        const items = [request({ price: 5 }), request({ price: -1 })]

        expect(findPriceFormatError(items)).toBe("Invalid price")
    })

})

//

describe("trustedMarketName", () => {

    it("A unique item's name comes from the inventory, not the request.", () => {
        const item = request({ assetId: "CS2:1", marketName: "AWP | Dragon Lore (Factory New)" })

        expect(trustedMarketName(item, inventory(owned("CS2:1", SKIN)))).toBe(SKIN)
    })


    it("A unique item missing from the inventory has no name.", () => {
        expect(trustedMarketName(request({ assetId: "CS2:9" }), inventory())).toBe("")
    })


    it("A stack is named by the request.", () => {
        const stack = request({ marketName: CASE, commodity: true })

        expect(trustedMarketName(stack, inventory())).toBe(CASE)
    })

})

//

describe("buildListings", () => {

    it("Lists an owned item, taking only the price from the request.", () => {
        const skin = owned("CS2:1", SKIN)
        const item = request({ assetId: "CS2:1", marketName: "AWP | Dragon Lore (Factory New)", price: 7.5 })

        expect(buildListings([item], "seller", token(skin), inventory(skin), new Set())).toEqual([{
            userId: "seller",
            assetId: "CS2:1",
            marketName: SKIN,
            price: 7.5,
            game: "CS2",
            icon: "icon.png",
            hexColor: "b0c3d9",
            commodity: false,
        }])
    })


    it("Skips an item that is not in the signed inventory token.", () => {
        const skin = owned("CS2:1", SKIN)
        const listings = buildListings([request({})], "seller", token(), inventory(skin), new Set())

        expect(listings).toEqual([])
    })


    it("Skips an item that has left the seller's inventory.", () => {
        const skin = owned("CS2:1", SKIN)
        const listings = buildListings([request({})], "seller", token(skin), inventory(), new Set())

        expect(listings).toEqual([])
    })


    it("Skips an item that is unavailable, such as one already listed.", () => {
        const skin = owned("CS2:1", SKIN)
        const listings = buildListings([request({})], "seller", token(skin), inventory(skin), new Set(["CS2:1"]))

        expect(listings).toEqual([])
    })


    it("Lists an item once even if the request repeats it.", () => {
        const skin = owned("CS2:1", SKIN)
        const item = request({ assetId: "CS2:1" })

        expect(buildListings([item, item], "seller", token(skin), inventory(skin), new Set())).toHaveLength(1)
    })


    it("A stack lists only the quantity asked for.", () => {
        const cases = [1, 2, 3, 4, 5].map((n) => owned(`CS2:${n}`, CASE, true))
        const item = request({ marketName: CASE, commodity: true, quantity: 3 })
        const listings = buildListings([item], "seller", token(...cases), inventory(...cases), new Set())

        expect(listings).toHaveLength(3)
    })


    it("A stack never lists more than the seller owns.", () => {
        const cases = [1, 2].map((n) => owned(`CS2:${n}`, CASE, true))
        const item = request({ marketName: CASE, commodity: true, quantity: 10 })
        const listings = buildListings([item], "seller", token(...cases), inventory(...cases), new Set())

        expect(listings).toHaveLength(2)
    })


    it("A negative stack quantity lists nothing.", () => {
        const cases = [1, 2].map((n) => owned(`CS2:${n}`, CASE, true))
        const item = request({ marketName: CASE, commodity: true, quantity: -1 })
        const listings = buildListings([item], "seller", token(...cases), inventory(...cases), new Set())

        expect(listings).toEqual([])
    })

})

//

describe("list items", () => {

    const skin = owned("CS2:1", SKIN)

    beforeEach(() => {
        vi.resetAllMocks()

        vi.mocked(getServerSession).mockResolvedValue({ user: { email: "seller@example.com" } })
        vi.mocked(verifyInventoryToken).mockResolvedValue(token(skin))

        prisma.user.findUnique.mockResolvedValue({ id: "seller", inventoryCache: [skin], notificationEmail: null })
        prisma.item.findMany.mockResolvedValue([])
        prisma.item_float.findMany.mockResolvedValue([])
        prisma.item_listing.findMany.mockResolvedValue([])
        prisma.purchase.findMany.mockResolvedValue([])
        prisma.$transaction.mockImplementation((fn) => fn(prisma))
        prisma.item_listing.findUnique.mockResolvedValue(null)
    })


    function sellCasesToBuyOrder() {
        const cases = [1, 2].map((n) => owned(`CS2:${n}`, CASE, true))

        vi.mocked(verifyInventoryToken).mockResolvedValue(token(...cases))
        prisma.user.findUnique.mockResolvedValue({ id: "seller", inventoryCache: cases, notificationEmail: null })

        prisma.item_listing.findUnique.mockImplementation(({ where }) => ({
            id: where.assetId,
            assetId: where.assetId,
            userId: "seller",
            marketName: CASE,
            price: 5,
            game: "CS2",
            icon: "icon.png",
            hexColor: "b0c3d9",
            commodity: true,
        }))

        prisma.buy_order.findFirst.mockResolvedValue({
            id: "order",
            userId: "buyer",
            price: 5,
            user: { steam_id: "76561198000000000", steam_trade_url: "https://steamcommunity.com/tradeoffer/new/?partner=1&token=a" },
        })

        prisma.item_listing.deleteMany.mockResolvedValue({ count: 1 })
        prisma.buy_order.updateMany.mockResolvedValue({ count: 1 })
        prisma.buy_order.deleteMany.mockResolvedValue({ count: 0 })

        return listItems([request({ marketName: CASE, commodity: true, quantity: 2 })])
    }


    async function listItems(items: ListingRequest[]) {
        const request = new Request("http://localhost/api/listings", {
            method: "POST",
            body: JSON.stringify({ items, inventoryToken: "token" }),
        })

        return POST(request)
    }


    it("Lists an item the seller owns.", async () => {
        expect((await listItems([request({})])).status).toBe(200)

        expect(prisma.item_listing.createMany).toHaveBeenCalledWith({
            data: [expect.objectContaining({ assetId: "CS2:1", userId: "seller" })],
            skipDuplicates: true,
        })
    })


    it("An item that has sold but not been delivered can't be listed again, though it's still in the inventory.", async () => {
        prisma.purchase.findMany.mockResolvedValue([{ assetId: "CS2:1" }])

        expect((await listItems([request({})])).status).toBe(200)
        expect(prisma.item_listing.createMany).not.toHaveBeenCalled()

        expect(prisma.purchase.findMany).toHaveBeenCalledWith({
            where: { sellerId: "seller", status: { in: ["pending", "holding"] } },
            select: { assetId: true },
        })
    })


    it("Each copy sold to a buy order needs its own delivery, so sending one can't settle both.", async () => {
        vi.mocked(countInventoryItem).mockResolvedValue(4)

        expect((await sellCasesToBuyOrder()).status).toBe(200)

        const preCounts = prisma.purchase.create.mock.calls.map(([{ data }]) => data.buyerPreCount)

        expect(preCounts).toEqual([4, 5])
    })


    it("Doesn't sell to a buy order when the buyer's copies can't be counted, rather than guessing.", async () => {
        vi.mocked(countInventoryItem).mockResolvedValue(null)

        expect((await sellCasesToBuyOrder()).status).toBe(200)
        expect(prisma.item_listing.createMany).toHaveBeenCalled()
        expect(prisma.purchase.create).not.toHaveBeenCalled()
    })

})


describe("edit a listing's price", () => {

    beforeEach(() => {
        vi.resetAllMocks()

        vi.mocked(getServerSession).mockResolvedValue({ user: { id: "seller" } })

        prisma.item_listing.findUnique.mockResolvedValue({
            id: "l1",
            userId: "seller",
            assetId: "CS2:1",
            marketName: SKIN,
            price: 5,
            commodity: false,
        })

        prisma.item_float.findMany.mockResolvedValue([])
        prisma.item.findMany.mockResolvedValue([{ marketName: SKIN, price: 10 }])
    })


    async function editPrice(price: unknown) {
        const request = new Request("http://localhost/api/listings/l1", {
            method: "PATCH",
            body: JSON.stringify({ price }),
        })

        const response = await PATCH(request, { params: Promise.resolve({ id: "l1" }) })

        return { status: response.status, body: await response.json() }
    }


    it("Saves a price inside the limits.", async () => {
        expect((await editPrice(12.5)).status).toBe(200)

        expect(prisma.item_listing.update).toHaveBeenCalledWith({
            where: { id: "l1" },
            data: { price: 12.5 },
        })
    })


    it("Can't be edited above the cap a new listing would have.", async () => {
        expect(await editPrice(50)).toEqual({
            status: 400,
            body: { error: `${SKIN} can't be listed above $30.00.` },
        })

        expect(prisma.item_listing.update).not.toHaveBeenCalled()
    })


    it("Can't be edited below the floor a new listing would have.", async () => {
        expect((await editPrice(0.5)).status).toBe(400)
        expect(prisma.item_listing.update).not.toHaveBeenCalled()
    })


    it.each([0.001, 5.123, -1, "5"])("Rejects a price of %j.", async (price) => {
        expect((await editPrice(price)).status).toBe(400)
        expect(prisma.item_listing.update).not.toHaveBeenCalled()
    })


    it("Only the seller can edit their listing.", async () => {
        vi.mocked(getServerSession).mockResolvedValue({ user: { id: "someone-else" } })

        expect((await editPrice(12.5)).status).toBe(403)
        expect(prisma.item_listing.update).not.toHaveBeenCalled()
    })

})
