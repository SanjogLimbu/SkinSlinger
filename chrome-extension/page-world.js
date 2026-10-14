// Runs in the page's own JS context (not the isolated content-script world), so it can
// call Steam's own trade-page functions directly instead of guessing at DOM clicks.
window.addEventListener("skinslinger-select-inventory", (event) => {
    const { appid, contextid } = event.detail

    try {
        if (typeof TradePageSelectInventory !== "function" || typeof UserYou === "undefined") {
            throw new Error("TradePageSelectInventory or UserYou not found on this page")
        }

        TradePageSelectInventory(UserYou, appid, String(contextid))

        window.dispatchEvent(new CustomEvent("skinslinger-select-inventory-result", { detail: { ok: true } }))
    } catch (err) {
        window.dispatchEvent(new CustomEvent("skinslinger-select-inventory-result", { detail: { ok: false, error: String(err) } }))
    }
})

// Steam's "Make Offer" button POSTs to /tradeoffer/new/send and gets back
// {"tradeofferid": "..."} on success. Hooking fetch/XHR here (in the page's own world)
// is the only way to see that response, since the send request is fired by Steam's own
// script, not something the isolated content-script world can observe directly.
;(function watchTradeOfferSend() {
    function reportTradeOfferId(text) {
        try {
            const data = JSON.parse(text)
            if (data && data.tradeofferid) {
                window.dispatchEvent(new CustomEvent("skinslinger-trade-offer-sent", { detail: { tradeofferid: String(data.tradeofferid) } }))
            }
        } catch {
            // Not JSON or no tradeofferid — not the response we're looking for.
        }
    }

    const isSendUrl = (url) => typeof url === "string" && url.includes("/tradeoffer/new/send")

    const originalFetch = window.fetch
    window.fetch = function (...args) {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url
        const promise = originalFetch.apply(this, args)
        if (isSendUrl(url)) {
            promise.then((res) => res.clone().text().then(reportTradeOfferId)).catch(() => {})
        }

        return promise
    }

    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__skinslingerIsSend = isSendUrl(url)
        return originalOpen.call(this, method, url, ...rest)
    }

    XMLHttpRequest.prototype.send = function (...args) {
        if (this.__skinslingerIsSend) {
            this.addEventListener("load", () => reportTradeOfferId(this.responseText))
        }

        return originalSend.apply(this, args)
    }
})()
