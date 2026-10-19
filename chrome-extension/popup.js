const statusEl = document.getElementById("status")
const listEl = document.getElementById("list")

//

chrome.runtime.sendMessage({ type: "FETCH_PENDING_SALES" }, (response) => {
    if (!response?.ok) {
        statusEl.textContent = "Couldn't load pending sales. Are you logged into skinslinger.com?"

        return
    }


    const items = response.items

    if (items.length === 0) {
        statusEl.textContent = "No pending sales right now."

        return
    }


    const itemWord = items.length > 1 ? "items" : "item"

    statusEl.textContent = `You owe ${items.length} ${itemWord}. Open the buyer's trade offer page to auto-add them.`

    for (const item of items) {
        const li = document.createElement("li")
        li.textContent = item.marketName
        listEl.appendChild(li)
    }
})
