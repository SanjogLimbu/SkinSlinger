const POLL_ALARM = "pollTradeAcceptance"
const STEAMID64_OFFSET = 76561197960265728n
const DEAD_BANNERS = ["canceled", "cancelled", "declined", "expired", "no longer valid", "unavailable"]

//

function schedulePolling() {
    chrome.alarms.create(POLL_ALARM, { periodInMinutes: 5 })
}


async function sendPendingSales(sendResponse) {
    try {
        const res = await fetch("https://skinslinger.com/api/extension/pending-sales", { credentials: "include" })

        if (!res.ok) {
            throw new Error(`Request failed: ${res.status}`)
        }


        const data = await res.json()

        sendResponse({ ok: true, items: data.items })
    }
    catch (err) {
        sendResponse({ ok: false, error: String(err) })
    }
}


async function reportTradeSent(message) {
    try {
        await fetch("https://skinslinger.com/api/purchase/mark-sent", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ids: message.orderIds,
                tradeofferid: message.tradeofferid,
            }),
        })
    }
    catch (err) {
        console.warn("SkinSlinger helper: failed to report trade sent", err)
    }
}


function isDead(bannerText) {
    return DEAD_BANNERS.some(s => bannerText.includes(s))
}


function findLiveOfferId(offers, partnerAccountId) {
    for (const [offerId, offer] of offers) {
        if (offer.partnerAccountId === partnerAccountId && offer.bannerText === "") {
            return offerId
        }
    }


    return null
}


// Steam's sent-offers page, in the seller's real session, is the source of truth for live offers.
async function verifySentOffers() {
    const res = await fetch("https://skinslinger.com/api/extension/pending-sales", { credentials: "include" })

    if (!res.ok) {
        return
    }


    const { sellerSteamId, items, cancelOfferIds } = await res.json()
    const nothingToCheck = items.length === 0 && cancelOfferIds.length === 0

    if (!sellerSteamId || nothingToCheck) {
        return
    }


    const pageRes = await fetch(
        `https://steamcommunity.com/profiles/${sellerSteamId}/tradeoffers/sent/?l=english`,
        { credentials: "include" }
    )

    if (!pageRes.ok) {
        return
    }


    const html = await pageRes.text()

    // A missing or different g_steamID means this browser can't see the seller's offers.
    const loggedIn = html.match(/g_steamID\s*=\s*"(\d+)"/)

    if (!loggedIn || loggedIn[1] !== sellerSteamId) {
        return
    }


    // Splitting on each offer's id leaves [preamble, id1, chunk1, id2, chunk2, ...].
    const parts = html.split(/id="tradeofferid_(\d+)"/)
    const offers = new Map()

    for (let i = 1; i < parts.length; i += 2) {
        const chunk = parts[i + 1] ?? ""

        // Live offers have no items banner, while dead or pending ones show one.
        const banner = chunk.match(/tradeoffer_items_banner[^>]*>([^<]*)/)
        const partner = chunk.match(/data-miniprofile="(\d+)"/)

        offers.set(parts[i], {
            bannerText: banner ? banner[1].trim().toLowerCase() : "",
            partnerAccountId: partner ? partner[1] : null,
        })
    }


    const updates = []

    for (const item of items) {
        if (item.tradeOfferId) {
            const offer = offers.get(String(item.tradeOfferId))

            // The page only shows recent offers, but a pending order's offer is days old at most.
            if (!offer || isDead(offer.bannerText)) {
                updates.push({ orderId: item.orderId, state: "gone" })
            }
            else if (offer.bannerText.includes("accepted")) {
                updates.push({ orderId: item.orderId, state: "accepted" })
            }
        }
        else {
            // Matches by partner only, which is safe because payout still waits on inventory checks.
            const buyerAccountId = String(BigInt(item.buyerSteamId64) - STEAMID64_OFFSET)
            const liveOfferId = findLiveOfferId(offers, buyerAccountId)

            if (liveOfferId) {
                updates.push({ orderId: item.orderId, state: "active", tradeOfferId: liveOfferId })
            }
        }
    }


    // Offers for orders cancelled on the site are cancelled on Steam too, so they can't be accepted.
    const cancelledOfferIds = []
    const sessionId = html.match(/g_sessionID\s*=\s*"([^"]+)"/)

    for (const offerId of cancelOfferIds) {
        const offer = offers.get(String(offerId))

        if (!offer || isDead(offer.bannerText) || offer.bannerText.includes("accepted")) {
            cancelledOfferIds.push(offerId)

            continue
        }


        if (!sessionId) {
            continue
        }


        try {
            const cancelRes = await fetch(`https://steamcommunity.com/tradeoffer/${offerId}/cancel`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `sessionid=${encodeURIComponent(sessionId[1])}`,
            })

            if (cancelRes.ok) {
                cancelledOfferIds.push(offerId)
            }
        }
        catch (err) {
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

//

chrome.runtime.onInstalled.addListener(schedulePolling)
chrome.runtime.onStartup.addListener(schedulePolling)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "FETCH_PENDING_SALES") {
        sendPendingSales(sendResponse)

        // Keeps the message channel open for the async response.
        return true
    }


    if (message.type === "TRADE_SENT") {
        reportTradeSent(message)

        return false
    }
})

// Lets skinslinger.com detect that the extension is installed.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message?.type === "PING") {
        sendResponse({ ok: true })
    }
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== POLL_ALARM) {
        return
    }


    try {
        await verifySentOffers()
    }
    catch (err) {
        console.warn("SkinSlinger helper: failed to verify sent offers", err)
    }
})
