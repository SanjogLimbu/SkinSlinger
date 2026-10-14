(function () {
    "use strict"

    const STEAMID64_OFFSET = 76561197960265728n

    function accountIdToSteamId64(accountId) {
        return (BigInt(accountId) + STEAMID64_OFFSET).toString()
    }

    function getPartnerSteamId64() {
        const params = new URLSearchParams(window.location.search)
        const partner = params.get("partner")
        if (!partner) return null
        try {
            return accountIdToSteamId64(partner)
        } catch {
            return null
        }
    }

    function showBanner(text, isError) {
        let banner = document.getElementById("skinslinger-helper-banner")
        if (!banner) {
            banner = document.createElement("div")
            banner.id = "skinslinger-helper-banner"
            banner.style.cssText = [
                "position:fixed", "top:10px", "right:10px", "z-index:999999",
                "padding:10px 16px", "border-radius:6px", "font:14px/1.4 Arial,sans-serif",
                "color:#fff", "box-shadow:0 2px 8px rgba(0,0,0,0.3)", "max-width:320px",
            ].join(";")
            document.body.appendChild(banner)
        }

        banner.style.background = isError ? "#9C4A44" : "#6CA32A"
        banner.textContent = text
    }

    function waitFor(check, timeoutMs, label) {
        return new Promise((resolve, reject) => {
            const start = Date.now()
            const poll = () => {
                const result = check()
                if (result) return resolve(result)
                if (Date.now() - start > timeoutMs) {
                    return reject(new Error(`Timed out waiting for: ${label}`))
                }

                setTimeout(poll, 250)
            }
            poll()
        })
    }

    function dispatchDoubleClick(el) {
        for (const type of ["mousedown", "mouseup", "click", "mousedown", "mouseup", "click", "dblclick"]) {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, detail: 2 }))
        }
    }

    let lastSelectedKey = null

    function selectInventoryTab(appid, contextid) {
        const key = `${appid}_${contextid}`
        if (lastSelectedKey === key) return Promise.resolve()

        return new Promise((resolve, reject) => {
            const onResult = (event) => {
                window.removeEventListener("skinslinger-select-inventory-result", onResult)
                if (event.detail.ok) {
                    lastSelectedKey = key
                    resolve()
                } else {
                    reject(new Error(event.detail.error))
                }
            }

            window.addEventListener("skinslinger-select-inventory-result", onResult)
            window.dispatchEvent(new CustomEvent("skinslinger-select-inventory", { detail: { appid, contextid } }))
        })
    }

    async function addItemToTrade(appid, contextid, assetId) {
        await selectInventoryTab(appid, contextid)

        const el = await waitFor(
            () => document.getElementById(`item${appid}_${contextid}_${assetId}`),
            15000,
            `item element #item${appid}_${contextid}_${assetId} in your inventory`
        )

        dispatchDoubleClick(el)
    }

    let currentMatches = []

    // Steam's send response is only observable in the page's own JS world (see
    // page-world.js), which relays it here via a custom event. Reports the orderIds
    // that were just added to this offer, along with the resulting tradeofferid, so the
    // server can link them for the extension's later acceptance check.
    window.addEventListener("skinslinger-trade-offer-sent", (event) => {
        if (currentMatches.length === 0) return

        chrome.runtime.sendMessage({
            type: "TRADE_SENT",
            orderIds: currentMatches.map(m => m.orderId),
            tradeofferid: event.detail.tradeofferid,
        })
    })

    async function run() {
        const partnerSteamId64 = getPartnerSteamId64()
        if (!partnerSteamId64) return

        const response = await chrome.runtime.sendMessage({ type: "FETCH_PENDING_SALES" })
        if (!response?.ok) {
            console.warn("SkinSlinger helper: couldn't load pending sales", response?.error)
            return
        }

        // Items already sent in an earlier offer (tradeOfferId set) are awaiting the
        // extension's own acceptance check, not another trade offer.
        const matches = response.items.filter(item => item.buyerSteamId64 === partnerSteamId64 && !item.tradeOfferId)
        if (matches.length === 0) return

        currentMatches = matches

        showBanner(`SkinSlinger: adding ${matches.length} item${matches.length > 1 ? "s" : ""} owed to this buyer...`)

        let added = 0
        for (const item of matches) {
            try {
                await addItemToTrade(item.appid, item.contextid, item.assetId)
                added++
            } catch (err) {
                console.warn(`SkinSlinger helper: failed to add ${item.marketName}`, err)
            }
        }

        if (added === matches.length) {
            showBanner(`SkinSlinger: added all ${added} item${added > 1 ? "s" : ""}. Review the offer, then click Make Offer yourself.`)
        } else {
            showBanner(`SkinSlinger: added ${added}/${matches.length} items. Add the rest manually, then click Make Offer.`, true)
        }
    }

    run().catch(err => {
        console.warn("SkinSlinger helper failed", err)
        showBanner("SkinSlinger: couldn't auto-add items, add them manually.", true)
    })
})()
