"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { useEmailVerification } from "@/app/components/useEmailVerification"
import { Prompt } from "@/app/components/Prompt"

//

type Purchase = {
    id: string
    createdAt: Date
    deliveredAt: Date | null
    tradeOfferSentAt: Date | null
    status: string
    price: number
    marketName: string
    icon: string | null
    hexColor: string | null
    commodity: boolean
    buyerTradeUrl: string | null
    buyerId: string
    sellerId: string
    buyerName: string | null
    sellerName: string | null
    buyerImage: string | null
    sellerImage: string | null
}

type PurchaseGroup = {
    ids: string[]
    createdAt: Date
    deliveredAt: Date | null
    tradeOfferSentAt: Date | null
    marketName: string
    icon: string | null
    hexColor: string | null
    commodity: boolean
    totalPrice: number
    status: string
    buyerTradeUrl: string | null
    buyerId: string
    sellerId: string
    buyerName: string | null
    sellerName: string | null
    buyerImage: string | null
    sellerImage: string | null
}

function groupPurchases(purchases: Purchase[]): PurchaseGroup[] {
    const map = new Map<string, PurchaseGroup>()

    for (const p of purchases) {
        const key = p.commodity
            ? `${p.marketName}|${p.status}|${p.buyerId}|${p.sellerId}`
            : p.id

        const existing = map.get(key)

        if (existing) {
            existing.ids.push(p.id)
            existing.totalPrice += p.price
            existing.tradeOfferSentAt = existing.tradeOfferSentAt ?? p.tradeOfferSentAt
        }
        else {
            map.set(key, {
                ids: [p.id],
                createdAt: p.createdAt,
                deliveredAt: p.deliveredAt,
                tradeOfferSentAt: p.tradeOfferSentAt,
                marketName: p.marketName,
                icon: p.icon,
                hexColor: p.hexColor,
                commodity: p.commodity,
                totalPrice: p.price,
                status: p.status,
                buyerTradeUrl: p.buyerTradeUrl,
                buyerId: p.buyerId,
                sellerId: p.sellerId,
                buyerName: p.buyerName,
                sellerName: p.sellerName,
                buyerImage: p.buyerImage,
                sellerImage: p.sellerImage,
            })
        }
    }


    return [...map.values()]
}

//

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
    pending:   { label: "In progress", className: "bg-yellow-400/10 text-yellow-400" },
    holding:   { label: "Clearing",    className: "bg-blue-400/10 text-blue-400" },
    completed: { label: "Completed",   className: "bg-special/10 text-special" },
    reversed:  { label: "Reversed",    className: "bg-red-400/10 text-red-400" },
    cancelled: { label: "Cancelled",   className: "bg-white/5 text-gray-400" },
}

function statusChip(status: string) {
    return STATUS_CHIP[status] ?? { label: status, className: "bg-white/5 text-gray-400" }
}


function formatDate(d: Date) {
    return new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    })
}

const HOLD_MS = 8 * 24 * 60 * 60 * 1000

//

function CancelModal({ refundMessage, tradeOfferSent, onConfirm, onClose, loading }: {
    refundMessage: string
    tradeOfferSent: boolean
    onConfirm: () => void
    onClose: () => void
    loading: boolean
}) {
    return (
        <Prompt title="Cancel order?" onClose={onClose}>
            <p className="text-sm opacity-60">
                {refundMessage}
            </p>

            <p className="text-sm opacity-60">
                If the trade has already gone through, and has passed the 8 day verification window, it will be detected and marked complete instead.
            </p>

            {tradeOfferSent && (
                <p className="text-sm bg-primary/60 rounded-sm p-3">
                    A Steam trade offer was already sent for this order. The extension will cancel it on Steam automatically.
                </p>
            )}

            <div className="flex gap-3">
                <button
                    onClick={onConfirm}
                    disabled={loading}
                    className="h-9 px-4 rounded-sm bg-negative button flex-1"
                >
                    {loading ? "..." : "Yes, cancel"}
                </button>

                <button
                    onClick={onClose}
                    disabled={loading}
                    className="h-9 px-4 rounded-sm bg-accent button flex-1"
                >
                    Go back
                </button>
            </div>
        </Prompt>
    )
}


function useCancel(ids: string[]) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    async function cancel() {
        setLoading(true)
        setError("")

        for (const id of ids) {
            const res = await fetch(`/api/purchase/${id}/cancel`, { method: "POST" })

            if (!res.ok) {
                const data = await res.json()
                setError(data.error ?? "Something went wrong")
                setLoading(false)

                return false
            }
        }


        router.refresh()
        setLoading(false)

        return true
    }


    return { cancel, loading, error }
}


