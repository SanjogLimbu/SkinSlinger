export type Sticker = { name: string, wear: number | null }
type PriceLookup = (marketName: string) => number

//

const MAX_LISTING_MARKUP = 3

const MIN_LISTING_FRACTION = 0.1

const STICKER_VALUE_SHARE = 0.15

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


export function stickerValue(
    stickers: Sticker[] | null | undefined,
    priceOf: PriceLookup,
): number {
    if (!stickers) {
        return 0
    }


    let total = 0

    for (const sticker of stickers) {
        const price = priceOf(stickerMarketName(sticker.name))
        const unscraped = 1 - (sticker.wear ?? 0)

        total += price * unscraped * STICKER_VALUE_SHARE
    }


    return total
}


export function maxListingPrice(
    marketPrice: number,
    stickers: Sticker[] | null | undefined,
    priceOf: PriceLookup,
): number | null {
    if (marketPrice <= 0) {
        return null
    }


    const itemValue = marketPrice + stickerValue(stickers, priceOf)

    return roundToCent(itemValue * MAX_LISTING_MARKUP)
}


export function minListingPrice(marketPrice: number): number | null {
    if (marketPrice <= 0) {
        return null
    }


    const minPrice = roundUpToCent(marketPrice * MIN_LISTING_FRACTION)

    return Math.max(0.01, minPrice)
}
