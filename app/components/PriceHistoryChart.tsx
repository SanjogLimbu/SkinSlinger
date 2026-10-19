"use client"

import { useState } from "react"
import type { PricePoint } from "@/lib/steam"

//

const LINE_COLOR = "#1f9fca"

const PLOT_HEIGHT = 180

const FULL_DATE: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
}

//

function tickStep(span: number): number {
    const rough = span / 3
    const power = Math.pow(10, Math.floor(Math.log10(rough)))
    const multiple = [1, 2, 5, 10].find(m => m * power >= rough) ?? 10

    return multiple * power
}


function formatPrice(price: number, decimals = 2): string {
    const formatted = price.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })

    return `$${formatted}`
}


// Fixed locale and UTC, so the server and the browser render the same text.
function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
    const day = new Date(`${date}T00:00:00Z`)

    return day.toLocaleDateString("en-US", { ...options, timeZone: "UTC" })
}

//

export default function PriceHistoryChart({ points }: { points: PricePoint[] }) {
    const [active, setActive] = useState<number | null>(null)

    const lastIndex = points.length - 1
    const prices = points.map(point => point.price)
    const low = Math.min(...prices)
    const high = Math.max(...prices)
    const latest = prices[lastIndex]

    const step = tickStep(high - low || high * 0.1)
    const yMin = Math.floor(low / step) * step
    const yMax = Math.max(Math.ceil(high / step) * step, yMin + step)
    const tickCount = Math.round((yMax - yMin) / step) + 1
    const ticks = Array.from({ length: tickCount }, (_, i) => yMin + i * step)

    // Positions are percentages, so the chart stretches to any width.
    const xOf = (index: number) => index / lastIndex * 100
    const yOf = (price: number) => (1 - (price - yMin) / (yMax - yMin)) * 100

    const segments = points.map((point, i) => {
        const command = i === 0 ? "M" : "L"

        return `${command}${xOf(i).toFixed(2)} ${yOf(point.price).toFixed(2)}`
    })
    const line = segments.join(" ")

    const monthStarts: { i: number, date: string }[] = []

    for (let i = 1; i < points.length; i++) {
        const month = points[i].date.slice(0, 7)
        const previousMonth = points[i - 1].date.slice(0, 7)

        if (month !== previousMonth) {
            monthStarts.push({ i, date: points[i].date })
        }
    }


    const shown = active ?? lastIndex
    const firstDate = formatDate(points[0].date, FULL_DATE)
    const plotLabel = `Price history since ${firstDate}: now ${formatPrice(latest)}, low ${formatPrice(low)}, high ${formatPrice(high)}. Use the arrow keys to read each day.`

    function pickFromPointer(e: React.PointerEvent<HTMLDivElement>) {
        const plot = e.currentTarget.getBoundingClientRect()
        const x = (e.clientX - plot.left) / plot.width
        const ratio = Math.min(Math.max(x, 0), 1)

        setActive(Math.round(ratio * lastIndex))
    }


    function pickFromKeyboard(e: React.KeyboardEvent<HTMLDivElement>) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
            return
        }


        e.preventDefault()

        const direction = e.key === "ArrowLeft" ? -1 : 1
        const next = Math.min(Math.max(shown + direction, 0), lastIndex)

        setActive(next)
    }


    return (
        <div className="bg-secondary rounded-sm frame-shadow p-4 md:p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h2 className="text-sm font-semibold text-gray-200">
                        Price history
                    </h2>

                    <p className="text-xs text-gray-500">
                        Daily price across third-party markets. Low {formatPrice(low)}, high {formatPrice(high)}.
                    </p>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-lg leading-none font-semibold">
                        {formatPrice(latest)}
                    </span>

                    <span className="text-xs text-gray-400">
                        as of {formatDate(points[lastIndex].date, { day: "numeric", month: "short" })}
                    </span>
                </div>
            </div>

            <div className="flex gap-2">
                {/* Y axis */}
                <div
                    className="relative w-11 shrink-0 text-[10px] text-gray-500 tabular-nums"
                    style={{ height: PLOT_HEIGHT }}
                >
                    {ticks.map(tick => (
                        <span
                            key={tick}
                            className="absolute right-0 -translate-y-1/2"
                            style={{ top: `${yOf(tick)}%` }}
                        >
                            {formatPrice(tick, step < 1 ? 2 : 0)}
                        </span>
                    ))}
                </div>

                {/* Plot */}
                <div
                    className="relative flex-1 min-w-0 cursor-crosshair touch-pan-y"
                    style={{ height: PLOT_HEIGHT }}
                    role="img"
                    aria-label={plotLabel}
                    tabIndex={0}
                    onPointerDown={pickFromPointer}
                    onPointerMove={pickFromPointer}
                    onPointerLeave={() => setActive(null)}
                    onKeyDown={pickFromKeyboard}
                    onBlur={() => setActive(null)}
                >
                    <svg
                        className="absolute inset-0 w-full h-full"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                    >
                        {ticks.map(tick => (
                            <line
                                key={tick}
                                x1={0}
                                x2={100}
                                y1={yOf(tick)}
                                y2={yOf(tick)}
                                stroke="var(--color-edge)"
                                strokeWidth={1}
                                vectorEffect="non-scaling-stroke"
                            />
                        ))}

                        <path
                            d={`${line} L100 100 L0 100 Z`}
                            fill={LINE_COLOR}
                            opacity={0.1}
                        />

                        <path
                            d={line}
                            fill="none"
                            stroke={LINE_COLOR}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>

                    {active !== null && (
                        <div
                            className="absolute top-0 bottom-0 w-px bg-white/25"
                            style={{ left: `${xOf(active)}%` }}
                        />
                    )}

                    {/* Marker */}
                    <div
                        className="absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2"
                        style={{
                            left: `${xOf(shown)}%`,
                            top: `${yOf(points[shown].price)}%`,
                            backgroundColor: LINE_COLOR,
                            boxShadow: "0 0 0 2px var(--color-secondary)",
                        }}
                    />

                    {active !== null && (
                        <div
                            className="absolute top-0 pointer-events-none bg-primary border border-gray-700 rounded-sm px-2 py-1.5 flex flex-col gap-1 whitespace-nowrap"
                            style={{
                                left: `${xOf(active)}%`,
                                transform: xOf(active) > 60 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
                            }}
                        >
                            <span className="text-sm leading-none font-semibold">
                                {formatPrice(points[active].price)}
                            </span>

                            <span className="text-[10px] leading-none text-gray-400">
                                {formatDate(points[active].date, FULL_DATE)}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* X axis */}
            <div className="relative h-3 ml-13 text-[10px] leading-none text-gray-500">
                {monthStarts.map(({ i, date }) => (
                    <span
                        key={date}
                        className="absolute -translate-x-1/2"
                        style={{ left: `${xOf(i)}%` }}
                    >
                        {formatDate(date, { month: "short" })}
                    </span>
                ))}
            </div>
        </div>
    )
}
