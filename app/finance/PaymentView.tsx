import { QRCodeSVG } from 'qrcode.react'
import type { Payment, PaymentStatus } from './types'
import { STATUS_LABELS } from './types'
import { CheckIcon, CopyIcon, Notice, PageHeader } from './ui'

//

type PaymentViewProps = {
    payment: Payment
    paymentStatus: PaymentStatus
    secondsLeft: number
    copied: "address" | "amount" | null
    onCopy: (text: string, type: "address" | "amount") => void
    onRetry: () => void
    onBack: () => void
}

type FieldProps = {
    label: string
    value: string
    mono?: boolean
    copied?: boolean
    onCopy?: () => void
}

//

function Field({ label, value, mono, copied, onCopy }: FieldProps) {
    const icon = copied
        ? <CheckIcon className="w-4 h-4 text-special" />
        : <CopyIcon className="w-4 h-4 text-gray-300" />

    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-400">
                {label}
            </span>

            <div className="flex items-center gap-3 bg-primary rounded-sm pl-3 pr-1.5 py-1.5 min-h-11">
                <span className={`flex-1 min-w-0 ${mono ? "text-[13px] font-mono break-all" : "text-sm font-medium"}`}>
                    {value}
                </span>

                {onCopy && (
                    <button
                        type="button"
                        onClick={onCopy}
                        aria-label={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
                        title={copied ? "Copied" : "Copy"}
                        className="shrink-0 w-8 h-8 rounded-sm bg-accent hover:bg-less-special flex items-center justify-center transition-colors cursor-pointer"
                    >
                        {icon}
                    </button>
                )}
            </div>
        </div>
    )
}

//

export default function PaymentView({
    payment,
    paymentStatus,
    secondsLeft,
    copied,
    onCopy,
    onRetry,
    onBack,
}: PaymentViewProps) {
    const isTerminal = paymentStatus === "failed" || paymentStatus === "expired"
    const isDetected = paymentStatus === "confirming" || paymentStatus === "confirmed"
    const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0")
    const seconds = String(secondsLeft % 60).padStart(2, "0")
    const timeLeft = `${minutes}:${seconds}`
    const dot = isDetected ? "bg-special" : "bg-yellow-400 animate-pulse"

    const terminalMessage = paymentStatus === "expired"
        ? "This deposit address has expired"
        : "Something went wrong"

    return (
        <div className="w-full max-w-md flex flex-col gap-4">
            <PageHeader
                eyebrow="Deposit"
                title={`Send ${payment.payAmount} USDC`}
                onBack={onBack}
            />

            <div className="bg-secondary rounded-sm frame-shadow p-5 flex flex-col gap-5">
                {!isTerminal && (
                    <div className="flex items-center justify-between gap-3 bg-primary rounded-sm px-3 py-2.5">
                        <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />

                            <span className="text-sm">
                                {STATUS_LABELS[paymentStatus]}
                            </span>
                        </span>

                        {!isDetected && (
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                                Expires in

                                <span className={`font-mono ${secondsLeft < 60 ? "text-negative" : "text-gray-200"}`}>
                                    {timeLeft}
                                </span>
                            </span>
                        )}
                    </div>
                )}

                {isTerminal ? (
                    <>
                        <div className="flex flex-col items-center text-center gap-1 py-2">
                            <p className="font-semibold">
                                {terminalMessage}
                            </p>

                            <p className="text-sm text-gray-400">
                                If you already sent USDC to it, it will still be credited to your balance automatically.
                            </p>
                        </div>

                        <button
                            onClick={onRetry}
                            className="bg-special button h-11 rounded-sm w-full"
                        >
                            Start a new deposit
                        </button>
                    </>
                ) : (
                    <>
                        <div className="flex justify-center">
                            <div className="bg-white p-3 rounded-sm">
                                <QRCodeSVG
                                    value={payment.payAddress}
                                    size={168}
                                    level="H"
                                    imageSettings={{
                                        src: "/usdc.png",
                                        width: 32,
                                        height: 32,
                                        excavate: true,
                                    }}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <Field
                                label="Amount"
                                value={`${payment.payAmount} USDC`}
                                copied={copied === "amount"}
                                onCopy={() => onCopy(String(payment.payAmount), "amount")}
                            />

                            <Field
                                label="Deposit address"
                                value={payment.payAddress}
                                mono
                                copied={copied === "address"}
                                onCopy={() => onCopy(payment.payAddress, "address")}
                            />

                            <Field
                                label="Network"
                                value="Polygon (PoS)"
                            />
                        </div>

                        <Notice>
                            Send only USDC on the Polygon network. Other tokens, or USDC sent on another network, can&apos;t be recovered.
                        </Notice>

                        <p className="text-xs text-gray-500 text-center">
                            Your balance is credited automatically once the payment arrives, usually within 5 minutes. You can safely leave this page.
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
