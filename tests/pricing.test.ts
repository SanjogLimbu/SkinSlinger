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


})

