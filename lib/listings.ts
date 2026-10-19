import { SteamItem } from "./steam"

//

const MAX_PRICE = 1_000_000

//

// One item in the body of a "list these items" request
export type ListingRequest = { assetId: string, marketName: string, price: number, commodity: boolean, quantity: number }

// An item the signed inventory token says the seller owns
export type TokenItem = { assetId: string, marketName: string }

export type NewListing = { userId: string, assetId: string, marketName: string, price: number, game: string, icon: string, hexColor: string, commodity: boolean }

//

// The first badly formed price, as an error message; null when they are all fine.
// A negative price would flip checkout's cash deduction into a credit, minting money for
// the buyer. Prices must also be whole cents, at least $0.01.
export function findPriceFormatError(items: ListingRequest[]): string | null {
    for (const item of items) {
        if (typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0.01 || item.price > MAX_PRICE) {
            return "Invalid price"
        }

        if (Math.abs(item.price * 100 - Math.round(item.price * 100)) > 1e-6) {
            return "Prices can't have more than two decimal places."
        }
    }

    return null
}


// A stack is identified by its name. A unique item's name comes from our own snapshot of the
// seller's inventory, so the request can't claim to be a different item.
export function trustedMarketName(item: ListingRequest, ownedItems: Map<string, SteamItem>): string {
    if (item.commodity) return item.marketName

    return ownedItems.get(item.assetId)?.market_name ?? ""
}


// The seller's assets to list for one request item. An asset qualifies when it is in the
// signed token, still in our inventory snapshot, and not already listed. A stack takes up
// to `quantity` qualifying assets with its name; a unique item takes only itself.
function assetIdsToList(item: ListingRequest, tokenItems: TokenItem[], ownedItems: Map<string, SteamItem>, alreadyListed: Set<string>): string[] {
    const qualifying = tokenItems.filter(tokenItem => ownedItems.has(tokenItem.assetId) && !alreadyListed.has(tokenItem.assetId))

    if (!item.commodity) {
        return qualifying.filter(tokenItem => tokenItem.assetId === item.assetId).map(tokenItem => tokenItem.assetId)
    }

    return qualifying
        .filter(tokenItem => tokenItem.marketName === item.marketName)
        .slice(0, Math.max(0, item.quantity))
        .map(tokenItem => tokenItem.assetId)
}


// Turns the request into listing rows. Only the price comes from the request; every other
// detail is read from our inventory snapshot.
export function buildListings(items: ListingRequest[], userId: string, tokenItems: TokenItem[], ownedItems: Map<string, SteamItem>, alreadyListed: Set<string>): NewListing[] {
    const listings: NewListing[] = []
    const listed = new Set(alreadyListed)

    for (const item of items) {
        for (const assetId of assetIdsToList(item, tokenItems, ownedItems, listed)) {
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
            listed.add(assetId)
        }
    }

    return listings
}
