"use client"

import Image from "next/image"
import Link from "next/link"
import { memo } from "react"
import { DisplayCard } from "./Market"
import FloatBar from "@/app/components/FloatBar"
import { toSlug } from "@/app/lib/site"
import { rarityBackground } from "@/lib/rarity"


//

function ListingCard(
    {
        id,
        marketName,
        price,
        icon,
        hexColor,
        quantity,
        sellerId,
        currentUserId,
        floatValue,
        paintSeed,
        stickers,
        onBuy,
        onPreview,
    }:
    DisplayCard & {
        currentUserId: string | null,
        onBuy: () => void,
        onPreview: () => void,
    })
{
    const isOwned = currentUserId !== null && currentUserId === sellerId
    const wearRating = floatValue !== null ? floatValue.toFixed(9).replace(/0+$/, '') : null
    const buyButtonStyle = !isOwned && hexColor !== 'b0c3d9' ? { borderTop: `2px solid #${hexColor}` } : {}

    return (
        <div
            className="bg-accent rounded-sm h-60 overflow-hidden relative w-full transition-all duration-200 hover:scale-[1.04] hover:-translate-y-1 hover:z-10 hover:[box-shadow:0_8px_20px_var(--glow),0_4px_10px_rgba(0,0,0,0.5)]"
            style={{
                '--glow': `#${hexColor}44`,
                border: `1px solid #${hexColor}`,
                background: rarityBackground(hexColor, 38),
            } as React.CSSProperties}
        >

            <div className="absolute top-0 left-0 right-0 px-2 pt-2 z-2 flex items-start justify-between gap-1">
                <Link
                    href={`/item/${toSlug(marketName)}/${id}`}
                    onClick={e => e.stopPropagation()}
                    className="text-[11px] font-medium leading-tight line-clamp-2 hover:underline"
                >
                    {marketName}
                </Link>

                {quantity > 1 && (
                    <span className="text-[10px] leading-tight shrink-0">
                        [x{quantity}]
                    </span>
                )}
            </div>


            {/* Image */}
            <button
                className="absolute inset-0 flex items-center justify-center z-0 cursor-pointer mb-15"
                onClick={onPreview}
            >
                <Image
                    src={icon}
                    alt={marketName}
                    width={100}
                    height={100}
                    style={{
                        width: 'auto',
                        height: 'auto',
                        maxHeight: '100px',
                        filter: `drop-shadow(0 6px 12px #${hexColor}55)`,
                    }}
                />
            </button>


            {/* Footer */}
            <div className="absolute bottom-0 left-0 right-0 px-2 pb-0 z-2 flex flex-col gap-1">
                {/* Metadata */}
                {floatValue !== null && (
                    <div className="flex flex-col gap-0.5 text-[10px] text-gray-400">
                        {paintSeed != null && (
                            <span>
                                Pattern Template:{" "}

                                <span className="text-gray-200">
                                    {paintSeed}
                                </span>
                            </span>
                        )}

                        <span>
                            Wear Rating:{" "}

                            <span className="text-gray-200 font-mono">
                                {wearRating}
                            </span>
                        </span>
                    </div>
                )}


                {/* Float bar */}
                {floatValue !== null && (
                    <FloatBar
                        value={floatValue}
                        showLabels={false}
                    />
                )}


                {/* Stickers */}
                {stickers && stickers.length > 0 && (
                    <div className="flex gap-1">
                        {stickers.slice(0, 4).map((s, i) => (
                            <Image
                                key={i}
                                src={s.image}
                                alt={s.name}
                                title={s.name}
                                width={24}
                                height={24}
                                className="h-5 w-auto"
                                style={{ opacity: s.wear != null ? 1 - s.wear * 0.8 : 1 }}
                            />
                        ))}
                    </div>
                )}


                {/* Price + Buy */}
                <div className="flex items-center justify-between h-10 border-t border-gray-700/40">
                    <span className="text-sm font-semibold [font-family:var(--font-display)]">
                        ${price.toFixed(2)}
                    </span>

                    <button
                        onClick={onBuy}
                        disabled={isOwned}
                        className={`rounded-sm px-3 h-7 text-xs ${isOwned ? 'opacity-40 cursor-default' : 'bg-secondary button'}`}
                        style={buyButtonStyle}
                    >
                        {isOwned ? 'OWNED' : 'BUY'}
                    </button>
                </div>
            </div>
        </div>
    )
}


// The handlers are new closures every render but read live state through refs, so they're not compared.
export default memo(ListingCard, (prev, next) =>
    prev.id === next.id &&
    prev.price === next.price &&
    prev.quantity === next.quantity &&
    prev.currentUserId === next.currentUserId &&
    prev.hexColor === next.hexColor
)
