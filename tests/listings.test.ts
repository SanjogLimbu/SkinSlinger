import { describe, it, expect } from "vitest"
import { buildListings, findPriceFormatError, trustedMarketName, ListingRequest } from "@/lib/listings"
import { SteamItem } from "@/lib/steam"

//

const SKIN = "P250 | Sand Dune (Field-Tested)"
const CASE = "Kilowatt Case"

//

function owned(assetId: string, market_name: string, commodity = false): SteamItem {
    return { assetId, market_name, market_hash_name: market_name, icon: "icon.png", tradable: true, type: "", price: 0, hexColor: "b0c3d9", game: "CS2", commodity, inspectLink: null, floatValue: null, paintSeed: null, stickers: null }
}


function request(overrides: Partial<ListingRequest>): ListingRequest {
    return { assetId: "CS2:1", marketName: SKIN, price: 5, commodity: false, quantity: 1, ...overrides }
}


function inventory(...items: SteamItem[]) {
    return new Map(items.map(item => [item.assetId, item]))
}


function token(...items: SteamItem[]) {
    return items.map(item => ({ assetId: item.assetId, marketName: item.market_name }))
}

//

describe("findPriceFormatError", () => {

    it("Accepts whole-cent prices from $0.01 to $1,000,000.", () => {
        expect(findPriceFormatError([request({ price: 0.01 }), request({ price: 12.5 }), request({ price: 1_000_000 })])).toBeNull()
    })


    it("Rejects negative and zero prices, which would turn a purchase into a credit.", () => {
        expect(findPriceFormatError([request({ price: -10 })])).toBe("Invalid price")
        expect(findPriceFormatError([request({ price: 0 })])).toBe("Invalid price")
    })


    it("Rejects prices above $1,000,000.", () => {
        expect(findPriceFormatError([request({ price: 1_000_000.01 })])).toBe("Invalid price")
    })


    it("Rejects prices that are not real numbers.", () => {
        expect(findPriceFormatError([request({ price: NaN })])).toBe("Invalid price")
        expect(findPriceFormatError([request({ price: Infinity })])).toBe("Invalid price")
        expect(findPriceFormatError([request({ price: "5" as unknown as number })])).toBe("Invalid price")
    })


    it("Rejects fractions of a cent.", () => {
        expect(findPriceFormatError([request({ price: 1.005 })])).toBe("Prices can't have more than two decimal places.")
    })


    it("Is not thrown off by floating-point error.", () => {
        // 0.1 + 0.2 is 0.30000000000000004 in JavaScript
        expect(findPriceFormatError([request({ price: 0.1 + 0.2 })])).toBeNull()
    })


    it("One bad price fails the whole request.", () => {
        expect(findPriceFormatError([request({ price: 5 }), request({ price: -1 })])).toBe("Invalid price")
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
        expect(trustedMarketName(request({ marketName: CASE, commodity: true }), inventory())).toBe(CASE)
    })

})

//

describe("buildListings", () => {

    it("Lists an owned item, taking only the price from the request.", () => {
        const skin = owned("CS2:1", SKIN)
        const item = request({ assetId: "CS2:1", marketName: "AWP | Dragon Lore (Factory New)", price: 7.5 })

        expect(buildListings([item], "seller", token(skin), inventory(skin), new Set())).toEqual([
            { userId: "seller", assetId: "CS2:1", marketName: SKIN, price: 7.5, game: "CS2", icon: "icon.png", hexColor: "b0c3d9", commodity: false },
        ])
    })


    it("Skips an item that is not in the signed inventory token.", () => {
        const skin = owned("CS2:1", SKIN)

        expect(buildListings([request({ assetId: "CS2:1" })], "seller", token(), inventory(skin), new Set())).toEqual([])
    })


    it("Skips an item that has left the seller's inventory.", () => {
        const skin = owned("CS2:1", SKIN)

        expect(buildListings([request({ assetId: "CS2:1" })], "seller", token(skin), inventory(), new Set())).toEqual([])
    })


    it("Skips an item that is already listed.", () => {
        const skin = owned("CS2:1", SKIN)

        expect(buildListings([request({ assetId: "CS2:1" })], "seller", token(skin), inventory(skin), new Set(["CS2:1"]))).toEqual([])
    })


    it("Lists an item once even if the request repeats it.", () => {
        const skin = owned("CS2:1", SKIN)
        const item = request({ assetId: "CS2:1" })

        expect(buildListings([item, item], "seller", token(skin), inventory(skin), new Set())).toHaveLength(1)
    })


    it("A stack lists only the quantity asked for.", () => {
        const cases = [1, 2, 3, 4, 5].map(n => owned(`CS2:${n}`, CASE, true))
        const item = request({ marketName: CASE, commodity: true, quantity: 3 })

        expect(buildListings([item], "seller", token(...cases), inventory(...cases), new Set())).toHaveLength(3)
    })


    it("A stack never lists more than the seller owns.", () => {
        const cases = [1, 2].map(n => owned(`CS2:${n}`, CASE, true))
        const item = request({ marketName: CASE, commodity: true, quantity: 10 })

        expect(buildListings([item], "seller", token(...cases), inventory(...cases), new Set())).toHaveLength(2)
    })


    it("A negative stack quantity lists nothing.", () => {
        const cases = [1, 2].map(n => owned(`CS2:${n}`, CASE, true))
        const item = request({ marketName: CASE, commodity: true, quantity: -1 })

        expect(buildListings([item], "seller", token(...cases), inventory(...cases), new Set())).toEqual([])
    })

})
