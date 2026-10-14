const POLL_ALARM = "pollTradeAcceptance"

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create(POLL_ALARM, { periodInMinutes: 5 }))
chrome.runtime.onStartup.addListener(() => chrome.alarms.create(POLL_ALARM, { periodInMinutes: 5 }))

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "FETCH_PENDING_SALES") {
        fetch("https://skinslinger.com/api/extension/pending-sales", { credentials: "include" })
            .then(res => {
                if (!res.ok) {
                    throw new Error(`Request failed: ${res.status}`)
                }

                return res.json()
            })
            .then(data => sendResponse({ ok: true, items: data.items }))
            .catch(err => sendResponse({ ok: false, error: String(err) }))

        return true // keep the message channel open for the async response
    }

    if (message.type === "TRADE_SENT") {
        fetch("https://skinslinger.com/api/purchase/mark-sent", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: message.orderIds, tradeofferid: message.tradeofferid }),
        }).catch(err => console.warn("SkinSlinger helper: failed to report trade sent", err))

        return false
    }
})

// Lets skinslinger.com detect that the extension is installed (see
// externally_connectable in the manifest).
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message?.type === "PING") {
        sendResponse({ ok: true })
    }
})

const STEAMID64_OFFSET = 76561197960265728n

// Steam's own sent-offers page, fetched in the seller's real session, is the source of
// truth for whether an offer was actually sent and is still live. Parsing it verifies
// the self-reported "trade sent" flag: offers sent outside this browser (Steam client,
// phone) get picked up, and offers the seller cancelled after reporting get rolled back.
async function verifySentOffers() {
    const res = await fetch("https://skinslinger.com/api/extension/pending-sales", { credentials: "include" })
    if (!res.ok) return

    const { sellerSteamId, items, cancelOfferIds } = await res.json()
    if (!sellerSteamId || (items.length === 0 && cancelOfferIds.length === 0)) {
        return
    }

    const pageRes = await fetch(
        `https://steamcommunity.com/profiles/${sellerSteamId}/tradeoffers/sent/?l=english`,
        { credentials: "include" }
    )
    if (!pageRes.ok) return

    const html = await pageRes.text()

    // Every logged-in Steam page sets g_steamID. If it's missing or belongs to a
    // different account, this browser can't see the seller's offers: bail rather than
    // wrongly report offers as gone.
    const loggedIn = html.match(/g_steamID\s*=\s*"(\d+)"/)
    if (!loggedIn || loggedIn[1] !== sellerSteamId) return

    // The page lists offers as <div class="tradeoffer" id="tradeofferid_NNN">...</div>.
    // Splitting on the id leaves [preamble, id1, chunk1, id2, chunk2, ...].
    const parts = html.split(/id="tradeofferid_(\d+)"/)
    const offers = new Map()

    for (let i = 1; i < parts.length; i += 2) {
        const chunk = parts[i + 1] ?? ""
        // Active offers have no items banner; dead/limbo ones show one ("Trade Offer
        // Canceled.", "Awaiting Mobile Confirmation", ...).
        const banner = chunk.match(/tradeoffer_items_banner[^>]*>([^<]*)/)
        const partner = chunk.match(/data-miniprofile="(\d+)"/)

        offers.set(parts[i], {
            bannerText: banner ? banner[1].trim().toLowerCase() : "",
            partnerAccountId: partner ? partner[1] : null,
        })
    }

    const isDead = (bannerText) =>
        ["canceled", "cancelled", "declined", "expired", "no longer valid", "unavailable"].some(s => bannerText.includes(s))

    const updates = []

    for (const item of items) {
        if (item.tradeOfferId) {
            const offer = offers.get(String(item.tradeOfferId))

            // Note: the sent-offers page only shows recent offers: but a pending order's
            // offer is at most days old, so absence means it was deleted/never existed.
            if (!offer || isDead(offer.bannerText)) {
                updates.push({ orderId: item.orderId, state: "gone" })
            } else if (offer.bannerText.includes("accepted")) {
                // The buyer accepted this exact offer: delivery confirmed straight from
                // Steam, no need to wait for an inventory diff.
                updates.push({ orderId: item.orderId, state: "accepted" })
            }
        } else {
            // Order not yet marked sent: look for a live offer (no status banner) to
            // this buyer, which catches offers sent from the Steam client or another
            // browser. Matched by partner only (the page doesn't expose asset ids), so an
            // unrelated offer to the same buyer could match; the escrow inventory checks
            // still gate payout. Banner'd offers (accepted/canceled/old) are ignored here
            // since they may predate the order entirely.
            const buyerAccountId = String(BigInt(item.buyerSteamId64) - STEAMID64_OFFSET)
            const match = [...offers.entries()].find(([, o]) => o.partnerAccountId === buyerAccountId && o.bannerText === "")

            if (match) {
                updates.push({ orderId: item.orderId, state: "active", tradeOfferId: match[0] })
            }
        }
    }

    // Offers whose orders were cancelled on the site: cancel them on Steam too, so the
    // buyer can't accept an offer that's already been refunded. Cancelling needs the
    // session id, which Steam embeds in every logged-in page (g_sessionID).
    const cancelledOfferIds = []
    const sessionId = html.match(/g_sessionID\s*=\s*"([^"]+)"/)

    for (const offerId of cancelOfferIds) {
        const offer = offers.get(String(offerId))

        // Already dead, accepted, or long gone from the page: nothing left to cancel.
        if (!offer || isDead(offer.bannerText) || offer.bannerText.includes("accepted")) {
            cancelledOfferIds.push(offerId)
            continue
        }

        if (!sessionId) continue

        try {
            const cancelRes = await fetch(`https://steamcommunity.com/tradeoffer/${offerId}/cancel`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `sessionid=${encodeURIComponent(sessionId[1])}`,
            })

            if (cancelRes.ok) cancelledOfferIds.push(offerId)
        } catch (err) {
            console.warn(`SkinSlinger helper: failed to cancel offer ${offerId} on Steam`, err)
        }
    }

    if (updates.length === 0 && cancelledOfferIds.length === 0) {
        return
    }

    await fetch("https://skinslinger.com/api/extension/offer-status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates, cancelledOfferIds }),
    })
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) {
        verifySentOffers().catch(err => console.warn("SkinSlinger helper: failed to verify sent offers", err))
    }
})
