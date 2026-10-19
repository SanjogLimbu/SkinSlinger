"use client"

import Image from "next/image"
import Link from "next/link"
import { RARITIES } from "@/lib/rarity"

type GameFilter = "all" | "CS2" | "Dota2" | "Rust" | "TF2"

type GameOption = {
    label: string,
    value: GameFilter,
    href: string,
    icon: string,
}

//

const SLIDER_MAX = 5000
const FLOAT_MAX = 1

const gameOptions: GameOption[] = [
    { label: "CS2", value: "CS2", href: "/market/cs2", icon: "/cs2.png" },
    { label: "Dota 2", value: "Dota2", href: "/market/dota2", icon: "/dota.png" },
    { label: "Rust", value: "Rust", href: "/market/rust", icon: "/rust.png" },
    { label: "TF2", value: "TF2", href: "/market/tf2", icon: "/tf2.png" },
]

const wearOptions = [
    { label: "Factory New", short: "FN" },
    { label: "Minimal Wear", short: "MW" },
    { label: "Field-Tested", short: "FT" },
    { label: "Well-Worn", short: "WW" },
    { label: "Battle-Scarred", short: "BS" },
]

const typeOptions = [
    { label: "Skins", value: "skin" },
    { label: "Commodities", value: "commodity" },
]

const thumbClass = [
    "absolute w-full h-0 top-2",
    "appearance-none bg-transparent pointer-events-none",
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none",
    "[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full",
    "[&::-webkit-slider-thumb]:bg-special [&::-webkit-slider-thumb]:cursor-pointer",
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:border-0",
    "[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full",
    "[&::-moz-range-thumb]:bg-special [&::-moz-range-thumb]:cursor-pointer",
].join(" ")

//

function sliderValue(input: string, fallback: number, max: number): number {
    if (input === "") {
        return fallback
    }


    return Math.min(parseFloat(input) || fallback, max)
}


function PriceInput({ value, onChange, placeholder, className }: {
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    className: string,
}) {
    return (
        <div className={`flex items-center bg-accent rounded-sm px-2 h-7 gap-1 ${className}`}>
            <span className="text-[11px] text-gray-500">
                $
            </span>

            <input
                type="number"
                min={0}
                step={0.01}
                placeholder={placeholder}
                value={value}
                onChange={e => onChange(e.target.value)}
                className="bg-transparent text-xs w-full outline-none"
            />
        </div>
    )
}

//