// Keep in sync with AUTO_CANCEL_MS in app/api/cron/process-purchases.
const AUTO_CANCEL_MS = 3 * 24 * 60 * 60 * 1000

function ExpiryTimer({ createdAt }: { createdAt: Date }) {
    const [msLeft, setMsLeft] = useState<number | null>(null)

    useEffect(() => {
        const expiresAt = new Date(createdAt).getTime() + AUTO_CANCEL_MS
        const calc = () => setMsLeft(expiresAt - Date.now())

        calc()
        const id = setInterval(calc, 1000)

        return () => clearInterval(id)
    }, [createdAt])

    if (msLeft === null) {
        return <span className="font-mono text-gray-300">...</span>
    }


    if (msLeft <= 0) {
        return <span className="font-mono text-gray-300">any moment now</span>
    }


    const d = Math.floor(msLeft / 86400000)
    const h = Math.floor(msLeft / 3600000) % 24
    const m = Math.floor(msLeft / 60000) % 60
    const s = Math.floor(msLeft / 1000) % 60

    let timeLeft = `${m}m ${s.toString().padStart(2, "0")}s`

    if (d > 0) {
        timeLeft = `${d}d ${h}h ${m}m`
    }
    else if (h > 0) {
        timeLeft = `${h}h ${m}m ${s}s`
    }


    return (
        <span className="font-mono text-gray-300">
            {timeLeft}
        </span>
    )
}

//

function Avatar({ image, name }: { image: string | null; name: string }) {
    if (image) {
        return (
            <Image
                src={image}
                alt={name}
                width={36}
                height={36}
                className="rounded-[4px] shrink-0"
            />
        )
    }


    return (
        <span className="w-9 h-9 rounded-[4px] bg-accent flex items-center justify-center text-sm font-semibold shrink-0">
            {name.charAt(0).toUpperCase()}
        </span>
    )
}


