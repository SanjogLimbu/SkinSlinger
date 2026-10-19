import { SteamItem } from "./steam"

//

const MAX_PRICE = 1_000_000

//

export type ListingRequest = {
    assetId: string
    marketName: string
    price: number
    commodity: boolean
    quantity: number
}

export type TokenItem = { assetId: string, marketName: string }

export type NewListing = {
    userId: string
    assetId: string
    marketName: string
    price: number
    game: string
    icon: string
    hexColor: string
    commodity: boolean
}

//

// A negative price would turn checkout's cash deduction into a credit.
export function findPriceFormatError(items: ListingRequest[]): string | null {
    for (const item of items) {
        const isNumber = typeof item.price === "number" && Number.isFinite(item.price)

        if (!isNumber || item.price < 0.01 || item.price > MAX_PRICE) {
            return "Invalid price"
        }


        const cents = item.price * 100

        if (Math.abs(cents - Math.round(cents)) > 1e-6) {
            return "Prices can't have more than two decimal places."
        }
    }


    return null
}


// A unique item's name comes from our inventory snapshot, so the request can't claim to be a different item.
export function trustedMarketName(item: ListingRequest, ownedItems: Map<string, SteamItem>): string {
    if (item.commodity) {
        return item.marketName
    }


    return ownedItems.get(item.assetId)?.market_name ?? ""
}


function assetIdsToList(
    item: ListingRequest,
    tokenItems: TokenItem[],
    ownedItems: Map<string, SteamItem>,
    unavailable: Set<string>,
): string[] {
    const available: TokenItem[] = []

    for (const tokenItem of tokenItems) {
        if (ownedItems.has(tokenItem.assetId) && !unavailable.has(tokenItem.assetId)) {
            available.push(tokenItem)
        }
    }


    if (!item.commodity) {
        const matching = available.filter((tokenItem) => tokenItem.assetId === item.assetId)

        return matching.map((tokenItem) => tokenItem.assetId)
    }


    const sameName = available.filter((tokenItem) => tokenItem.marketName === item.marketName)
    const taken = sameName.slice(0, Math.max(0, item.quantity))

    return taken.map((tokenItem) => tokenItem.assetId)
}


// Only the price comes from the request, so a seller can't pass one item off as another.
export function buildListings(
    items: ListingRequest[],
    userId: string,
    tokenItems: TokenItem[],
    ownedItems: Map<string, SteamItem>,
    unavailable: Set<string>,
): NewListing[] {
    const listings: NewListing[] = []
    const taken = new Set(unavailable)

    for (const item of items) {
        for (const assetId of assetIdsToList(item, tokenItems, ownedItems, taken)) {
            const owned = ownedItems.get(assetId)!

            listings.push({
                userId,
                assetId,
                marketName: owned.market_name,
                price: item.price,
                game: owned.game,
                icon: owned.icon,
                hexColor: owned.hexColor,
                commodity: owned.commodity,
            })

            taken.add(assetId)
        }
    }


    return listings
}
