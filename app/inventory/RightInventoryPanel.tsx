"use client"

import { SteamItem } from '@/lib/steam'
import { maxListingPrice, minListingPrice } from '@/lib/pricing'
import { useState, useEffect, useRef } from 'react'
import SellItemCard from './SellItemCard'
import { Prompt } from '@/app/components/Prompt'

//

const discounts = [0, 5, 15, 20]

//

function ListPrompt({ totalValue, itemCount, onConfirm, setShowPrompt, error, submitting }: {
    totalValue: number
    itemCount: number
    onConfirm: () => void
    setShowPrompt: (value: boolean) => void
    error: string
    submitting: boolean
}) {
    function close() {
        if (!submitting) {
            setShowPrompt(false)
        }
    }


    return (
        <Prompt
            title="Confirm listing"
            onClose={close}
        >
            <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                    <span className="opacity-60">
                        {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </span>

                    <span>
                        ${totalValue.toFixed(2)}
                    </span>
                </div>

                <div className="flex justify-between">
                    <span className="opacity-60">
                        Listing fee
                    </span>

                    <span className="text-special">
                        0%
                    </span>
                </div>

                <div className="flex justify-between border-t border-gray-700 pt-2 mt-1 font-medium">
                    <span>
                        Total earnings
                    </span>

                    <span>
                        ${totalValue.toFixed(2)}
                    </span>
                </div>
            </div>

            <span className="text-xs opacity-40">
                Only a 2.5% → 0.5% fee applies on withdrawals.
            </span>

            {error && (
                <p className="text-red-500 text-xs">
                    {error}
                </p>
            )}

            <div className="flex gap-3">
                <button
                    className="bg-special button flex-1 h-10 rounded-sm"
                    onClick={onConfirm}
                    disabled={submitting}
                >
                    {submitting ? "Listing..." : "Confirm"}
                </button>

                <button
                    className="bg-accent button flex-1 h-10 rounded-sm"
                    onClick={() => setShowPrompt(false)}
                    disabled={submitting}
                >
                    Cancel
                </button>
            </div>
        </Prompt>
    )
}


export default function RightPanel({ selling, setSelling, onListed, livePrices, inventoryToken }: {
    selling: SteamItem[],
    setSelling: React.Dispatch<React.SetStateAction<SteamItem[]>>,
    onListed: (assetIds: string[]) => void,
    livePrices: Map<string, number | null>,
    inventoryToken: string,
}) {
    const [showPrompt, setShowPrompt] = useState(false)
    const [listError, setListError] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [mobileQueueOpen, setMobileQueueOpen] = useState(false)
    const [priceMap, setPriceMap] = useState<Record<string, string>>({})
    const [bidMap, setBidMap] = useState<Record<string, number | null>>({})
    const fetchedRef = useRef<Set<string>>(new Set())

    function applyInstantSell() {
        const next: Record<string, string> = { ...priceMap }

        for (const item of stackedQueue) {
            const bid = bidMap[item.market_name]

            if (bid) {
                next[item.market_name] = bid.toFixed(2)
            }
        }


        setPriceMap(next)
    }


    function applyDiscount(discount: number) {
        const next: Record<string, string> = {}

        for (const item of stackedQueue) {
            const base = marketPrice(item)
            next[item.market_name] = (base * (1 - discount / 100)).toFixed(2)
        }


        setPriceMap(next)
    }


    function openListPrompt() {
        setListError("")
        setShowPrompt(true)
    }


    function sellFromQueue() {
        setMobileQueueOpen(false)
        openListPrompt()
    }


    async function listItems() {
        const items = stackedQueue.map(item => ({
            assetId: item.assetId,
            marketName: item.market_name,
            // item.price can be a stale 0, so this uses the price shown to the user.
            price: parseFloat(priceMap[item.market_name] ?? defaultPrice(item)),
            game: item.game,
            commodity: item.commodity,
            quantity: item.quantity,
            icon: item.icon,
            hexColor: item.hexColor,
        }))

        // The server rejects the whole batch on one bad price, so this tells the user why.
        if (items.some(i => !Number.isFinite(i.price) || i.price <= 0)) {
            setListError("Every item needs a price above $0.00.")

            return
        }


        const ids = selling.map(i => i.assetId)
        setListError("")
        setSubmitting(true)

        // Refreshing only after the POST lets the server hide every listed copy of a stack.
        try {
            const response = await fetch("/api/listings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items, inventoryToken }),
            })

            if (!response.ok) {
                const data = await response.json().catch(() => null)
                setListError(data?.error ?? "Listing failed — please try again.")

                return
            }
        }
        catch {
            setListError("Network error — please try again.")

            return
        }
        finally {
            setSubmitting(false)
        }


        setSelling([])
        setShowPrompt(false)
        onListed(ids)
    }


    function remove(market_name: string) {
        const index = selling.findIndex(x => x.market_name === market_name)

        if (index >= 0) {
            setSelling(selling.filter((_, i) => i !== index))
            fetchedRef.current.delete(market_name)
        }
    }


    const stackedQueue = (() => {
        const result: (SteamItem & { quantity: number })[] = []
        const commodityMap = new Map<string, SteamItem & { quantity: number }>()

        for (const item of selling) {
            if (item.commodity) {
                const existing = commodityMap.get(item.market_name)

                if (existing) {
                    existing.quantity += 1
                }
                else {
                    const entry = { ...item, quantity: 1 }
                    commodityMap.set(item.market_name, entry)
                    result.push(entry)
                }
            }
            else {
                result.push({ ...item, quantity: 1 })
            }
        }


        return result
    })()


    useEffect(() => {
        async function fetchBid(marketName: string) {
            const url = `/api/market/orders?marketName=${encodeURIComponent(marketName)}`
            const response = await fetch(url)
            const data = await response.json()
            const highestBid: number | null = data.buyOrders?.[0]?.price ?? null

            setBidMap(prev => ({ ...prev, [marketName]: highestBid }))

            if (highestBid) {
                setPriceMap(prev => {
                    if (prev[marketName] !== undefined) {
                        return prev
                    }


                    return { ...prev, [marketName]: highestBid.toFixed(2) }
                })
            }
        }


        for (const item of stackedQueue) {
            if (fetchedRef.current.has(item.market_name)) {
                continue
            }


            fetchedRef.current.add(item.market_name)
            fetchBid(item.market_name)
        }
    }, [stackedQueue])


    function marketPrice(item: SteamItem): number {
        const price = livePrices.get(item.market_name) ?? item.price

        return parseFloat(price.toFixed(2))
    }


    // The same limits as the server's, so the user can't enter a price it would reject.
    function maxPrice(item: SteamItem): number | null {
        const priceOf = (name: string) => livePrices.get(name) ?? 0

        return maxListingPrice(priceOf(item.market_name), item.stickers, priceOf)
    }


    function minPrice(item: SteamItem): number | null {
        return minListingPrice(livePrices.get(item.market_name) ?? 0)
    }


    function defaultPrice(item: SteamItem): string {
        return marketPrice(item).toFixed(2)
    }


    const totalValue = stackedQueue.reduce((sum, item) => {
        const price = parseFloat(priceMap[item.market_name] ?? defaultPrice(item))

        return sum + (isNaN(price) ? 0 : price) * item.quantity
    }, 0)

    const totalItems = stackedQueue.reduce((sum, item) => sum + item.quantity, 0)

    const allHaveBids = stackedQueue.every(item => bidMap[item.market_name])
    const allAtBid = stackedQueue.every(item => {
        const bid = bidMap[item.market_name]

        return bid && priceMap[item.market_name] === bid.toFixed(2)
    })


    const discountButtons = (
        <div className="flex gap-1">
            {discounts.map(d => (
                <button
                    key={d}
                    onClick={() => applyDiscount(d)}
                    className="flex-1 h-7 rounded-sm text-xs cursor-pointer bg-primary opacity-60 hover:opacity-100 transition-colors"
                >
                    {d === 0 ? '0%' : `-${d}%`}
                </button>
            ))}

            {allHaveBids && (
                <button
                    onClick={applyInstantSell}
                    className={`flex-1 h-7 rounded-sm text-xs cursor-pointer transition-colors ${allAtBid ? 'bg-special' : 'bg-primary opacity-60 hover:opacity-100'}`}
                >
                    Instant
                </button>
            )}
        </div>
    )

    const queueCards = stackedQueue.map((item) => (
        <SellItemCard
            key={item.market_name}
            market_name={item.market_name}
            quantity={item.quantity}
            icon={item.icon}
            hexColor={item.hexColor}
            priceStr={priceMap[item.market_name] ?? defaultPrice(item)}
            setPriceStr={(val) => setPriceMap(prev => ({ ...prev, [item.market_name]: val }))}
            marketPrice={marketPrice(item)}
            minPrice={minPrice(item)}
            maxPrice={maxPrice(item)}
            bidPrice={bidMap[item.market_name] ?? null}
            remove={() => remove(item.market_name)}
        />
    ))


    return (
        <>
            {showPrompt && (
                <ListPrompt
                    totalValue={totalValue}
                    itemCount={totalItems}
                    onConfirm={listItems}
                    setShowPrompt={setShowPrompt}
                    error={listError}
                    submitting={submitting}
                />
            )}


            {/* Mobile: full-screen queue modal */}
            {mobileQueueOpen && (
                <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-black/50 backdrop-blur-md px-4 pt-4 pb-4">
                    <div className="flex justify-between items-center shrink-0 flex-col">
                        <p className="text-xl">
                            {totalItems} Items: ${totalValue.toFixed(2)}
                        </p>

                        <div className="mx-2 mt-3 mb-1 bg-accent rounded-sm p-3 w-80">
                            <p className="text-xs opacity-40">
                                Global discount modifiers
                            </p>

                            {discountButtons}
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 space-y-3">
                        {queueCards}
                    </div>

                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={() => setMobileQueueOpen(false)}
                            className="bg-negative button rounded-sm w-12 h-12 shrink-0 flex items-center justify-center text-lg"
                        >
                            ✕
                        </button>

                        <button
                            className="bg-special h-12 flex-1 rounded-sm button font-medium"
                            onClick={sellFromQueue}
                        >
                            SELL ITEMS
                        </button>
                    </div>
                </div>
            )}


            {/* Mobile bottom bar shown when items queued */}
            {selling.length > 0 && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-secondary border-t border-gray-700 flex items-center px-4 py-3 gap-3">
                    <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-xs text-gray-400">
                            {totalItems} item{totalItems !== 1 ? 's' : ''}
                        </span>

                        <span className="text-base font-semibold">
                            ${totalValue.toFixed(2)}
                        </span>
                    </div>

                    <button
                        onClick={() => setMobileQueueOpen(true)}
                        className="bg-accent px-4 h-10 rounded-sm button text-sm shrink-0"
                    >
                        Adjust
                    </button>

                    <button
                        onClick={openListPrompt}
                        className="bg-special px-4 h-10 rounded-sm button text-sm font-medium shrink-0"
                    >
                        Sell Items
                    </button>
                </div>
            )}


            {/* Desktop: right sidebar */}
            <div className="hidden md:flex fixed w-[95%] left-[2.5%] justify-end">
                <div className="mt-20 overflow-y-auto overflow-x-hidden h-185 w-95 border border-gray-800 frame-shadow absolute rounded-sm">
                    {stackedQueue.length > 0 && (
                        <>
                            <div className="w-full flex ml-2 mt-2">
                                <span className="text-3xl">
                                    {totalItems} Items: ${totalValue.toFixed(2)}
                                </span>
                            </div>

                            <div className="mx-2 mt-3 mb-1 bg-accent rounded-sm p-3 flex flex-col gap-2">
                                <span className="text-xs opacity-40">
                                    Global discount modifiers
                                </span>

                                {discountButtons}
                            </div>
                        </>
                    )}

                    <div className="flex flex-col pb-2">
                        {queueCards}
                    </div>
                </div>

                <button
                    className={`mt-210 rounded-sm transition-all overflow-y-auto h-20 w-95 ${stackedQueue.length > 0 ? "bg-special" : "bg-accent"} absolute flex justify-center items-center cursor-pointer`}
                    onClick={openListPrompt}
                >
                    SELL ITEMS
                </button>
            </div>
        </>
    )
}