function StageTracker({ stages, currentStep, extra }: {
    stages: string[]
    currentStep: number
    extra?: Partial<Record<number, React.ReactNode>>
}) {
    return (
        <ol className="flex flex-col gap-0">
            {stages.map((stage, i) => {
                const done = i < currentStep
                const active = i === currentStep

                let circleColor = "bg-white/5 text-gray-500"
                let labelColor = "text-gray-500"

                if (done) {
                    circleColor = "bg-special"
                    labelColor = "text-gray-400"
                }
                else if (active) {
                    circleColor = "bg-yellow-400/15 text-yellow-400 ring-1 ring-yellow-400/50"
                    labelColor = "text-white font-medium"
                }


                return (
                    <li key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                            <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold
                                ${circleColor}`}
                            >
                                {done ? "✓" : i + 1}

                            </span>

                            {i < stages.length - 1 && (
                                <span className={`w-px flex-1 my-0.5 ${done ? "bg-special/50" : "bg-gray-700/60"}`} />
                            )}
                        </div>

                        <div className="pb-4 pt-0.5 min-w-0 flex-1">
                            <p className={`text-sm ${labelColor}`}>
                                {stage}

                                {active && (
                                    <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse align-middle" />
                                )}
                            </p>

                            {extra?.[i]}
                        </div>
                    </li>
                )
            })}
        </ol>
    )
}


function HoldProgress({ deliveredAt }: { deliveredAt: Date }) {
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30000)

        return () => clearInterval(id)
    }, [])

    const elapsed = now - new Date(deliveredAt).getTime()
    const pct = Math.min(100, Math.max(0, (elapsed / HOLD_MS) * 100))

    return (
        <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden mt-1.5">
            <div
                className="h-full bg-special transition-[width] duration-1000"
                style={{ width: `${pct}%` }}
            />
        </div>
    )
}


function ActiveTradeCard({ group, role }: { group: PurchaseGroup; role: "buyer" | "seller" }) {
    const [confirming, setConfirming] = useState(false)
    const [showHoldInfo, setShowHoldInfo] = useState(false)
    const { cancel, loading, error } = useCancel(group.ids)

    const counterpartyName = role === "buyer"
        ? (group.sellerName ?? "Seller")
        : (group.buyerName ?? "Buyer")
    const counterpartyImage = role === "buyer" ? group.sellerImage : group.buyerImage

    const stages = role === "buyer"
        ? [
            "Payment held in escrow",
            `${counterpartyName} sends a trade offer`,
            "You accept the offer",
            "Waiting out the 8-day clearing hold",
            "Complete",
        ]
        : [
            "Buyer's payment held in escrow",
            `Send a trade offer to ${counterpartyName}`,
            `Wait for ${counterpartyName} to accept the offer`,
            "Waiting out the 8-day clearing hold",
            "Complete",
        ]


    const isHolding = group.status === "holding"

    let currentStep = 1

    if (isHolding) {
        currentStep = 3
    }
    else if (group.tradeOfferSentAt) {
        currentStep = 2
    }


    const releaseText = group.deliveredAt
        ? formatDate(new Date(new Date(group.deliveredAt).getTime() + HOLD_MS))
        : "soon"

    const holdStageIndex = stages.length - 2
    const stageExtra = {
        [holdStageIndex]: (
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setShowHoldInfo(v => !v)}
                        aria-label="Why is there a waiting period?"
                        className="w-4 h-4 rounded-full bg-white/10 text-[10px] text-gray-400 flex items-center justify-center hover:bg-white/20 hover:text-gray-200 transition-colors shrink-0"
                    >
                        i
                    </button>

                    {showHoldInfo && (
                        <p className="text-xs text-gray-500">
                            Steam allows a trade to be reversed for up to 7 days after it&apos;s accepted. We hold {role === "seller" ? "your payout" : "this order"} for 8 days to protect against reversed/scammed trades.
                        </p>
                    )}
                </div>

                {isHolding && group.deliveredAt && (
                    <HoldProgress deliveredAt={group.deliveredAt} />
                )}
            </div>
        ),
    }

    const glow = group.hexColor ? { boxShadow: `0 0 32px #${group.hexColor}1a` } : undefined
    const nameColor = group.hexColor ? { color: `#${group.hexColor}` } : undefined
    const chip = statusChip(group.status)

    return (
        <div className="bg-secondary rounded-sm p-5 flex flex-col gap-3" style={glow}>
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    {group.icon && (
                        <div className="relative shrink-0 w-14 h-14">
                            <Image
                                src={group.icon}
                                alt={group.marketName}
                                fill
                                className="object-contain"
                            />

                            {group.commodity && group.ids.length > 1 && (
                                <span className="absolute -top-1 -right-1 bg-primary text-xs px-1 rounded-sm leading-5">
                                    x{group.ids.length}
                                </span>
                            )}
                        </div>
                    )}

                    <div className="min-w-0">
                        <p className="font-semibold truncate" style={nameColor}>
                            {group.marketName}
                        </p>

                        <p className="text-xs text-gray-500 mt-0.5">
                            {role === "buyer" ? "Buying" : "Selling"} · ordered {formatDate(group.createdAt)}
                        </p>
                    </div>
                </div>

                <div className="text-right shrink-0">
                    <p className="font-semibold text-lg [font-family:var(--font-display)]">
                        ${group.totalPrice.toFixed(2)}
                    </p>

                    <span className={`inline-block text-xs px-2 py-0.5 rounded-sm ${chip.className}`}>
                        {chip.label}
                    </span>
                </div>
            </div>

            {/* Counterparty */}
            <div className="flex items-center gap-3 bg-primary/60 rounded-sm px-3 py-2.5">
                <Avatar image={counterpartyImage} name={counterpartyName} />

                <div className="min-w-0">
                    <p className="text-xs text-gray-500">
                        {role === "buyer" ? "Trading with seller" : "Trading with buyer"}
                    </p>

                    <p className="text-sm font-medium truncate">
                        {counterpartyName}
                    </p>
                </div>
            </div>


            {/* Stage tracker */}
            <StageTracker stages={stages} currentStep={currentStep} extra={stageExtra} />


            {/* Seller action */}
            {role === "seller" && !isHolding && (
                <div className="bg-primary/60 rounded-sm p-3 flex flex-col gap-2">
                    <p className="text-xs text-gray-500 mb-1">
                        Send the trade offer from your Steam account to:
                    </p>

                    {group.buyerTradeUrl ? (
                        <a
                            href={group.buyerTradeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-special text-sm break-all underline underline-offset-2"
                        >
                            {group.buyerTradeUrl}
                        </a>
                    ) : (
                        <p className="text-negative text-sm">
                            The buyer has no trade URL on file: they need to add one before you can send the offer.
                        </p>
                    )}

                    {group.tradeOfferSentAt ? (
                        <p className="text-xs text-special">
                            Trade offer sent. Waiting for the buyer to accept it on Steam.
                        </p>
                    ) : (
                        <p className="text-xs text-gray-500">
                            Sent offers are detected automatically: no need to confirm anything here.
                        </p>
                    )}
                </div>
            )}


            {/* Buyer action */}
            {role === "buyer" && !isHolding && group.tradeOfferSentAt && (
                <div className="bg-primary/60 rounded-sm p-3 flex flex-col gap-2">
                    <p className="text-xs text-gray-500">
                        {counterpartyName} has sent the trade offer.
                    </p>

                    <a
                        href="https://steamcommunity.com/id/me/tradeoffers/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="self-start h-8 px-3 rounded-sm bg-special button text-sm text-white! flex items-center"
                    >
                        View & accept on Steam
                    </a>
                </div>
            )}


            {/* Footer */}
            {isHolding ? (
                <div className="border-t border-gray-700/50 pt-3">
                    <p className="text-xs text-gray-500">
                        {role === "seller" ? (
                            <>Delivered. Funds clear to your balance around <span className="text-gray-300">{releaseText}</span>, once Steam&apos;s trade-reversal window passes.</>
                        ) : (
                            <>Item received. Protection period ends around <span className="text-gray-300">{releaseText}</span>: if the trade is reversed before then, you&apos;re refunded automatically.</>
                        )}
                    </p>
                </div>
            ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-700/50 pt-3">
                    <div className="flex flex-col gap-1">
                        {!group.tradeOfferSentAt && (
                            <p className="text-xs text-gray-500">
                                {role === "seller" ? (
                                    <>Send the trade offer within <ExpiryTimer createdAt={group.createdAt} /> or the order is cancelled and the buyer refunded.</>
                                ) : (
                                    <>Order cancels automatically in <ExpiryTimer createdAt={group.createdAt} /> if the seller doesn&apos;t send the trade offer.</>
                                )}
                            </p>
                        )}
                    </div>

                    {role === "seller" && (
                        <button
                            onClick={() => setConfirming(true)}
                            className="h-8 px-3 rounded-sm bg-negative button text-sm shrink-0"
                        >
                            Cancel order
                        </button>
                    )}
                </div>
            )}

            {error && (
                <p className="text-red-400 text-sm">
                    {error}
                </p>
            )}

            {confirming && (
                <CancelModal
                    refundMessage="The buyer will be refunded to their balance."
                    tradeOfferSent={!!group.tradeOfferSentAt}
                    onConfirm={cancel}
                    onClose={() => setConfirming(false)}
                    loading={loading}
                />
            )}
        </div>
    )
}


function HistoryRow({ group, role }: { group: PurchaseGroup; role: "buyer" | "seller" }) {
    const counterpartyName = role === "buyer"
        ? (group.sellerName ?? "Seller")
        : (group.buyerName ?? "Buyer")
    const direction = role === "buyer" ? `from ${counterpartyName}` : `to ${counterpartyName}`
    const chip = statusChip(group.status)

    return (
        <div className="bg-accent rounded-sm px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
                {group.icon && (
                    <div className="relative shrink-0 w-10 h-10">
                        <Image
                            src={group.icon}
                            alt={group.marketName}
                            fill
                            className="object-contain"
                        />

                        {group.commodity && group.ids.length > 1 && (
                            <span className="absolute -top-1 -right-1 bg-primary text-[10px] px-1 rounded-sm leading-4">
                                x{group.ids.length}
                            </span>
                        )}
                    </div>
                )}

                <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                        {group.marketName}
                    </p>

                    <p className="text-xs text-gray-500 truncate">
                        {direction} · {formatDate(group.createdAt)}
                    </p>
                </div>
            </div>

            <div className="text-right shrink-0">
                <p className="text-sm font-medium">
                    ${group.totalPrice.toFixed(2)}
                </p>

                <span className={`inline-block text-xs px-1.5 py-0.5 rounded-sm ${chip.className}`}>
                    {chip.label}
                </span>
            </div>
        </div>
    )
}

//

function maskEmail(email: string) {
    const [local, domain] = email.split("@")

    if (!domain) {
        return "*".repeat(email.length)
    }


    const maskedLocal = local.length <= 1
        ? "*"
        : local[0] + "*".repeat(local.length - 1)

    return `${maskedLocal}@${domain}`
}


function EmailNotificationCard({ notificationEmail, pendingEmail }: {
    notificationEmail: string | null
    pendingEmail: string | null
}) {
    const [confirmedEmail, setConfirmedEmail] = useState(notificationEmail ?? "")
    const [revealed, setRevealed] = useState(false)

    let initialStep: "idle" | "code" | "done" = "idle"

    if (notificationEmail) {
        initialStep = "done"
    }
    else if (pendingEmail) {
        initialStep = "code"
    }


    const {
        step,
        setStep,
        email,
        setEmail,
        code,
        setCode,
        loading,
        error,
        setError,
        sendCode,
        confirm,
    } = useEmailVerification(
        initialStep,
        notificationEmail ?? pendingEmail ?? "",
        setConfirmedEmail,
    )

    function changeEmail() {
        setStep("idle")
        setEmail(confirmedEmail)
        setCode("")
        setError("")
    }


    return (
        <section className="bg-secondary rounded-sm p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold">
                        Email notifications
                    </h2>

                    <p className="text-xs text-gray-500 mt-0.5">
                        Get an email when you make a sale or need to send a trade offer.
                    </p>
                </div>

                {step === "done" && (
                    <span className="text-xs px-2 py-0.5 rounded-sm bg-special/10 text-special shrink-0">
                        Confirmed
                    </span>
                )}
            </div>

            {step === "done" ? (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/60 rounded-sm px-3 py-2.5">
                    <p className="text-sm break-all">
                        {revealed ? confirmedEmail : maskEmail(confirmedEmail)}
                    </p>

                    <div className="flex gap-2 shrink-0">
                        <button
                            onClick={() => setRevealed(r => !r)}
                            className="h-8 px-3 rounded-sm bg-accent button text-sm"
                        >
                            {revealed ? "Hide" : "Show"}
                        </button>

                        <button
                            onClick={changeEmail}
                            className="h-8 px-3 rounded-sm bg-accent button text-sm"
                        >
                            Change
                        </button>
                    </div>
                </div>
            ) : step === "code" ? (
                <div className="flex flex-col gap-2">
                    <p className="text-sm text-gray-400">
                        Enter the 4-digit code sent to <span className="text-white break-all">{email}</span>.
                    </p>

                    <div className="flex gap-2">
                        <input
                            value={code}
                            onChange={e => setCode(e.target.value)}
                            inputMode="numeric"
                            placeholder="1234"
                            className="bg-primary rounded-sm h-10 px-3 outline-none border border-gray-600 text-sm flex-1 min-w-0 tracking-widest"
                        />

                        <button
                            onClick={confirm}
                            disabled={loading || code.trim().length === 0}
                            className="h-10 px-4 rounded-sm bg-special button text-sm shrink-0"
                        >
                            {loading ? "..." : "Confirm"}
                        </button>
                    </div>

                    <button
                        onClick={sendCode}
                        disabled={loading}
                        className="text-special text-xs underline underline-offset-2 self-start"
                    >
                        Resend code
                    </button>
                </div>
            ) : (
                <div className="flex gap-2">
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="bg-primary rounded-sm h-10 px-3 outline-none border border-gray-600 text-sm flex-1 min-w-0"
                    />

                    <button
                        onClick={sendCode}
                        disabled={loading || email.trim().length === 0}
                        className="h-10 px-4 rounded-sm bg-special button text-sm shrink-0"
                    >
                        {loading ? "..." : "Send code"}
                    </button>
                </div>
            )}

            {error && (
                <p className="text-red-400 text-sm">
                    {error}
                </p>
            )}
        </section>
    )
}

//

const EXTENSION_ID = "mdnnnglffnidgnhkmffegicnohmbnedk"
const EXTENSION_STORE_URL = `https://chromewebstore.google.com/detail/skinslinger-trade-helper/${EXTENSION_ID}`

function useExtensionInstalled() {
    const [installed, setInstalled] = useState<boolean | null>(null)

    useEffect(() => {
        type ChromeRuntime = {
            sendMessage: (id: string, msg: unknown, cb: (res?: { ok?: boolean }) => void) => void
            lastError?: unknown
        }
        type ChromeWindow = { chrome?: { runtime?: ChromeRuntime } }

        const runtime = (window as unknown as ChromeWindow).chrome?.runtime

        if (!runtime?.sendMessage) {
            setInstalled(false)

            return
        }


        const timeout = setTimeout(() => setInstalled(false), 2000)

        try {
            runtime.sendMessage(EXTENSION_ID, { type: "PING" }, (response) => {
                clearTimeout(timeout)

                // Reading lastError silences Chrome's unchecked-error warning.
                void runtime.lastError
                setInstalled(!!response?.ok)
            })
        }
        catch {
            clearTimeout(timeout)
            setInstalled(false)
        }


        return () => clearTimeout(timeout)
    }, [])

    return installed
}


function ExtensionPromptCard() {
    return (
        <section className="bg-secondary rounded-sm p-5 flex flex-col gap-3 ring-1 ring-yellow-400/30">
            <div>
                <h2 className="text-lg font-semibold">
                    Install the trade helper extension
                </h2>

                <p className="text-sm text-gray-400 mt-1">
                    The SkinSlinger Trade Helper extension is required to verify your trades: it detects
                    when you send a trade offer, confirms when the buyer accepts it, and cancels the
                    Steam offer if an order is cancelled. Without it your sales can&apos;t be verified.
                </p>
            </div>

            <a
                href={EXTENSION_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start h-9 px-4 rounded-sm bg-special button text-sm text-white! flex items-center"
            >
                Install from the Chrome Web Store
            </a>
        </section>
    )
}


export default function OrdersClient({ purchases, currentUserId, notificationEmail, pendingEmail }: {
    purchases: Purchase[]
    currentUserId: string
    notificationEmail: string | null
    pendingEmail: string | null
}) {
    const groups = groupPurchases(purchases)

    const withRole = groups.map(g => ({
        group: g,
        role: (g.buyerId === currentUserId ? "buyer" : "seller") as "buyer" | "seller",
    }))


    const active = withRole.filter(({ group }) => group.status === "pending")
    const clearing = withRole.filter(({ group }) => group.status === "holding")
    const history = withRole.filter(({ group }) => {
        return group.status !== "pending" && group.status !== "holding"
    })

    // Only sellers need the extension, since it runs in their Steam session.
    const extensionInstalled = useExtensionInstalled()
    const isSellingActively = active.some(({ role }) => role === "seller")
    const showExtensionPrompt = isSellingActively && extensionInstalled === false

    return (
        <div className="w-full flex-1 min-h-0 flex justify-center pt-40 px-4 md:px-8 overflow-y-auto pb-10">
            <div className="w-full max-w-3xl flex flex-col gap-8 h-fit">
                <h1 className="text-2xl font-bold">
                    Orders
                </h1>

                {showExtensionPrompt && <ExtensionPromptCard />}

                <EmailNotificationCard
                    notificationEmail={notificationEmail}
                    pendingEmail={pendingEmail}
                />

                {/* Active trades */}
                <section className="flex flex-col gap-3">
                    <h2 className="text-lg font-semibold">
                        Active {active.length === 1 ? "trade" : "trades"}

                        {active.length > 0 && (
                            <span className="text-gray-500 font-normal text-sm ml-2">
                                {active.length}
                            </span>
                        )}
                    </h2>

                    {active.length === 0 ? (
                        <div className="bg-secondary rounded-sm p-6 flex flex-col items-start gap-2">
                            <p className="text-sm text-gray-400">
                                No trades in progress.
                            </p>

                            <Link
                                href="/market"
                                className="text-special text-sm underline underline-offset-2"
                            >
                                Browse the market
                            </Link>
                        </div>
                    ) : (
                        active.map(({ group, role }) => (
                            <ActiveTradeCard
                                key={group.ids[0]}
                                group={group}
                                role={role}
                            />
                        ))
                    )}
                </section>


                {/* Clearing */}
                {clearing.length > 0 && (
                    <section className="flex flex-col gap-3">
                        <h2 className="text-lg font-semibold">
                            Clearing

                            <span className="text-gray-500 font-normal text-sm ml-2">
                                {clearing.length}
                            </span>
                        </h2>

                        {clearing.map(({ group, role }) => (
                            <ActiveTradeCard
                                key={group.ids[0]}
                                group={group}
                                role={role}
                            />
                        ))}
                    </section>
                )}


                {/* History */}
                {history.length > 0 && (
                    <section className="flex flex-col gap-3">
                        <h2 className="text-lg font-semibold">
                            History
                        </h2>

                        <div className="flex flex-col gap-2">
                            {history.map(({ group, role }) => (
                                <HistoryRow
                                    key={group.ids[0]}
                                    group={group}
                                    role={role}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    )
}

