import { Resend } from "resend"
import { TradeCompleteEmail } from "@/app/components/emails/TradeCompleteEmail"
import { ReversalRefundEmail } from "@/app/components/emails/ReversalRefundEmail"
import { TradeOfferSentEmail } from "@/app/components/emails/TradeOfferSentEmail"

//

const resend = new Resend(process.env.RESEND_API)

type EmailItem = { marketName: string; price: number }

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

//

function addToGroup(groups: Map<string, EmailItem[]>, email: string, item: EmailItem) {
    const items = groups.get(email) ?? []

    items.push(item)
    groups.set(email, items)
}

//

// Failures are ignored, so they can't roll back the trade.
export async function sendTradeCompleteEmails(trades: CompletedTrade[]) {
    const buyerGroups = new Map<string, EmailItem[]>()
    const sellerGroups = new Map<string, EmailItem[]>()

    for (const t of trades) {
        const item = { marketName: t.marketName, price: t.price }

        if (t.buyerEmail) {
            addToGroup(buyerGroups, t.buyerEmail, item)
        }


        if (t.sellerEmail) {
            addToGroup(sellerGroups, t.sellerEmail, item)
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


export async function sendTradeOfferSentEmail(
    buyerEmail: string,
    sellerName: string,
    items: EmailItem[],
) {
    const subject = items.length > 1
        ? "Action needed: accept your trade offers"
        : "Action needed: accept your trade offer"

    try {
        await resend.emails.send({
            from: "SkinSlinger <onboarding@skinslinger.com>",
            to: [buyerEmail],
            subject,
            react: TradeOfferSentEmail({ sellerName, items }),
        })
    }
    catch {
        // Email failures are ignored, so they can't block the trade.
    }
}


export async function sendReversalRefundEmails(trades: ReversedTrade[]) {
    const buyerGroups = new Map<string, EmailItem[]>()

    for (const t of trades) {
        if (!t.buyerEmail) {
            continue
        }


        addToGroup(buyerGroups, t.buyerEmail, { marketName: t.marketName, price: t.price })
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
