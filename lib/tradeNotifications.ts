import { Resend } from "resend"
import { TradeCompleteEmail } from "@/app/components/emails/TradeCompleteEmail"
import { ReversalRefundEmail } from "@/app/components/emails/ReversalRefundEmail"
import { TradeOfferSentEmail } from "@/app/components/emails/TradeOfferSentEmail"

//

const resend = new Resend(process.env.RESEND_API)

export type CompletedTrade = {
    marketName: string
    price: number
    buyerEmail: string | null
    sellerEmail: string | null
}

export type ReversedTrade = {
    marketName: string
    price: number
    buyerEmail: string | null
}

// Emails both sides of a completed trade: the buyer (items received) and the
// seller (funds released). Items are grouped per recipient so a stack of
// commodities completed in one pass produces a single email each. Failures are
// swallowed — notifications must never block or roll back the completion itself.
export async function sendTradeCompleteEmails(trades: CompletedTrade[]) {
    const buyerGroups = new Map<string, { marketName: string; price: number }[]>()
    const sellerGroups = new Map<string, { marketName: string; price: number }[]>()

    for (const t of trades) {
        const item = { marketName: t.marketName, price: t.price }
        if (t.buyerEmail) {
            buyerGroups.set(t.buyerEmail, [...(buyerGroups.get(t.buyerEmail) ?? []), item])
        }

        if (t.sellerEmail) {
            sellerGroups.set(t.sellerEmail, [...(sellerGroups.get(t.sellerEmail) ?? []), item])
        }
    }

    const sends: Promise<unknown>[] = []

    for (const [email, items] of buyerGroups) {
        sends.push(resend.emails.send({
            from: "SkinSlinger <onboarding@skinslinger.com>",
            to: [email],
            subject: items.length > 1 ? "Your items have arrived" : "Your item has arrived",
            react: TradeCompleteEmail({ role: "buyer", items }),
        }))
    }

    for (const [email, items] of sellerGroups) {
        sends.push(resend.emails.send({
            from: "SkinSlinger <onboarding@skinslinger.com>",
            to: [email],
            subject: "Funds released to your balance",
            react: TradeCompleteEmail({ role: "seller", items }),
        }))
    }

    await Promise.allSettled(sends)
}

// Notifies a buyer that the seller has marked a trade offer as sent: self-reported by
// the seller, purely informational (doesn't affect payout/escrow, which only advances on
// the actual Steam inventory check).
export async function sendTradeOfferSentEmail(buyerEmail: string, sellerName: string, items: { marketName: string; price: number }[]) {
    await resend.emails.send({
        from: "SkinSlinger <onboarding@skinslinger.com>",
        to: [buyerEmail],
        subject: items.length > 1 ? "Action needed: accept your trade offers" : "Action needed: accept your trade offer",
        react: TradeOfferSentEmail({ sellerName, items }),
    }).catch(() => {})
}

// Notifies buyers that a delivered trade was reversed and they've been refunded.
export async function sendReversalRefundEmails(trades: ReversedTrade[]) {
    const buyerGroups = new Map<string, { marketName: string; price: number }[]>()

    for (const t of trades) {
        if (!t.buyerEmail) continue
        buyerGroups.set(t.buyerEmail, [...(buyerGroups.get(t.buyerEmail) ?? []), { marketName: t.marketName, price: t.price }])
    }

    const sends: Promise<unknown>[] = []

    for (const [email, items] of buyerGroups) {
        sends.push(resend.emails.send({
            from: "SkinSlinger <onboarding@skinslinger.com>",
            to: [email],
            subject: "Trade reversed — you've been refunded",
            react: ReversalRefundEmail({ items }),
        }))
    }

    await Promise.allSettled(sends)
}
