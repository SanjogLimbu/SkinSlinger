"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SteamItem } from '@/lib/steam'
import { stickerValue } from '@/lib/pricing'
import InventoryItemCard from './InventoryItemCard'
import RightPanel from './RightInventoryPanel'
import LeftInventoryPanel from './LeftInventoryPanel'
import SteamUrlPrompt from '@/app/components/SteamUrlPrompt'
import { FormPrompt } from '@/app/components/Prompt'
import { useEmailVerification } from '@/app/components/useEmailVerification'

//

type PriceRequest = { market_name: string, market_hash_name: string, game: string }

//

function timeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

    if (seconds < 60) {
        return "just now"
    }


    const minutes = Math.floor(seconds / 60)

    if (minutes < 60) {
        return `${minutes}m ago`
    }


    const hours = Math.floor(minutes / 60)

    return `${hours}h ago`
}

//

function PromptNotificationEmail({ onDone }: { onDone: () => void }) {
    const {
        step,
        email,
        setEmail,
        code,
        setCode,
        loading,
        error,
        sendCode,
        confirm,
    } = useEmailVerification()

    const description = step === "done"
        ? "You're all set — we'll email you about sales and trades."
        : "Get notified when you make a sale or need to send a trade offer. Completely optional."

    return (
        <FormPrompt
            title="Want email notifications?"
            description={description}
            onClose={onDone}
        >
            {step === "idle" && (
                <>
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full h-10 bg-accent rounded-sm border border-gray-500 outline-none px-3 text-sm"
                    />

                    {error && (
                        <p className="text-red-500 text-xs">
                            {error}
                        </p>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={onDone}
                            className="flex-1 rounded-sm button bg-accent h-10 text-sm font-medium"
                        >
                            Skip
                        </button>

                        <button
                            onClick={sendCode}
                            disabled={loading || email.trim().length === 0}
                            className="flex-1 rounded-sm button bg-special h-10 text-sm font-medium"
                        >
                            {loading ? "..." : "Send code"}
                        </button>
                    </div>
                </>
            )}

            {step === "code" && (
                <>
                    <p className="text-sm text-gray-400">
                        Enter the code sent to{" "}

                        <span className="text-white break-all">
                            {email}
                        </span>

                        .
                    </p>

                    <input
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        inputMode="numeric"
                        placeholder="1234"
                        className="w-full h-10 bg-accent rounded-sm border border-gray-500 outline-none px-3 text-sm tracking-widest"
                    />

                    {error && (
                        <p className="text-red-500 text-xs">
                            {error}
                        </p>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={onDone}
                            className="flex-1 rounded-sm button bg-accent h-10 text-sm font-medium"
                        >
                            Skip
                        </button>

                        <button
                            onClick={confirm}
                            disabled={loading || code.trim().length === 0}
                            className="flex-1 rounded-sm button bg-special h-10 text-sm font-medium"
                        >
                            {loading ? "..." : "Confirm"}
                        </button>
                    </div>
                </>
            )}

            {step === "done" && (
                <button
                    onClick={onDone}
                    className="rounded-sm button bg-special h-10 text-sm font-medium"
                >
                    Done
                </button>
            )}
        </FormPrompt>
    )
}


export default function InventoryClient({
    isSteamLinked,
    hasNotificationEmail,
    inventory,
    lastRefresh,
    inventoryToken,
}: {
    isSteamLinked: boolean,
    hasNotificationEmail: boolean,
    inventory: SteamItem[],
    lastRefresh: Date,
    inventoryToken: string,
}) {
    const router = useRouter()
    const [showEmailPrompt, setShowEmailPrompt] = useState(false)
    const [selling, setSelling] = useState<SteamItem[]>([])
    const [listedAssetIds, setListedAssetIds] = useState(new Set<string>())
    const [gameFilter, setGameFilter] = useState<"CS2" | "Dota2" | "Rust" | "TF2">("CS2")
    const [lastRefreshDisplay, setLastRefreshDisplay] = useState(() => timeAgo(lastRefresh))

    // Null and 0 differ, so an item with no price isn't mistaken for one still loading.
    const [livePrices, setLivePrices] = useState<Map<string, number | null>>(() => {
        const map = new Map<string, number | null>()

        for (const item of inventory) {
            if (!map.has(item.market_name)) {
                map.set(item.market_name, item.price > 0 ? item.price : null)
            }
        }


        return map
    })


    useEffect(() => {
        setLastRefreshDisplay(timeAgo(lastRefresh))

        const id = setInterval(() => {
            setLastRefreshDisplay(timeAgo(lastRefresh))
        }, 10000)

        return () => clearInterval(id)
    }, [lastRefresh])


    useEffect(() => {
        setLivePrices(prev => {
            const next = new Map(prev)

            for (const item of inventory) {
                if (!next.has(item.market_name)) {
                    next.set(item.market_name, item.price > 0 ? item.price : null)
                }
            }


            return next
        })
    }, [inventory])


    useEffect(() => {
        const unpriced: SteamItem[] = []
        const seen = new Set<string>()

        for (const item of inventory) {
            if (item.price > 0 || seen.has(item.market_name)) {
                continue
            }


            seen.add(item.market_name)
            unpriced.push(item)
        }


        const stickerSeen = new Set<string>()
        const stickerItems: PriceRequest[] = []

        for (const item of inventory) {
            if (!item.stickers) {
                continue
            }


            for (const s of item.stickers) {
                const name = `Sticker | ${s.name}`

                if (!stickerSeen.has(name)) {
                    stickerSeen.add(name)
                    stickerItems.push({
                        market_name: name,
                        market_hash_name: name,
                        game: 'CS2',
                    })
                }
            }
        }


        if (unpriced.length === 0 && stickerItems.length === 0) {
            return
        }


        const unpricedItems: PriceRequest[] = unpriced.map(i => ({
            market_name: i.market_name,
            market_hash_name: i.market_hash_name,
            game: i.game,
        }))
        const items = [...unpricedItems, ...stickerItems]

        const controller = new AbortController()

        ;(async () => {
            try {
                const res = await fetch('/api/prices', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items }),
                    signal: controller.signal,
                })

                if (!res.body) {
                    return
                }


                const reader = res.body.getReader()
                const decoder = new TextDecoder()
                let buffer = ''


                // Prices are flushed in batches, since a state update per line re-renders the whole grid.
                let pending = new Map<string, number>()
                let flushTimer: ReturnType<typeof setTimeout> | null = null

                const flush = () => {
                    if (flushTimer) {
                        clearTimeout(flushTimer)
                        flushTimer = null
                    }


                    if (pending.size === 0) {
                        return
                    }


                    const updates = pending
                    pending = new Map()

                    setLivePrices(prev => {
                        const next = new Map(prev)

                        for (const [name, price] of updates) {
                            next.set(name, price)
                        }


                        return next
                    })
                }

                try {
                    while (true) {
                        const { done, value } = await reader.read()

                        if (done) {
                            break
                        }


                        buffer += decoder.decode(value, { stream: true })
                        const lines = buffer.split('\n')
                        buffer = lines.pop()!

                        for (const line of lines) {
                            if (!line.trim()) {
                                continue
                            }


                            // One malformed line shouldn't drop the batch or end the stream.
                            try {
                                const { market_name, price } = JSON.parse(line)
                                pending.set(market_name, price)
                            }
                            catch { }
                        }


                        // A timer drives the flush, so prices parsed before a slow item still render.
                        if (pending.size > 0 && !flushTimer) {
                            flushTimer = setTimeout(flush, 150)
                        }
                    }
                }
                finally {
                    flush()
                }
            }
            catch (e) {
                if ((e as Error).name === 'AbortError') {
                    return
                }


                // Prices are left null on any other error, so items stay visible.
            }
        })()

        return () => controller.abort()
    }, [])


    function onTradeUrlLinked() {
        if (!hasNotificationEmail) {
            setShowEmailPrompt(true)
        }


        router.refresh()
    }


    function onListed(ids: string[]) {
        setListedAssetIds(prev => new Set([...prev, ...ids]))

        if (!hasNotificationEmail) {
            setShowEmailPrompt(true)
        }


        router.refresh()
    }


    const filtered = inventory.filter(i => i.game === gameFilter && !listedAssetIds.has(i.assetId))

    const stackedInventory = (() => {
        const result: (SteamItem & { quantity: number })[] = []
        const commodityMap = new Map<string, SteamItem & { quantity: number }>()
        const priceOf = (name: string) => livePrices.get(name) ?? 0

        for (const item of filtered) {
            const priceState = livePrices.get(item.market_name)

            const basePrice = priceState ?? 0
            const price = basePrice + stickerValue(item.stickers, priceOf)


            // Waits for every price first, so an item is never hidden on a partial total.
            const stickerNames = (item.stickers ?? []).map(s => `Sticker | ${s.name}`)
            const stickersResolved = stickerNames.every(name => typeof livePrices.get(name) === "number")

            if (typeof priceState === "number" && stickersResolved && price <= 0.10) {
                continue
            }


            const itemWithPrice = { ...item, price }

            if (item.commodity) {
                const existing = commodityMap.get(item.market_name)

                if (existing) {
                    existing.quantity += 1
                }
                else {
                    const entry = { ...itemWithPrice, quantity: 1 }
                    commodityMap.set(item.market_name, entry)
                    result.push(entry)
                }
            }
            else {
                result.push({ ...itemWithPrice, quantity: 1 })
            }
        }


        return result.sort((a, b) => b.price - a.price)
    })()


    const totalValue = stackedInventory.reduce((sum, item) => {
        const priceState = livePrices.get(item.market_name)

        if (priceState === null) {
            return sum
        }


        return sum + item.price * item.quantity
    }, 0)


    return (
        <>
            {isSteamLinked && showEmailPrompt && (
                <PromptNotificationEmail onDone={() => setShowEmailPrompt(false)} />
            )}

            <LeftInventoryPanel
                gameFilter={gameFilter}
                setGameFilter={setGameFilter}
            />

            <RightPanel
                selling={selling}
                setSelling={setSelling}
                onListed={onListed}
                livePrices={livePrices}
                inventoryToken={inventoryToken}
            />


            {/* Main column */}
            <div className={`flex flex-col h-full pt-[72px] px-[2.5%] md:h-230 md:w-457 md:ml-12 md:pt-20 md:pl-46 md:pr-100${selling.length > 0 ? ' pb-16 md:pb-0' : ''}`}>
                {/* Mobile game filter */}
                <div className="md:hidden flex px-3 py-2 gap-1.5 overflow-x-auto no-scrollbar justify-center">
                    {(["CS2", "Dota2", "Rust", "TF2"] as const).map(g => (
                        <button
                            key={g}
                            onClick={() => setGameFilter(g)}
                            className={`shrink-0 px-3 h-8 text-sm rounded-sm button transition-colors ${gameFilter === g ? "bg-special font-medium" : "bg-accent"}`}
                        >
                            {g === "Dota2" ? "Dota 2" : g}
                        </button>
                    ))}
                </div>

                {!isSteamLinked ? (
                    <div className="flex items-center justify-center flex-1">
                        <SteamUrlPrompt onLinked={onTradeUrlLinked} />
                    </div>
                ) : (
                    <>
                        {/* Info bar */}
                        <div className="border border-gray-800 frame-shadow flex items-center px-4 py-3 gap-6 md:h-18 md:px-6 md:py-0 md:gap-10 rounded-sm shrink-0">
                            <div className="flex flex-col items-center">
                                <span className="text-[11px] uppercase tracking-widest opacity-50">
                                    Items
                                </span>

                                <span className="text-xl md:text-2xl">
                                    {stackedInventory.length}
                                </span>
                            </div>

                            <div className="flex flex-col items-center">
                                <span className="text-[11px] uppercase tracking-widest opacity-50">
                                    Market Value
                                </span>

                                <span className="text-xl md:text-2xl">
                                    ${totalValue.toFixed(2)}
                                </span>
                            </div>

                            <div className="flex flex-col items-center ml-auto">
                                <span className="text-[11px] uppercase tracking-widest opacity-50">
                                    Last Updated
                                </span>

                                <span className="text-xl md:text-2xl">
                                    {lastRefreshDisplay}
                                </span>
                            </div>
                        </div>


                        {/* Grid */}
                        <div className="overflow-y-auto flex-1 min-h-0 border border-gray-800 frame-shadow mt-2 p-3 rounded-sm">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 justify-start content-start">
                                {stackedInventory.map((item) => {
                                    const currentAmount = selling.filter(i => i.market_name === item.market_name).length
                                    const remaining = item.quantity - currentAmount

                                    if (remaining <= 0) {
                                        return
                                    }


                                    return (
                                        <InventoryItemCard
                                            key={item.assetId}
                                            item={item}
                                            quantity={remaining}
                                            setSelling={setSelling}
                                            hexColor={item.hexColor}
                                            loading={livePrices.get(item.market_name) === null}
                                        />
                                    )
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    )
}