export default function LeftPanel({
    currentGame,
    minPrice, setMinPrice,
    maxPrice, setMaxPrice,
    wear, setWear,
    minFloat, setMinFloat,
    maxFloat, setMaxFloat,
    hasStickers, setHasStickers,
    type, setType,
    rarity, setRarity,
}: {
    currentGame: GameFilter,
    minPrice: string,
    setMinPrice: (v: string) => void,
    maxPrice: string,
    setMaxPrice: (v: string) => void,
    wear: string | null,
    setWear: (v: string | null) => void,
    minFloat: string,
    setMinFloat: (v: string) => void,
    maxFloat: string,
    setMaxFloat: (v: string) => void,
    hasStickers: boolean,
    setHasStickers: (v: boolean) => void,
    type: string | null,
    setType: (v: string | null) => void,
    rarity: string | null,
    setRarity: (v: string | null) => void,
}) {
    const minVal = sliderValue(minPrice, 0, SLIDER_MAX)
    const maxVal = sliderValue(maxPrice, SLIDER_MAX, SLIDER_MAX)
    const fillLeft = (minVal / SLIDER_MAX) * 100
    const fillRight = 100 - (maxVal / SLIDER_MAX) * 100

    const showFloat = currentGame === "CS2" || currentGame === "TF2"
    const minFloatVal = sliderValue(minFloat, 0, FLOAT_MAX)
    const maxFloatVal = sliderValue(maxFloat, FLOAT_MAX, FLOAT_MAX)
    const floatFillLeft = (minFloatVal / FLOAT_MAX) * 100
    const floatFillRight = 100 - (maxFloatVal / FLOAT_MAX) * 100

    const rarities = RARITIES[currentGame] ?? []
    const selectedRarity = rarities.find(r => r.key === rarity)

    return (
        <>
            {/* Desktop filters */}
            <div className="hidden md:flex flex-col fixed left-[2.5%] top-20 bottom-4 w-43 2xl:w-64">
                <div className="border border-gray-800 frame-shadow rounded-sm flex flex-col h-full overflow-y-auto overflow-x-hidden">

                    {/* Games */}
                    <div className="px-3 pt-3 pb-1">
                        <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-1.5">
                            Games
                        </p>

                        <div className="flex flex-col gap-0.5">
                            {gameOptions.map(({ label, value, href, icon }) => (
                                <Link
                                    key={value}
                                    href={href}
                                    className={`flex items-center gap-2.5 px-2.5 h-9 rounded-sm text-sm button transition-colors ${
                                        currentGame === value
                                            ? "bg-special font-medium"
                                            : "hover:bg-accent"
                                    }`}
                                >
                                    <Image
                                        src={icon}
                                        alt={label}
                                        width={18}
                                        height={18}
                                        className="rounded-sm shrink-0"
                                    />

                                    {label}
                                </Link>
                            ))}
                        </div>
                    </div>


                    {/* Price Range */}
                    <div className="px-3 py-3 mt-1 border-t border-gray-700/60">
                        <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-3">
                            Price Range
                        </p>


                        {/* Dual-thumb slider */}
                        <div className="relative h-4 mx-1 mb-3">
                            <div className="absolute top-1.5 left-0 right-0 h-1 bg-accent rounded-full" />

                            <div
                                className="absolute top-1.5 h-1 bg-special rounded-full"
                                style={{ left: `${fillLeft}%`, right: `${fillRight}%` }}
                            />

                            <input
                                type="range"
                                min={0}
                                max={SLIDER_MAX}
                                step={1}
                                value={minVal}
                                onChange={e => {
                                    const v = parseInt(e.target.value)
                                    setMinPrice(v === 0 ? "" : String(v))
                                }}
                                className={thumbClass}
                            />

                            <input
                                type="range"
                                min={0}
                                max={SLIDER_MAX}
                                step={1}
                                value={maxVal}
                                onChange={e => {
                                    const v = parseInt(e.target.value)
                                    setMaxPrice(v === SLIDER_MAX ? "" : String(v))
                                }}
                                className={thumbClass}
                            />
                        </div>


                        {/* Min / Max inputs */}
                        <div className="flex items-center gap-2">
                            <PriceInput
                                value={minPrice}
                                onChange={setMinPrice}
                                placeholder="0.00"
                                className="flex-1"
                            />

                            <span className="text-gray-600 text-xs">
                                –
                            </span>

                            <PriceInput
                                value={maxPrice}
                                onChange={setMaxPrice}
                                placeholder="All"
                                className="flex-1"
                            />
                        </div>
                    </div>


                    {/* CS2 Type */}
                    {currentGame === "CS2" && (
                        <div className="px-3 py-3 border-t border-gray-700/60">
                            <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-2">
                                Type
                            </p>

                            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-1">
                                {typeOptions.map(({ label, value }) => (
                                    <button
                                        key={value}
                                        onClick={() => setType(type === value ? null : value)}
                                        className={`w-full h-8 text-xs rounded-sm button transition-colors text-left px-2.5 ${
                                            type === value ? "bg-special font-medium" : "bg-accent"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}


                    {/* CS2 / Dota 2 Rarity */}
                    {rarities.length > 0 && (
                        <div className="px-3 py-3 border-t border-gray-700/60">
                            <div className="flex items-baseline justify-between mb-2">
                                <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">
                                    Rarity
                                </p>

                                {selectedRarity && (
                                    <span
                                        className="text-[11px] font-medium"
                                        style={{ color: `#${selectedRarity.hex}` }}
                                    >
                                        {selectedRarity.label}
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-1">
                                {rarities.map(({ key, label, hex }) => (
                                    <button
                                        key={key}
                                        title={label}
                                        aria-label={label}
                                        onClick={() => setRarity(rarity === key ? null : key)}
                                        className={`flex-1 h-5 rounded-sm cursor-pointer transition-all ${
                                            rarity === key ? "ring-2 ring-white" : "opacity-70 hover:opacity-100"
                                        }`}
                                        style={{ backgroundColor: `#${hex}` }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}


                    {/* CS2 / TF2 Float Range */}
                    {showFloat && (
                        <div className="px-3 py-3 border-t border-gray-700/60">
                            <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-3">
                                Float Range
                            </p>


                            {/* Dual-thumb slider */}
                            <div className="relative h-4 mx-1 mb-3">
                                <div className="absolute top-1.5 left-0 right-0 h-1 bg-accent rounded-full" />

                                <div
                                    className="absolute top-1.5 h-1 bg-special rounded-full"
                                    style={{ left: `${floatFillLeft}%`, right: `${floatFillRight}%` }}
                                />

                                <input
                                    type="range"
                                    min={0}
                                    max={FLOAT_MAX}
                                    step={0.001}
                                    value={minFloatVal}
                                    onChange={e => {
                                        const v = parseFloat(e.target.value)
                                        setMinFloat(v === 0 ? "" : String(v))
                                    }}
                                    className={thumbClass}
                                />

                                <input
                                    type="range"
                                    min={0}
                                    max={FLOAT_MAX}
                                    step={0.001}
                                    value={maxFloatVal}
                                    onChange={e => {
                                        const v = parseFloat(e.target.value)
                                        setMaxFloat(v === FLOAT_MAX ? "" : String(v))
                                    }}
                                    className={thumbClass}
                                />
                            </div>


                            {/* Min / Max inputs */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.001}
                                    placeholder="0.000"
                                    value={minFloat}
                                    onChange={e => setMinFloat(e.target.value)}
                                    className="flex-1 min-w-0 bg-accent rounded-sm px-2 h-7 text-xs outline-none"
                                />

                                <span className="text-gray-600 text-xs shrink-0">
                                    –
                                </span>

                                <input
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.001}
                                    placeholder="1.000"
                                    value={maxFloat}
                                    onChange={e => setMaxFloat(e.target.value)}
                                    className="flex-1 min-w-0 bg-accent rounded-sm px-2 h-7 text-xs outline-none"
                                />
                            </div>
                        </div>
                    )}


                    {/* CS2 / TF2 Condition */}
                    {(currentGame === "CS2" || currentGame === "TF2") && (
                        <div className="px-3 py-3 border-t border-gray-700/60">
                            <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-2">
                                Condition
                            </p>

                            <div className="flex flex-col gap-1">
                                {wearOptions.map(({ label }) => (
                                    <button
                                        key={label}
                                        onClick={() => setWear(wear === label ? null : label)}
                                        className={`w-full h-8 text-xs rounded-sm button transition-colors text-left px-2.5 ${
                                            wear === label ? "bg-special font-medium" : "bg-accent"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}


                    {/* CS2 Stickers */}
                    {currentGame === "CS2" && (
                        <div className="px-3 py-3 border-t border-gray-700/60">
                            <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase mb-2">
                                Stickers
                            </p>

                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={hasStickers}
                                    onChange={e => setHasStickers(e.target.checked)}
                                    className="w-4 h-4 rounded-sm accent-special cursor-pointer"
                                />

                                <span className="text-xs">
                                    Include stickers
                                </span>
                            </label>
                        </div>
                    )}
                </div>
            </div>


            {/* Mobile filters */}
            <div className="md:hidden mt-16 flex flex-col gap-2 px-[2.5%] py-2">
                {/* Game links */}
                <div className="flex justify-center border border-gray-800 frame-shadow rounded-sm px-3 py-2 gap-1.5 overflow-x-auto no-scrollbar">
                    {gameOptions.map(({ label, value, href, icon }) => (
                        <Link
                            key={value}
                            href={href}
                            className={`shrink-0 flex items-center gap-1.5 px-3 h-8 text-sm rounded-sm button transition-colors ${
                                currentGame === value ? "bg-special font-medium" : "bg-accent"
                            }`}
                        >
                            <Image
                                src={icon}
                                alt={label}
                                width={15}
                                height={15}
                                className="rounded-sm"
                            />

                            {label}
                        </Link>
                    ))}
                </div>


                {/* Price */}
                <div className="flex items-center justify-center gap-2 border border-gray-800 frame-shadow rounded-sm px-3 py-2 overflow-x-auto no-scrollbar">
                    <PriceInput
                        value={minPrice}
                        onChange={setMinPrice}
                        placeholder="0"
                        className="w-24 shrink-0"
                    />

                    <span className="text-gray-600 text-xs shrink-0">
                        –
                    </span>

                    <PriceInput
                        value={maxPrice}
                        onChange={setMaxPrice}
                        placeholder="All"
                        className="w-24 shrink-0"
                    />
                </div>
            </div>
        </>
    )
}
