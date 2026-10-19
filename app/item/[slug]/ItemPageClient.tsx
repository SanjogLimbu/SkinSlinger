"use client"

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useBasket } from '@/app/components/BasketProvider'
import { BasketItem } from '@/lib/basket'

//

type PriceLevel = { price: number; quantity: number }
type MyBuyOrder = { id: string; price: number; quantity: number }

const GAME_NAMES: Record<string, string> = {
    CS2: "Counter-Strike 2",
    Dota2: "Dota 2",
    Rust: "Rust",
    TF2: "Team Fortress 2",
}

function ColHeader({ label }: { label: "Asks" | "Bids" }) {
    return (
        <div className="grid grid-cols-3 text-xs text-gray-500 border-b border-gray-700 pb-1 px-2">
            <span>{label === "Asks" ? "Ask" : "Bid"}</span>

            <span className="text-center">Qty</span>

            <span className="text-right">Total</span>
        </div>
    )
}

//

export default function ItemPageClient({
    marketName,
    icon,
    hexColor,
    game,
    gameSlug,
    initialSellOrders,
    initialBuyOrders,
    initialMyBuyOrders,
    currentUserId,
    hasPendingPurchase,
    initialUserCash,
    children,
}: {
    marketName: string
    icon: string
    hexColor: string
    game: string
    gameSlug: string
    initialSellOrders: PriceLevel[]
    initialBuyOrders: PriceLevel[]
    initialMyBuyOrders: MyBuyOrder[]
    currentUserId: string | null
    hasPendingPurchase: boolean
    initialUserCash: number
    children: React.ReactNode
}) {
    const router = useRouter()
    const { data: session } = useSession()
    const { basket, setBasket } = useBasket()

    const firstAsk = initialSellOrders[0]?.price ?? null

    const [sellOrders, setSellOrders] = useState(initialSellOrders)
    const [buyOrders, setBuyOrders] = useState(initialBuyOrders)
    const [myBuyOrders, setMyBuyOrders] = useState(initialMyBuyOrders)
    const [selectedSellPrice, setSelectedSellPrice] = useState<number | null>(firstAsk)
    const [sellQtyStr, setSellQtyStr] = useState("1")
    const [bidPriceStr, setBidPriceStr] = useState("")
    const [bidQtyStr, setBidQtyStr] = useState("1")
    const [placingBid, setPlacingBid] = useState(false)
    const [cancellingId, setCancellingId] = useState<string | null>(null)
    const [bidError, setBidError] = useState("")

    const userCash = session?.user?.cash ?? initialUserCash
    const gameName = GAME_NAMES[game] ?? game

    const selectedSellLevel = sellOrders.find(l => l.price === selectedSellPrice) ?? null
    const requestedSellQty = parseInt(sellQtyStr) || 1
    const maxSellQty = selectedSellLevel?.quantity ?? 1
    const sellQty = Math.max(1, Math.min(requestedSellQty, maxSellQty))
    const sellTotal = (selectedSellPrice ?? 0) * sellQty

    const bidPrice = parseFloat(bidPriceStr)
    const bidQty = Math.max(1, parseInt(bidQtyStr) || 1)
    const bidTotal = (isNaN(bidPrice) ? 0 : bidPrice) * bidQty
    const canAffordBid = !isNaN(bidPrice) && bidPrice > 0 && bidTotal <= userCash

    const lowestAsk = sellOrders[0]?.price ?? null
    const highestBid = buyOrders[0]?.price ?? null

    const buyDisabled = hasPendingPurchase || !selectedSellLevel
    const buyButtonColor = buyDisabled ? "bg-accent text-gray-500 cursor-not-allowed" : "bg-special button"
    const buyButtonLabel = selectedSellLevel ? `Add to Basket — $${sellTotal.toFixed(2)}` : "Select a price below"
    const bidButtonColor = canAffordBid && bidPriceStr ? "bg-special button" : "bg-accent text-gray-500 cursor-not-allowed"

    async function refreshOrderBook() {
        const query = encodeURIComponent(marketName)
        const res = await fetch(`/api/market/orders?marketName=${query}`)
        const data = await res.json()

        setSellOrders(data.sellOrders ?? [])
        setBuyOrders(data.buyOrders ?? [])
        setMyBuyOrders(data.myBuyOrders ?? [])
    }


    async function placeBid() {
        if (!canAffordBid) {
            return
        }


        setPlacingBid(true)
        setBidError("")

        const res = await fetch("/api/market/orders/buy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                marketName,
                price: bidPrice,
                quantity: bidQty,
                game,
                icon,
                hexColor,
            }),
        })

        if (!res.ok) {
            const d = await res.json()
            setBidError(d.error ?? "Failed to place order")
        }
        else {
            setBidPriceStr("")
            setBidQtyStr("1")
            await refreshOrderBook()
        }


        setPlacingBid(false)
    }


    async function cancelBid(id: string) {
        setCancellingId(id)

        const res = await fetch(`/api/market/orders/buy/${id}`, { method: "DELETE" })

        if (res.ok) {
            await refreshOrderBook()
        }


        setCancellingId(null)
    }


    function selectSellPrice(price: number) {
        setSelectedSellPrice(price)
        setSellQtyStr("1")
    }


    function handleBuyInstantly() {
        if (!session) {
            signIn("steam")

            return
        }


        if (hasPendingPurchase || !selectedSellLevel || selectedSellPrice === null) {
            return
        }


        const existing = basket.find(b => b.marketName === marketName && b.commodity)
        let updated: BasketItem[]

        if (existing) {
            const newQty = Math.min(existing.quantity + sellQty, existing.maxQuantity)

            if (newQty === existing.quantity) {
                return
            }


            updated = basket.map(b => {
                const isThisStack = b.marketName === marketName && b.commodity

                return isThisStack ? { ...b, quantity: newQty } : b
            })
        }
        else {
            updated = [...basket, {
                id: marketName,
                marketName,
                price: selectedSellPrice,
                icon,
                hexColor,
                commodity: true,
                quantity: sellQty,
                maxQuantity: selectedSellLevel.quantity,
            } as BasketItem]
        }


        setBasket(updated)
        router.push("/basket")
    }


    return (
        <div className="overflow-y-auto h-full pt-24 pb-12 px-4 flex justify-center">
            <div className="w-full max-w-4xl flex flex-col gap-4">
                <Link
                    href={`/market/${gameSlug}`}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                    ← Back to {gameName} market
                </Link>

                {/* Top row */}
                <div className="flex flex-col md:flex-row gap-4 items-start">

                    {/* Item card */}
                    <div
                        className="bg-secondary rounded-sm p-6 flex flex-col items-center gap-3 w-full md:w-64 shrink-0"
                        style={{ boxShadow: `0 0 40px #${hexColor}33, 0 8px 32px rgba(0,0,0,0.6)` }}
                    >
                        <div style={{ filter: `drop-shadow(0 0 16px #${hexColor}99)` }}>
                            <Image
                                src={icon}
                                alt={marketName}
                                width={180}
                                height={180}
                                style={{ width: 'auto', height: 'auto', maxHeight: 180 }}
                                priority
                            />
                        </div>

                        <h1 style={{ color: `#${hexColor}` }} className="text-lg font-semibold text-center">
                            {marketName}
                        </h1>

                        <span className="text-xs text-gray-500 bg-accent px-2 py-1 rounded-sm">
                            {gameName}
                        </span>

                        {(lowestAsk !== null || highestBid !== null) && (
                            <div className="w-full flex flex-col gap-1.5 text-sm border-t border-gray-700/60 pt-3">
                                {lowestAsk !== null && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Lowest ask</span>

                                        <span className="text-red-400 font-medium">
                                            ${lowestAsk.toFixed(2)}
                                        </span>
                                    </div>
                                )}

                                {highestBid !== null && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Highest bid</span>

                                        <span className="text-green-400 font-medium">
                                            ${highestBid.toFixed(2)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Buy actions */}
                    <div className="flex-1 flex flex-col gap-4 w-full min-w-0">

                        {/* Buy Instantly */}
                        {sellOrders.length > 0 && (
                            <div className="bg-secondary rounded-sm p-4 flex flex-col gap-3">
                                <h2 className="text-sm font-semibold text-gray-200">
                                    Buy Instantly
                                </h2>

                                {currentUserId ? (
                                    <>
                                        {selectedSellLevel && (
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col gap-1 flex-1">
                                                    <label className="text-xs text-gray-500">
                                                        Quantity (max {selectedSellLevel.quantity})
                                                    </label>

                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={selectedSellLevel.quantity}
                                                        value={sellQtyStr}
                                                        onChange={e => setSellQtyStr(e.target.value)}
                                                        className="bg-accent rounded-sm h-9 px-3 outline-none border border-gray-600 text-sm w-full"
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-1 shrink-0 text-right">
                                                    <span className="text-xs text-gray-500">Total</span>

                                                    <span className="text-sm font-medium h-9 flex items-center justify-end">
                                                        ${sellTotal.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {hasPendingPurchase && (
                                            <p className="text-sm text-yellow-400">
                                                You have a pending order. Complete or cancel it first.
                                            </p>
                                        )}

                                        <button
                                            onClick={handleBuyInstantly}
                                            disabled={buyDisabled}
                                            className={`h-9 rounded-sm text-sm font-medium w-full ${buyButtonColor}`}
                                        >
                                            {buyButtonLabel}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm text-gray-400">
                                            Starting from <span className="text-white font-medium">${lowestAsk?.toFixed(2)}</span>
                                        </p>

                                        <button
                                            onClick={() => signIn("steam")}
                                            className="h-9 rounded-sm bg-special button text-sm font-medium flex items-center justify-center"
                                        >
                                            Sign in through Steam to buy
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Place Buy Order */}
                        {currentUserId && (
                            <div className="bg-secondary rounded-sm p-4 flex flex-col gap-3">
                                <h2 className="text-sm font-semibold text-gray-200">
                                    Place Buy Order
                                </h2>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-500">Price (USD)</label>

                                        <input
                                            type="number"
                                            min={0.01}
                                            step={0.01}
                                            placeholder="0.00"
                                            value={bidPriceStr}
                                            onChange={e => setBidPriceStr(e.target.value)}
                                            className="bg-accent rounded-sm h-9 px-3 outline-none border border-gray-600 text-sm w-full"
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-500">Quantity</label>

                                        <input
                                            type="number"
                                            min={1}
                                            placeholder="1"
                                            value={bidQtyStr}
                                            onChange={e => setBidQtyStr(e.target.value)}
                                            className="bg-accent rounded-sm h-9 px-3 outline-none border border-gray-600 text-sm w-full"
                                        />
                                    </div>
                                </div>

                                {bidTotal > 0 && (
                                    <p className="text-sm text-gray-300">
                                        Total held: <span className="font-medium">${bidTotal.toFixed(2)}</span>
                                    </p>
                                )}

                                {bidTotal > 0 && !canAffordBid && (
                                    <p className="text-red-400 text-sm">
                                        Insufficient balance — you have ${userCash.toFixed(2)}
                                    </p>
                                )}

                                {bidError && (
                                    <p className="text-red-400 text-sm">
                                        {bidError}
                                    </p>
                                )}

                                <button
                                    onClick={placeBid}
                                    disabled={!canAffordBid || placingBid || !bidPriceStr}
                                    className={`h-9 rounded-sm text-sm font-medium w-full ${bidButtonColor}`}
                                >
                                    {placingBid ? "Placing..." : "Place Buy Order"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Price history chart */}
                {children}

                {/* Order book */}
                <div className="flex flex-col md:flex-row gap-4">

                    {/* Sell Orders */}
                    <div className="flex-1 bg-secondary rounded-sm p-4 flex flex-col gap-2 min-w-0">
                        <h2 className="text-sm font-semibold text-gray-200">
                            Sell Orders
                        </h2>

                        {sellOrders.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                No listings available.
                            </p>
                        ) : (
                            <>
                                <ColHeader label="Asks" />

                                <div className="flex flex-col max-h-48 overflow-y-auto">
                                    {sellOrders.map(level => (
                                        <button
                                            key={level.price}
                                            onClick={() => selectSellPrice(level.price)}
                                            className={`grid grid-cols-3 px-2 py-2 text-sm transition-colors cursor-pointer rounded-sm ${
                                                selectedSellPrice === level.price
                                                    ? "bg-red-950/70 border border-red-800/60"
                                                    : "bg-red-950/30 hover:bg-red-950/50"
                                            }`}
                                        >
                                            <span className="text-left">
                                                ${level.price.toFixed(2)}
                                            </span>

                                            <span className="text-center text-gray-400">
                                                {level.quantity}
                                            </span>

                                            <span className="text-right text-gray-400">
                                                ${(level.price * level.quantity).toFixed(2)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Buy Orders */}
                    <div className="flex-1 bg-secondary rounded-sm p-4 flex flex-col gap-2 min-w-0">
                        <h2 className="text-sm font-semibold text-gray-200">
                            Buy Orders
                        </h2>

                        {buyOrders.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                No buy orders yet.
                            </p>
                        ) : (
                            <>
                                <ColHeader label="Bids" />

                                <div className="flex flex-col max-h-40 overflow-y-auto">
                                    {buyOrders.map(level => (
                                        <div
                                            key={level.price}
                                            className="grid grid-cols-3 px-2 py-2 text-sm rounded-sm bg-green-950/30 border border-green-800/60"
                                        >
                                            <span className="text-left">
                                                ${level.price.toFixed(2)}
                                            </span>

                                            <span className="text-center text-gray-400">
                                                {level.quantity}
                                            </span>

                                            <span className="text-right text-gray-400">
                                                ${(level.price * level.quantity).toFixed(2)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {currentUserId && myBuyOrders.length > 0 && (
                            <div className="flex flex-col gap-1 mt-1">
                                <p className="text-xs text-gray-500 uppercase tracking-wider">
                                    Your orders
                                </p>

                                {myBuyOrders.map(order => (
                                    <div
                                        key={order.id}
                                        className="flex items-center gap-2 px-2 py-2 bg-accent rounded-sm text-sm"
                                    >
                                        <span className="text-green-400 font-medium">
                                            ${order.price.toFixed(2)}
                                        </span>

                                        <span className="text-gray-400">
                                            ×{order.quantity}
                                        </span>

                                        <span className="text-gray-500 flex-1">
                                            ${(order.price * order.quantity).toFixed(2)} held
                                        </span>

                                        <button
                                            onClick={() => cancelBid(order.id)}
                                            disabled={cancellingId === order.id}
                                            className="text-xs text-red-400 hover:text-red-300 cursor-pointer transition-colors"
                                        >
                                            {cancellingId === order.id ? "..." : "Cancel"}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
