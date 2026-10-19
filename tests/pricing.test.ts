import { describe, it, expect } from "vitest"
import * as pricing from "@/lib/pricing"

//

describe("pricingCalculations", () => {

    it("Should not be able to list an item with more than a 90% discount on its market price.", () => {
        const market_price = 100
        const price = pricing.minListingPrice(market_price)

        expect(price).toBe(10)
    }) 


    it("Should not be able to list an item for more than a 3x its market price.", () => {
        const market_price = 100
        const price = pricing.maxListingPrice(market_price, [], () => 0)

        expect(price).toBe(300)
    }) 


    it("Stickers add 15% of their market price to an item's value, less their wear.", () => {
        const priceOf = (name: string) => name === "Sticker | Crown (Foil)" ? 20 : 0
        const stickers = [{ name: "Crown (Foil)", wear: 0.5 }]

        const value = pricing.stickerValue(stickers, priceOf)

        expect(value).toBe(1.5)
    })


    it("Unknown sticker wear counts as unscraped, and a fully scraped sticker adds nothing.", () => {
        const stickers = [{ name: "A", wear: null }, { name: "B", wear: 1 }]

        expect(pricing.stickerValue(stickers, () => 10)).toBe(1.5)
    })


    it("An item with no stickers gets no sticker value.", () => {
        expect(pricing.stickerValue(null, () => 10)).toBe(0)
    })


    it("Sticker value raises an item's max listing price.", () => {
        const stickers = [{ name: "Crown (Foil)", wear: 0 }]

        expect(pricing.maxListingPrice(100, stickers, () => 20)).toBe(309)
    })


    it("Min listing price is not thrown off by floating-point error.", () => {
        // 1.1 * 0.1 is 0.11000000000000001 in JavaScript.
        expect(pricing.minListingPrice(1.1)).toBe(0.11)
    })


    it("Min listing price always rounds up to the next cent.", () => {
        expect(pricing.minListingPrice(1.23)).toBe(0.13)
    })


    it("Min listing price is never below 1 cent.", () => {
        expect(pricing.minListingPrice(0.01)).toBe(0.01)
    })


    it("Items with no market price have no listing limits.", () => {
        expect(pricing.minListingPrice(0)).toBeNull()
        expect(pricing.maxListingPrice(0, [], () => 0)).toBeNull()
        expect(pricing.maxListingPrice(-5, [], () => 0)).toBeNull()
    })

})

