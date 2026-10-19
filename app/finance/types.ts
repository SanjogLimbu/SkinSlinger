export type WithdrawalFee = {
    rate: number
    volume: number
    next: { minVolume: number; rate: number } | null
}

export type Payment = {
    depositId: string
    payAddress: string
    payAmount: number
}

export type PaymentStatus =
    | "waiting"
    | "confirming"
    | "confirmed"
    | "finished"
    | "failed"
    | "expired"
    | "partially_paid"

export const STATUS_LABELS: Record<PaymentStatus, string> = {
    waiting: "Waiting for payment",
    confirming: "Payment detected, crediting your balance",
    confirmed: "Payment confirmed",
    finished: "Complete",
    failed: "Payment failed",
    expired: "Address expired",
    partially_paid: "Partially paid — please send the full amount",
}
