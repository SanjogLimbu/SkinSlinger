"use client"

import Image from "next/image"

//

function modifierLabel(modifier: number): string {
    if (modifier > 0) {
        return `+${modifier}%`
    }
    else if (modifier < 0) {
        return `-${Math.abs(modifier)}%`
    }
    else {
        return '0%'
    }
}


function modifierColor(modifier: number): string {
    if (modifier > 0) {
        return 'text-green-400'
    }
    else if (modifier < 0) {
        return 'text-red-400'
    }
    else {
        return 'opacity-40'
    }
}

//

export default function SellItemCard({
    market_name,
    quantity,
    icon,
    hexColor,
    priceStr,
    setPriceStr,
    marketPrice,
    minPrice,
    maxPrice,
    bidPrice,
    remove,
}: {
    market_name: string,
    quantity: number,
    icon: string,
    hexColor: string,
    priceStr: string,
    setPriceStr: (val: string) => void,
    marketPrice: number,
    minPrice: number | null,
    maxPrice: number | null,
    bidPrice: number | null,
    remove: () => void,
}) {
    const basePrice = parseFloat(marketPrice.toFixed(2))
    const price = parseFloat(priceStr)
    const modifier = basePrice > 0 && !isNaN(price) ? Math.round((price / basePrice - 1) * 100) : 0
    const sliderValue = Math.max(-20, Math.min(20, modifier))

    function onPriceChange(val: string) {
        if (maxPrice !== null && parseFloat(val) > maxPrice) {
            setPriceStr(maxPrice.toFixed(2))

            return
        }


        // Only digits with at most two decimals, so no negatives or fractions of a cent.
        if (/^\d*\.?\d{0,2}$/.test(val)) {
            setPriceStr(val)
        }
    }


    // Checked on blur rather than per keystroke, so "12" can be typed past "1".
    function onPriceBlur() {
        const lowest = minPrice ?? 0.01

        if (parseFloat(priceStr) < lowest) {
            setPriceStr(lowest.toFixed(2))
        }
    }


    function onSliderChange(value: string) {
        const newPrice = basePrice * (1 + Number(value) / 100)

        setPriceStr(newPrice.toFixed(2))
    }


    return (
        <div
            className="bg-accent rounded-sm mx-2 mt-2 p-2 flex flex-col gap-2"
            style={{ borderLeft: `3px solid #${hexColor}` }}
        >
            <div className="flex items-center gap-3">
                <div
                    style={{ filter: `drop-shadow(0 0 6px #${hexColor}66)` }}
                    className="shrink-0"
                >
                    <Image
                        src={icon}
                        alt={market_name}
                        width={52}
                        height={52}
                        style={{ width: 'auto', height: '52px' }}
                    />
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                    <span
                        className="text-sm font-medium truncate"
                        style={{ color: `#${hexColor}` }}
                    >
                        {market_name}
                    </span>

                    <p className="text-xs opacity-40">
                        Market ${marketPrice.toFixed(2)} · x{quantity}
                    </p>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0 -mt-1">
                    <button
                        onClick={remove}
                        className="text-xs opacity-30 hover:opacity-80 transition-opacity cursor-pointer leading-none -mt-1"
                    >
                        ✕
                    </button>

                    <div className="flex items-center gap-1">
                        <span className="text-xs opacity-50">
                            $
                        </span>

                        <input
                            type="number"
                            min={minPrice ?? 0.01}
                            max={maxPrice ?? undefined}
                            step={0.01}
                            value={priceStr}
                            placeholder="0.00"
                            onChange={e => onPriceChange(e.target.value)}
                            onBlur={onPriceBlur}
                            className="bg-primary rounded-sm w-16 h-7 text-center outline-none border border-gray-600 text-sm"
                        />
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <span className="text-xs opacity-40">
                        Price modifier
                    </span>

                    <span className={`text-xs ${modifierColor(modifier)}`}>
                        {modifierLabel(modifier)}
                    </span>
                </div>

                <input
                    type="range"
                    min={-20}
                    max={20}
                    step={1}
                    value={sliderValue}
                    onChange={e => onSliderChange(e.target.value)}
                    className="w-full accent-special cursor-pointer"
                />

                <div className="flex justify-between text-xs opacity-30">
                    <span>
                        -20%
                    </span>

                    <span>
                        +20%
                    </span>
                </div>

                {bidPrice !== null && (
                    <button
                        onClick={() => setPriceStr(bidPrice.toFixed(2))}
                        className={`h-6 rounded-sm text-xs cursor-pointer transition-colors ${priceStr === bidPrice.toFixed(2) ? 'bg-special' : 'bg-primary opacity-60 hover:opacity-100'}`}
                    >
                        Instant
                    </button>
                )}
            </div>
        </div>
    )
}
