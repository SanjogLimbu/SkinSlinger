const SEGMENTS = [
    { label: 'FN', from: 0,    to: 0.07, color: 'rgb(74, 125, 18)' },
    { label: 'MW', from: 0.07, to: 0.15, color: 'rgb(130, 180, 97)' },
    { label: 'FT', from: 0.15, to: 0.38, color: 'rgb(220, 178, 89)' },
    { label: 'WW', from: 0.38, to: 0.45, color: 'rgb(187, 100, 84)' },
    { label: 'BS', from: 0.45, to: 1.00, color: 'rgb(132, 69, 59)' },
] as const

export default function FloatBar({ value, showLabels = true }: { value: number; showLabels?: boolean }) {
    const pct = Math.min(Math.max(value, 0), 1) * 100

    return (
        <div className="w-full flex flex-col gap-1">
            {/* Bar + arrow */}
            <div className="relative pb-2">
                <div className="w-full rounded-sm overflow-hidden" style={{ height: '8px', position: 'relative' }}>
                    {SEGMENTS.map(seg => (
                        <div
                            key={seg.label}
                            style={{
                                position: 'absolute',
                                inset: `0 ${(1 - seg.to) * 100}% 0 ${seg.from * 100}%`,
                                backgroundColor: seg.color,
                            }}
                        />
                    ))}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/caret-up.svg"
                    alt=""
                    width={14}
                    height={10}
                    className="absolute"
                    style={{ bottom: '-4px', left: `calc(${pct}% - 7px)`, filter: 'invert(1)' }}
                />
            </div>
            {showLabels && (
                <p className="text-[10px] text-gray-500 font-mono">
                    {value.toFixed(10).replace(/0+$/, '')}
                </p>
            )}
        </div>
    )
}
