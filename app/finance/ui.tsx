type IconProps = { className?: string }

//

function Icon({ className, children }: IconProps & { children: React.ReactNode }) {
    // Global `* { color: white }` overrides currentColor, so the paths inherit from the svg.
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`[&_*]:text-inherit ${className ?? ""}`}
        >
            {children}
        </svg>
    )
}


export const ChevronLeftIcon = ({ className }: IconProps) => (
    <Icon className={className}>
        <path d="m15 18-6-6 6-6" />
    </Icon>
)


export const ArrowDownIcon = ({ className }: IconProps) => (
    <Icon className={className}>
        <path d="M12 5v14" />

        <path d="m19 12-7 7-7-7" />
    </Icon>
)


export const ArrowUpIcon = ({ className }: IconProps) => (
    <Icon className={className}>
        <path d="M12 19V5" />

        <path d="m5 12 7-7 7 7" />
    </Icon>
)


export const CheckIcon = ({ className }: IconProps) => (
    <Icon className={className}>
        <path d="M20 6 9 17l-5-5" />
    </Icon>
)


export const CopyIcon = ({ className }: IconProps) => (
    <Icon className={className}>
        <rect width="14" height="14" x="8" y="8" rx="2" />

        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Icon>
)


export const InfoIcon = ({ className }: IconProps) => (
    <Icon className={className}>
        <circle cx="12" cy="12" r="10" />

        <path d="M12 8v4" />

        <path d="M12 16h.01" />
    </Icon>
)


export const ExternalIcon = ({ className }: IconProps) => (
    <Icon className={className}>
        <path d="M15 3h6v6" />

        <path d="M10 14 21 3" />

        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Icon>
)

//

export function PageHeader({ eyebrow, title, onBack }: {
    eyebrow: string
    title: string
    onBack?: () => void
}) {
    return (
        <div className="flex flex-col gap-3">
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="self-start flex items-center gap-1 -ml-1 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                    <ChevronLeftIcon className="w-4 h-4 text-inherit" />
                    Wallet
                </button>
            )}

            <div className="flex flex-col gap-1">
                <p className="eyebrow">
                    {eyebrow}
                </p>

                <h1 className="text-2xl font-bold">
                    {title}
                </h1>
            </div>
        </div>
    )
}


export function DetailRow({ label, value, strong }: {
    label: string
    value: string
    strong?: boolean
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-400">
                {label}
            </span>

            <span className={`text-sm text-right ${strong ? "font-semibold" : "text-gray-200"}`}>
                {value}
            </span>
        </div>
    )
}


export function Notice({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex gap-2.5 rounded-sm bg-yellow-400/5 ring-1 ring-yellow-400/20 px-3 py-2.5">
            <InfoIcon className="w-4 h-4 mt-px shrink-0 text-yellow-400" />

            <p className="text-xs leading-relaxed text-gray-300">
                {children}
            </p>
        </div>
    )
}


export function AmountInput({ id, value, onChange }: {
    id: string
    value: string
    onChange: (v: string) => void
}) {
    return (
        <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-gray-500">
                $
            </span>

            <input
                id={id}
                type="number"
                inputMode="decimal"
                min="1"
                step="0.01"
                placeholder="0.00"
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full h-14 pl-9 pr-4 bg-primary rounded-sm border border-gray-700 focus:border-special-fill outline-none text-2xl font-semibold"
                required
                autoFocus
            />
        </div>
    )
}
