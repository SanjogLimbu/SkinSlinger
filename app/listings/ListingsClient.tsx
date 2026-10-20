"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import FloatBar from "@/app/components/FloatBar"
import { Prompt } from "@/app/components/Prompt"

//

type Listing = {
    id: string
    assetId: string
    marketName: string
    price: number
    game: string | null
    icon: string | null
    hexColor: string | null
    commodity: boolean
    floatValue: number | null
    paintSeed: number | null
}

type ListingGroup = {
    ids: string[]
    marketName: string
    price: number
    icon: string | null
    hexColor: string | null
    commodity: boolean
    floatValue: number | null
    paintSeed: number | null
}

function groupListings(listings: Listing[]): ListingGroup[] {
    const map = new Map<string, ListingGroup>()

    for (const l of listings) {
        const key = l.commodity ? l.marketName : l.id
        const existing = map.get(key)

        if (existing) {
            existing.ids.push(l.id)
        }
        else {
            map.set(key, {
                ids: [l.id],
                marketName: l.marketName,
                price: l.price,
                icon: l.icon,
                hexColor: l.hexColor,
                commodity: l.commodity,
                floatValue: l.floatValue,
                paintSeed: l.paintSeed,
            })
        }
    }


    return [...map.values()]
}

//

function ListingCard({ group, onDelist }: { group: ListingGroup; onDelist: () => void }) {
    const router = useRouter()
    const [priceStr, setPriceStr] = useState(group.price.toFixed(2))
    const [basePrice, setBasePrice] = useState(group.price)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")

    const parsedPrice = parseFloat(priceStr)
    const isDirty = !isNaN(parsedPrice) && parsedPrice > 0 && parsedPrice !== basePrice
    const totalPrice = (isNaN(parsedPrice) ? group.price : parsedPrice) * group.ids.length
    const floatText = group.floatValue?.toFixed(9).replace(/0+$/, '') ?? ''

    async function savePrice() {
        const previousPrice = basePrice

        setSaving(true)
        setBasePrice(parsedPrice)
        setError("")

        for (const id of group.ids) {
            const res = await fetch(`/api/listings/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ price: parsedPrice }),
            })


            if (!res.ok) {
                const data = await res.json()

                setError(data.error ?? "Failed to update price")
                setBasePrice(previousPrice)
                setSaving(false)

                return
            }
        }


        router.refresh()
        setSaving(false)
    }


    function delist() {
        onDelist()

        for (const id of group.ids) {
            fetch(`/api/listings/${id}`, { method: "DELETE" })
        }
    }


    return (
        <div
            className="relative bg-accent rounded-sm flex flex-col overflow-hidden transition-all duration-200 hover:scale-[1.03] hover:-translate-y-1 hover:z-10 hover:[box-shadow:0_8px_20px_var(--glow),0_4px_10px_rgba(0,0,0,0.5)]"
            style={{ '--glow': `#${group.hexColor}44` } as React.CSSProperties}
        >
            <div className="shrink-0 h-10 flex justify-between items-start px-2 pt-2 pb-1">
                <p className="text-[11px] leading-tight font-medium line-clamp-2 flex-1 pr-1">
                    {group.marketName}
                </p>

                {group.ids.length > 1 && (
                    <p className="text-[11px] opacity-60 shrink-0">
                        [x{group.ids.length}]
                    </p>
                )}
            </div>

            <div
                className="relative h-20 md:h-24 shrink-0 mx-2 flex items-center justify-center"
                style={{ filter: `drop-shadow(0 0 10px #${group.hexColor}99)` }}
            >
                {group.icon && (
                    <Image
                        src={group.icon}
                        alt={group.marketName}
                        width={90}
                        height={90}
                        style={{
                            width: 'auto',
                            height: 'auto',
                            maxHeight: '90px',
                        }}
                    />
                )}
            </div>

            <div className={`shrink-0 mt-auto px-2 pb-1 flex flex-col gap-0.5 text-[10px] text-gray-500 ${group.floatValue === null ? 'invisible' : ''}`}>
                {group.paintSeed != null ? (
                    <span>
                        Pattern{" "}

                        <span className="text-gray-300">
                            #{group.paintSeed}
                        </span>
                    </span>
                ) : (
                    <span>
                        &nbsp;
                    </span>
                )}

                <span>
                    Float{" "}

                    <span className="text-gray-300 font-mono">
                        {floatText}
                    </span>
                </span>
            </div>

            <div className={`shrink-0 px-2 pb-1 ${group.floatValue === null ? 'invisible' : ''}`}>
                <FloatBar
                    value={group.floatValue ?? 0}
                    showLabels={false}
                />
            </div>

            <div className="shrink-0 px-2 pt-2 pb-1 flex flex-col gap-1">
                <button
                    onClick={savePrice}
                    disabled={saving || !isDirty}
                    className={`h-8 w-full rounded-sm bg-special button text-sm ${isDirty ? '' : 'invisible pointer-events-none'}`}
                >
                    {saving ? "..." : "Save price"}
                </button>

                <div className="flex items-center bg-primary rounded-sm px-2 h-8">
                    <span className="text-xs opacity-50 mr-1">
                        $
                    </span>

                    <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={priceStr}
                        onChange={e => setPriceStr(e.target.value)}
                        className="flex-1 bg-transparent outline-none text-sm w-0"
                    />

                    {group.ids.length > 1 && (
                        <span className="text-xs opacity-40 shrink-0 ml-1">
                            = ${totalPrice.toFixed(2)}
                        </span>
                    )}
                </div>

                {error && (
                    <p className="text-red-400 text-xs">
                        {error}
                    </p>
                )}
            </div>

            <button
                onClick={delist}
                className="shrink-0 h-10 w-full bg-negative button text-sm"
            >
                DELIST
            </button>
        </div>
    )
}

//

export default function ListingsClient({ listings }: { listings: Listing[] }) {
    const [groups, setGroups] = useState(() => groupListings(listings))
    const [confirmDelistAll, setConfirmDelistAll] = useState(false)

    function removeGroup(id: string) {
        setGroups(prev => prev.filter(g => g.ids[0] !== id))
    }


    function delistAll() {
        const allIds = groups.flatMap(g => g.ids)
        setGroups([])
        setConfirmDelistAll(false)

        fetch("/api/listings", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: allIds }),
        })
    }


    return (
        <div className="h-full flex flex-col pt-20 px-4 md:px-8">
            {confirmDelistAll && (
                <Prompt title={`Delist all ${listings.length} listings?`}>
                    <p className="text-sm text-gray-400">
                        This cannot be undone.
                    </p>

                    <div className="flex gap-2">
                        <button
                            onClick={delistAll}
                            className="flex-1 h-10 rounded-sm bg-negative button text-sm"
                        >
                            Delist all
                        </button>

                        <button
                            onClick={() => setConfirmDelistAll(false)}
                            className="flex-1 h-10 rounded-sm bg-accent button text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </Prompt>
            )}

            <div className="w-full max-w-7xl mx-auto flex flex-col gap-4 flex-1 min-h-0">
                <div className="flex items-center justify-between shrink-0">
                    <p className="text-xl">
                        My Listings
                    </p>

                    {groups.length > 0 && (
                        <button
                            onClick={() => setConfirmDelistAll(true)}
                            className="w-50 h-10 bg-accent button rounded-sm"
                        >
                            Delist all
                        </button>
                    )}
                </div>

                {groups.length === 0 ? (
                    <p className="opacity-40">
                        You have no active listings.
                    </p>
                ) : (
                    <div className="overflow-y-auto flex-1 px-2 pt-2 pb-8">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                            {groups.map((g) => (
                                <ListingCard
                                    key={g.ids[0]}
                                    group={g}
                                    onDelist={() => removeGroup(g.ids[0])}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
