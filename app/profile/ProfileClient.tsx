"use client"

import { useState, useEffect } from "react"
import { signOut } from "next-auth/react"
import Image from "next/image"
import Link from "next/link"
import { toSlug } from "@/app/lib/site"

//

type Sticker = { stickerId: number; slot: number; name: string; image: string; wear: number | null }
type Listing = { id: string; marketName: string; price: number; icon: string | null; hexColor: string | null; game: string | null; commodity: boolean; floatValue: number | null; stickers: unknown }

//

function Listings({ listings }: { listings: Listing[] }) {
    return (
        <>
            <div className="flex flex-col gap-2 w-full md:w-100">
                <p className="text-xs text-gray-500 uppercase tracking-widest">
                    Active Listings ({listings.length})
                </p>

                <div className="bg-secondary rounded-sm divide-y divide-gray-700 md:overflow-y-auto md:max-h-[650px]">
                    {(() => {
                        type Row = { listing: Listing; quantity: number; href: string }
                        const commodityMap = new Map<string, Row>()
                        const rows: Row[] = []

                        for (const listing of listings) {
                            if (listing.commodity) {
                                const existing = commodityMap.get(listing.marketName)
                                if (existing) {
                                    existing.quantity += 1
                                } else {
                                    const row: Row = { listing, quantity: 1, href: `/item/${toSlug(listing.marketName)}/${listing.id}?from=profile` }
                                    commodityMap.set(listing.marketName, row)
                                    rows.push(row)
                                }
                            } else {
                                rows.push({ listing, quantity: 1, href: `/item/${toSlug(listing.marketName)}/${listing.id}?from=profile` })
                            }
                        }

                        return rows.map(({ listing, quantity, href }) => {
                            const rarityColor = listing.hexColor ? `#${listing.hexColor}` : null

                            return (
                                <Link
                                    key={listing.commodity ? listing.marketName : listing.id}
                                    href={href}
                                    className="flex flex-col gap-1.5 px-4 py-4 hover:bg-accent transition-colors"
                                    style={rarityColor ? { borderLeft: `3px solid ${rarityColor}`, backgroundImage: `linear-gradient(to right, ${rarityColor}33, transparent 60%)` } : undefined}
                                >
                                    <div className="flex gap-3 items-start">
                                        {/* Left: icon */}
                                        {listing.icon && (
                                            <Image
                                                src={listing.icon}
                                                alt={listing.marketName}
                                                width={64}
                                                height={64}
                                                className="object-contain shrink-0"
                                                style={rarityColor ? { filter: `drop-shadow(0 4px 10px ${rarityColor}66)` } : undefined}
                                            />
                                        )}

                                        {/* Middle: name, float, stickers */}
                                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-sm leading-none truncate" style={rarityColor ? { color: rarityColor } : undefined}>
                                                    {listing.marketName}
                                                </span>

                                                {listing.commodity && (
                                                    <span className="text-xs text-gray-500 shrink-0 leading-none">
                                                        ×{quantity}
                                                    </span>
                                                )}
                                            </div>

                                            {listing.floatValue != null && (
                                                <span className="text-[10px] text-gray-500 font-mono">
                                                    {listing.floatValue.toFixed(10).replace(/0+$/, '')}
                                                </span>
                                            )}

                                            {(() => {
                                                const stickers = Array.isArray(listing.stickers) ? (listing.stickers as Sticker[]) : null
                                                if (!stickers || stickers.length === 0) return null
                                                return (
                                                    <div className="flex gap-1">
                                                        {stickers.map((s, i) => (
                                                            <div key={i} title={s.name}>
                                                                <Image src={s.image} alt={s.name} width={24} height={24} className="h-6 w-auto" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )
                                            })()}
                                        </div>


                                        {/* Right: price */}
                                        <span className="text-sm font-medium text-special shrink-0 leading-none">
                                            ${listing.price.toFixed(2)}
                                        </span>
                                    </div>
                                </Link>
                            )
                        })
                    })()}
                </div>
            </div>
        </>
    )
}

//

export default function ProfileClient({ sales, purchases, createdAt, steamId, listings, name, image }: { sales: number; purchases: number; saleCount: number; purchaseCount: number; createdAt: Date; steamId: string | null; listings: Listing[]; name: string | null; image: string | null }) {
    const [copied, setCopied] = useState(false)

    function copyProfileLink() {
        navigator.clipboard.writeText(`${window.location.origin}/user/${steamId}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }


    const total_volume = sales + purchases
    const memberSince = new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })

    const tierThresholds = {
        I: 0,
        II: 100,
        III: 1000,
        IV: 5000,
        V: 25000,
    } as const

    type Tier = keyof typeof tierThresholds

    let tier: Tier = "I"

    if (total_volume >= tierThresholds.V) {
        tier = "V"
    }
    else if (total_volume >= tierThresholds.IV) {
        tier = "IV"
    }
    else if (total_volume >= tierThresholds.III) {
        tier = "III"
    }
    else if (total_volume >= tierThresholds.II) {
        tier = "II"
    }

    const nextTierMap: Record<Tier, Tier | null> = {
        I: "II",
        II: "III",
        III: "IV",
        IV: "V",
        V: null,
    }

    const nextTierLabel = nextTierMap[tier]
    const currentTierVolume = tierThresholds[tier]
    const nextTierVolume = nextTierLabel ? tierThresholds[nextTierLabel] : tierThresholds.V
    const remaining = nextTierLabel ? Math.max(nextTierVolume - total_volume, 0) : 0
    const progress = nextTierLabel
        ? Math.min(((total_volume - currentTierVolume) / (nextTierVolume - currentTierVolume)) * 100, 100)
        : 100

    const tierColor =
        tier === "V" ? "text-purple-400" :
        tier === "IV" ? "text-cyan-400" :
        tier === "III" ? "text-yellow-400" :
        tier === "II" ? "text-amber-600" :
        "text-white"

    const [displayProgress, setDisplayProgress] = useState(0)

    useEffect(() => {
        const timer = setTimeout(() => setDisplayProgress(progress), 200)
        return () => clearTimeout(timer)
    }, [progress])

    const withdrawFee = tier === "V" ? "0.5%" : tier === "IV" ? "1.0%" : tier === "III" ? "1.5%" : tier === "II" ? "2.0%" : "2.5%"

    return (
        <div className="w-full h-full overflow-x-hidden overflow-y-auto flex flex-col items-center md:flex-row md:justify-center md:items-center py-8 gap-4 px-3">
            <div className="flex flex-col items-center gap-6 w-full max-w-sm bg-gradient-to-b from-transparent to-secondary rounded-sm py-6 px-3 mt-20 md:mt-0">
                <div className="flex flex-col items-center gap-3">
                    {image && (
                        <div className="rounded-full ring-2 ring-special/50 p-0.5">
                            <Image src={image} alt="Profile" height={90} width={90} className="rounded-full" />
                        </div>
                    )}

                    {name && (
                        <p className="text-lg font-semibold">
                            {name}
                        </p>
                    )}
                    <h1 className={`text-3xl font-bold tracking-wide ${tierColor}`}>
                        TIER {tier}
                    </h1>
                </div>

  
                <div className="w-full flex flex-col gap-2">
                    <div className="flex justify-between text-xs text-gray-400">
                        <span>
                            Volume
                        </span>

                        <span>
                            ${total_volume.toLocaleString()} / ${nextTierVolume.toLocaleString()}
                        </span>
                    </div>

                    <div className="bg-accent w-full h-3 rounded-full overflow-hidden relative">
                        <div
                            className="bg-special h-full rounded-full transition-[width] duration-1000 ease-out absolute top-0 left-0"
                            style={{ width: `${displayProgress}%` }}
                        />
                    </div>

                    {tier !== "V" && (
                        <p className="text-xs text-gray-500 text-right">
                            ${remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })} until Tier {nextTierLabel}
                        </p>
                    )}
                </div>

  
                <div className="bg-secondary w-full rounded-sm divide-y divide-gray-700">
                    <div className="flex justify-between items-center px-4 py-3">
                        <span className="text-sm text-gray-400">
                            Withdrawal Fee
                        </span>

                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-special">
                                {withdrawFee}
                            </span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center px-4 py-3">
                        <span className="text-sm text-gray-400">
                            Member Since
                        </span>

                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">
                                {memberSince}
                            </span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center px-4 py-3">
                        <span className="text-sm text-gray-400">
                            Purchases
                        </span>

                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">
                                ${purchases.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center px-4 py-3">
                        <span className="text-sm text-gray-400">
                            Sales
                        </span>

                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">
                                ${sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center px-4 py-3">
                        <span className="text-sm text-gray-400">
                            Total Volume
                        </span>

                        <span className="text-sm font-semibold text-special">
                            ${total_volume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>

                </div>

                <div className="flex flex-col gap-2">
                    <button
                        onClick={copyProfileLink}
                        className="text-xs button w-80 bg-accent h-10 rounded-sm"
                    >
                        {copied ? "Copied!" : "Copy profile link"}
                    </button>

                    <button
                        onClick={() => signOut()}
                        className="hidden md:block text-xs button w-80 bg-negative h-10 rounded-sm"
                    >
                        Log out
                    </button>
                </div>
            </div>

            {listings.length > 0 && (
                <Listings listings={listings}/>
            )}
        </div>
    )
}
