export type Sticker = { name: string, wear: number | null }
type PriceLookup = (marketName: string) => number

//

const MAX_LISTING_MARKUP = 3 // Highest listing price allowed, as a multiple of the item's market value
const MIN_LISTING_FRACTION = 0.1 // Lowest listing price allowed, as a fraction of the item's market price (0.1 = -90%)
const STICKER_VALUE_SHARE = 0.15 // Share of a sticker's market price that it adds to an item's value

//

function roundToCent(price: number): number {
    return Math.round(price * 100) / 100
}


function roundUpToCent(price: number): number {
    return Math.ceil(price * 100 - 1e-6) / 100
}

//

export function stickerMarketName(name: string): string {
    return `Sticker | ${name}`
}


// Extra value an item gets from its stickers, scaled down by how scraped each one is
export function stickerValue(stickers: Sticker[] | null | undefined, priceOf: PriceLookup): number {
    if (!stickers) return 0

    let total = 0

    for (const sticker of stickers) {
        const price = priceOf(stickerMarketName(sticker.name))
        const unscraped = 1 - (sticker.wear ?? 0)

        total += price * unscraped * STICKER_VALUE_SHARE
    }


    return total
}


// Highest price an item can be listed for, or null when it has no market price to compare against
export function maxListingPrice(marketPrice: number, stickers: Sticker[] | null | undefined, priceOf: PriceLookup): number | null {
    if (marketPrice <= 0) return null

    const itemValue = marketPrice + stickerValue(stickers, priceOf)

    return roundToCent(itemValue * MAX_LISTING_MARKUP)
}


// Lowest price an item can be listed for (never below 1 cent), or null when it has no market price
export function minListingPrice(marketPrice: number): number | null {
    if (marketPrice <= 0) return null

    const minPrice = roundUpToCent(marketPrice * MIN_LISTING_FRACTION)
    
    return Math.max(0.01, minPrice)
}

