// Runs in the page's own JS world, so it can call Steam's trade-page functions directly.
window.addEventListener("skinslinger-select-inventory", (event) => {
    const { appid, contextid } = event.detail

    const reply = (detail) => {
        window.dispatchEvent(new CustomEvent("skinslinger-select-inventory-result", { detail }))
    }

    try {
        if (typeof TradePageSelectInventory !== "function" || typeof UserYou === "undefined") {
            throw new Error("TradePageSelectInventory or UserYou not found on this page")
        }


        TradePageSelectInventory(UserYou, appid, String(contextid))

        reply({ ok: true })
    }
    catch (err) {
        reply({ ok: false, error: String(err) })
    }
})

// Steam's own script sends the offer, so its response is only visible by hooking fetch and XHR here.
;(function watchTradeOfferSend() {
    function reportTradeOfferId(text) {
        try {
            const data = JSON.parse(text)

            if (data && data.tradeofferid) {
                const detail = { tradeofferid: String(data.tradeofferid) }

                window.dispatchEvent(new CustomEvent("skinslinger-trade-offer-sent", { detail }))
            }
        }
        catch {
            // Other responses aren't JSON with a tradeofferid, so they're ignored.
        }
    }


    async function readTradeOfferId(responsePromise) {
        try {
            const res = await responsePromise
            const text = await res.clone().text()

            reportTradeOfferId(text)
        }
        catch {
            // A failed send has no offer id to report.
        }
    }


    function isSendUrl(url) {
        return typeof url === "string" && url.includes("/tradeoffer/new/send")
    }


    const originalFetch = window.fetch

    window.fetch = function (...args) {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url
        const promise = originalFetch.apply(this, args)

        if (isSendUrl(url)) {
            readTradeOfferId(promise)
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
