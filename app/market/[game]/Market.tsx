"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import LeftPanel from "./LeftMarketPanel"
import ListingCard from "./ListingCard"
import { BasketItem } from "@/lib/basket"
import { useBasket } from "@/app/components/BasketProvider"
import { signIn, useSession } from "next-auth/react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { toSlug } from "@/app/lib/site"
import { Prompt } from "@/app/components/Prompt"

//

type GameFilter = "all" | "CS2" | "Dota2" | "Rust" | "TF2"

export type ListingCard = {
    id: string,
    marketName: string,
    price: number,
    icon: string,
    hexColor: string,
    game: string,
    commodity: boolean,
    sellerId: string,
    floatValue: number | null,
    paintSeed: number | null,
    stickers: { stickerId: number; slot: number; name: string; image: string; wear: number | null }[] | null,
}

export type DisplayCard = ListingCard & { quantity: number }

type Filters = {
    search: string,
    minPrice: string,
    maxPrice: string,
    wear: string | null,
    minFloat: string,
    maxFloat: string,
    type: string | null,
    rarity: string | null,
}

//

function hasActiveFilters(f: Filters): boolean {
    return !!(f.search || f.minPrice || f.maxPrice || f.wear || f.minFloat || f.maxFloat || f.type || f.rarity)
}


function filterParams(f: Filters): URLSearchParams {
    const p = new URLSearchParams()

    if (f.search) p.set("search", f.search)
    if (f.minPrice) p.set("minPrice", f.minPrice)
    if (f.maxPrice) p.set("maxPrice", f.maxPrice)
    if (f.wear) p.set("wear", f.wear)
    if (f.minFloat) p.set("minFloat", f.minFloat)
    if (f.maxFloat) p.set("maxFloat", f.maxFloat)
    if (f.type) p.set("type", f.type)
    if (f.rarity) p.set("rarity", f.rarity)

    return p
}


function buildQueryString(f: Filters, hasStickers: boolean): string {
    const p = filterParams(f)

    if (!hasStickers) p.set("stickers", "0")

    const s = p.toString()

    return s ? `?${s}` : ""
}

//

