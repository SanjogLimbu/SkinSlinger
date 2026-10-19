import type { Metadata } from 'next'

//

export const metadata: Metadata = {
    title: 'Trade Helper Extension Privacy Policy',
}

const sections = [
    {
        title: "1. What This Extension Is",
        body: `The SkinSlinger Trade Helper is a Chrome extension published by SkinSlinger ("we", "us", "our"). It helps sellers on skinslinger.com add the items they owe a buyer to a Steam trade offer automatically. You still review and submit the trade offer yourself: the extension never sends a trade offer on its own.`,
    },
    {
        title: "2. Data the Extension Accesses",
        body: `When you open a Steam trade offer page (steamcommunity.com/tradeoffer/new/*), the extension reads the buyer's SteamID from the page URL and calls a single SkinSlinger API endpoint (skinslinger.com/api/extension/pending-sales) using your existing skinslinger.com login session, to retrieve the list of items you currently owe buyers. It reads and interacts with the Steam trade offer page's inventory panel only, to select matching items into the offer.`,
    },
    {
        title: "3. Data We Do Not Collect",
        body: `The extension does not collect, store, or transmit any data to any third party. It does not access your Steam password, payment details, or any page other than the Steam trade offer page and the single SkinSlinger API endpoint listed above. No analytics or tracking is included in the extension.`,
    },
    {
        title: "4. Data Storage",
        body: `The extension does not persist any data locally or remotely beyond the current page session. Nothing is written to browser storage.`,
    },
    {
        title: "5. Contact",
        body: `Questions about this extension or this policy can be sent to support@skinslinger.com.`,
    },
]

//

export default function ExtensionPrivacyPage() {
    return (
        <div className="overflow-y-auto h-full w-full no-scrollbar">
            <div className="w-full max-w-2xl mx-auto px-4 pt-24 pb-20">
                <h1 className="text-3xl font-bold mb-2">
                    Trade Helper Extension Privacy Policy
                </h1>

                <p className="text-gray-500 text-sm mb-10">
                    Last updated: July 2026
                </p>

                <div className="flex flex-col gap-6">
                    {sections.map(({ title, body }) => (
                        <div key={title}>
                            <h2 className="font-semibold text-sm mb-1">
                                {title}
                            </h2>

                            <p className="text-gray-400 text-sm leading-relaxed">
                                {body}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