export default function HomeClient(
    {
        initialListings,
        initialHasMore,
        currentUserId,
        hasPendingPurchase,
        initialGame,
    }: {
        initialListings: ListingCard[],
        initialHasMore: boolean,
        currentUserId: string | null,
        hasPendingPurchase: boolean,
        initialGame?: GameFilter,
    })
    {

    const searchParams = useSearchParams()
    const pathname = usePathname()
    const router = useRouter()


    // Game is fixed per page (/market/cs2 etc.) — switching games navigates and remounts.
    const game: GameFilter = initialGame ?? "all"


    // All filters live in one object, initialised from the URL so filtered views
    // survive refresh, can be shared, and work with the back button.
    const [filters, setFilters] = useState<Filters>(() => ({
        search: searchParams.get("search") ?? "",
        minPrice: searchParams.get("minPrice") ?? "",
        maxPrice: searchParams.get("maxPrice") ?? "",
        wear: searchParams.get("wear"),
        minFloat: searchParams.get("minFloat") ?? "",
        maxFloat: searchParams.get("maxFloat") ?? "",
        type: searchParams.get("type"),
        rarity: searchParams.get("rarity"),
    }))

    const [hasStickers, setHasStickers] = useState(searchParams.get("stickers") !== "0")

    const [listings, setListings] = useState<ListingCard[]>(initialListings)
    const [pendingNotice, setPendingNotice] = useState(false)
    const { basket, setBasket } = useBasket()
    const [cursor, setCursor] = useState<string | null>(initialListings.at(-1)?.id ?? null)
    const [hasMore, setHasMore] = useState(initialHasMore)
    const { data: session } = useSession()

    const loadingRef = useRef(false)
    const sentinelRef = useRef<HTMLDivElement>(null)


    // ListingCard is memoized and may hold a stale onBuy closure, so handleBuy must
    // read basket/session through refs to always act on current state.
    const basketRef = useRef(basket)
    useEffect(() => { basketRef.current = basket; }, [basket])

    const sessionRef = useRef(session)
    useEffect(() => { sessionRef.current = session; }, [session])


    // Single ref mirror so the infinite-scroll observer always reads current filters
    // without being recreated on every keystroke.
    const filtersRef = useRef(filters)
    useEffect(() => { filtersRef.current = filters; }, [filters])

    const setFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }))
    }, [])


    const load = useCallback(async (cur: string | null, reset: boolean) => {
        if (loadingRef.current) return

        loadingRef.current = true

        try {
            const params = filterParams(filtersRef.current)

            if (game !== "all") params.set("game", game)
            if (cur) params.set("cursor", cur)

            const res = await fetch(`/api/listings?${params}`)
            const data = await res.json()

            if (reset) {
                setListings(data.listings ?? [])
            }
            else {
                setListings(prev => [...prev, ...(data.listings ?? [])])
            }


            setCursor(data.nextCursor)
            setHasMore(data.nextCursor !== null)
        } 
        finally {
            loadingRef.current = false
        }
    }, [game])


    // On filter change: debounce, sync the URL, and refetch from page one.
    // On first mount the server has already rendered *unfiltered* data, so only
    // fetch if the URL carried filters; otherwise skip.
    const isFirstRender = useRef(true)

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false

            if (hasActiveFilters(filters)) load(null, true)

            return
        }

        
        const id = setTimeout(() => {
            router.replace(`${pathname}${buildQueryString(filters, hasStickers)}`, { scroll: false })
            load(null, true)
        }, 300)

        return () => clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, load])


    // hasStickers is a client-side display filter — sync it to the URL, no refetch.
    const isFirstStickerRender = useRef(true)
    useEffect(() => {
        if (isFirstStickerRender.current) {
            isFirstStickerRender.current = false
            return
        }

        router.replace(`${pathname}${buildQueryString(filtersRef.current, hasStickers)}`, { scroll: false })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasStickers])


    // Infinite scroll via IntersectionObserver. Re-registers whenever the cursor
    // changes, so a still-visible sentinel immediately triggers the next page.
    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && hasMore) {
                load(cursor, false)
            }
        }, { threshold: 0.1 })


        if (sentinelRef.current) {
            observer.observe(sentinelRef.current)
        }


        return () => observer.disconnect()
    }, [hasMore, cursor, load])


    function handleBuy(item: DisplayCard, qty: number = 1) {
        if (sessionRef.current === null) {
            signIn("steam")

            return
        }


        if (!item.commodity && item.sellerId === currentUserId) {
            return
        }


        if (hasPendingPurchase) {
            setPendingNotice(true)

            return
        }


        const current = basketRef.current
        let updated: BasketItem[]

        if (item.commodity) {
            const existing = current.find(b => b.marketName === item.marketName && b.commodity)

            if (existing) {
                const newQty = Math.min(existing.quantity + qty, existing.maxQuantity)

                if (newQty === existing.quantity) return

                updated = current.map(b =>
                    b.marketName === item.marketName && b.commodity ? { ...b, quantity: newQty } : b
                )
            }
            else {
                updated = [...current, { id: item.id, marketName: item.marketName, price: item.price, icon: item.icon, hexColor: item.hexColor, commodity: true, quantity: qty, maxQuantity: item.quantity } as BasketItem]
            }
        }
        else {
            if (current.find(b => b.id === item.id)) return

            updated = [...current, { id: item.id, marketName: item.marketName, price: item.price, icon: item.icon, hexColor: item.hexColor, commodity: false, quantity: 1, maxQuantity: 1 } as BasketItem]
        }


        setBasket(updated)
    }


    const displayListings = useMemo<DisplayCard[]>(() => {
        const result: DisplayCard[] = []
        const commodityMap = new Map<string, DisplayCard>()

        for (const listing of listings) {
            if (listing.commodity) {
                const existing = commodityMap.get(listing.marketName)

                if (existing) {
                    existing.quantity += 1

                    if (listing.price < existing.price) {
                        existing.price = listing.price
                    }
                }
                else {
                    const entry: DisplayCard = { ...listing, quantity: 1 }
                    commodityMap.set(listing.marketName, entry)
                    result.push(entry)
                }
            }
            else {
                result.push({ ...listing, quantity: 1 })
            }
        }


        // Subtract basket quantities; hide fully-basketed items
        return result
            .map(item => {
                if (item.commodity) {
                    const inBasket = basket.find(b => b.marketName === item.marketName && b.commodity)

                    return inBasket ? { ...item, quantity: item.quantity - inBasket.quantity } : item
                }


                return item
            })
            .filter(item => !item.commodity
                ? !basket.find(b => b.id === item.id)
                : item.quantity > 0
            )
            .filter(item => {
                if (hasStickers) return true
                const isGun = !item.commodity && item.marketName.includes(' | ')
                if (!isGun) return true
                return !item.stickers || item.stickers.length === 0
            })
            .sort((a, b) => {
                if (b.price !== a.price) return b.price - a.price

                return b.quantity - a.quantity
            })
    }, [listings, basket, hasStickers])


    return (
        <>
            <LeftPanel
                currentGame={game}
                minPrice={filters.minPrice} setMinPrice={v => setFilter("minPrice", v)}
                maxPrice={filters.maxPrice} setMaxPrice={v => setFilter("maxPrice", v)}
                wear={filters.wear} setWear={v => setFilter("wear", v)}
                minFloat={filters.minFloat} setMinFloat={v => setFilter("minFloat", v)}
                maxFloat={filters.maxFloat} setMaxFloat={v => setFilter("maxFloat", v)}
                type={filters.type} setType={v => setFilter("type", v)}
                rarity={filters.rarity} setRarity={v => setFilter("rarity", v)}
                hasStickers={hasStickers} setHasStickers={setHasStickers}
            />

            {pendingNotice && (
                <Prompt title="Pending order" onClose={() => setPendingNotice(false)}>
                    <p className="opacity-60 text-sm">
                        You have an active purchase in progress. You cannot add items to your basket until it is completed or cancelled.
                    </p>

                    <button onClick={() => setPendingNotice(false)} className="h-9 px-4 rounded-sm bg-accent button w-fit">
                        Dismiss
                    </button>
                </Prompt>
            )}


            {/* Search + grid */}
            <div className="flex flex-col gap-2 flex-1 min-h-0 mx-[2.5%] md:mt-20 md:mb-4 md:ml-[calc(2.5%+11.5rem)] 2xl:ml-[calc(2.5%+16.75rem)]">
                <div className="border border-gray-800 frame-shadow h-14 md:h-13 flex items-center px-4 rounded-sm shrink-0">
                    <input
                        type="text"
                        placeholder="Search items..."
                        value={filters.search}
                        onChange={e => setFilter("search", e.target.value)}
                        className="bg-accent rounded-sm h-9 w-full px-3 outline-none border border-gray-500 text-sm"
                    />
                </div>

                <div className="border border-gray-800 frame-shadow overflow-y-auto flex-1 min-h-0 p-3 rounded-sm flex flex-col">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 justify-start content-start gap-2">
                        {displayListings.map(listing => (
                            <ListingCard
                                key={listing.id} {...listing}
                                currentUserId={currentUserId}
                                onBuy={() => listing.commodity ? router.push(`/item/${toSlug(listing.marketName)}`) : handleBuy(listing)}
                                onPreview={() => listing.commodity ? router.push(`/item/${toSlug(listing.marketName)}`) : router.push(`/item/${toSlug(listing.marketName)}/${listing.id}`)}
                            />
                        ))}
                    </div>

                    <div ref={sentinelRef} className="h-1 shrink-0" />
                </div>
            </div>
        </>
    )
}
