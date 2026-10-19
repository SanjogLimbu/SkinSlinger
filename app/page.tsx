import Link from "next/link"
import Image from "next/image"
import type { Metadata } from 'next'
import PlatformComparisonTable from "./components/PlatformComparisonTable"
import { getBaseUrl, JsonLd } from "./lib/site"

//

const games = [
    { label: "CS2 skins", icon: "/cs2.png", href: "/market/cs2" },
    { label: "Dota 2 items", icon: "/dota.png", href: "/market/dota2" },
    { label: "Rust skins", icon: "/rust.png", href: "/market/rust" },
    { label: "TF2 items", icon: "/tf2.png", href: "/market/tf2" },
]

const fees = [
    { label: "Sales Fee", value: "0%", icon: "/percentage.svg" },
    { label: "Deposit Fee", value: "0%", icon: "/deposit.svg" },
    { label: "FX Fee (Crypto)", value: "0%", icon: "/percentage.svg" },
    {
        label: "Withdrawal Fee",
        value: "2.5% → 0.5%",
        icon: "/withdraw.svg",
        tiers: [
            { rate: "2%", threshold: "$100 in sales/purchases" },
            { rate: "1.5%", threshold: "$1,000 in sales/purchases" },
            { rate: "1.0%", threshold: "$5,000 in sales/purchases" },
            { rate: "0.5%", threshold: "$25,000 in sales/purchases" },
        ],
    },
]

const steps = [
    {
        title: "Order an item",
        desc: "You place an order and your payment is held securely by the server. The seller doesn't receive it yet.",
    },
    {
        title: "Seller sends the trade",
        desc: "The seller is notified and sends you a Steam trade offer directly from their account.",
    },
    {
        title: "You accept the trade",
        desc: "Once you accept the trade offer, the item arrives in your inventory instantly.",
    },
    {
        title: "Server verifies the trade",
        desc: "Every 5 minutes, the server checks your Steam inventory to confirm the item was received. If your inventory is private, it will assume the trade was successful",
    },
    {
        title: "Seller gets paid",
        desc: "Once confirmed, the held funds are released to the seller's balance.",
    },
]

const paymentMethods = ["USDC (Polygon Network)"]
const description = 'SkinSlinger is the no KYC skins marketplace for CS2, Dota 2, Rust, and TF2. Buy and sell Steam skins with crypto — 0% sales fee, no identity verification, instant P2P trades.'

export const metadata: Metadata = {
    title: 'No KYC Skins Marketplace - Buy & Sell Steam Skins with Crypto | SkinSlinger',
    description,
    alternates: { canonical: '/' },
    openGraph: {
        title: 'No KYC Skins Marketplace - Buy & Sell Steam Skins with Crypto | SkinSlinger',
        description,
        url: '/',
        images: [
            {
                url: '/logo.png',
                width: 512,
                height: 512,
                alt: 'SkinSlinger',
            },
        ],
    },
    twitter: {
        card: 'summary',
        title: 'No KYC Skins Marketplace - Buy & Sell Steam Skins with Crypto | SkinSlinger',
        description,
        images: ['/logo.png'],
    },
}

const base = getBaseUrl()

const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "SkinSlinger",
    "url": base,
    "potentialAction": {
        "@type": "SearchAction",
        "target": {
            "@type": "EntryPoint",
            "urlTemplate": `${base}/market/cs2?search={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
    },
}

const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "SkinSlinger",
    "url": base,
    "logo": {
        "@type": "ImageObject",
        "url": `${base}/logo.png`,
        "width": 512,
        "height": 512,
    },
    "description": "P2P skins marketplace with 0% sales fee, no KYC, and crypto payments.",
    "address": {
        "@type": "PostalAddress",
        "streetAddress": "Cobham House, 9 Warwick Court",
        "addressLocality": "Midtown",
        "postalCode": "WC1R 5DJ",
        "addressCountry": "GB",
    },
    "contactPoint": {
        "@type": "ContactPoint",
        "email": "support@skinslinger.com",
        "contactType": "customer support",
    },
}

const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
        {
            "@type": "Question",
            "name": "How are the fees so low?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "As we only use crypto, we do not have to worry about using a payment processor. We can use our own custom-made payment processor to cut out the middleman.",
            },
        },
        {
            "@type": "Question",
            "name": "What is a no KYC skins marketplace?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "A no KYC skins marketplace lets you buy and sell Steam skins without providing any identity documents or personal verification. SkinSlinger is a no KYC skins marketplace — you sign up with just a Steam account, no passport, no ID, no selfies required.",
            },
        },
        {
            "@type": "Question",
            "name": "Is KYC required on withdrawals?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "No. SkinSlinger requires no identity verification (KYC) at all — not for sign-up, not for trading, and not for withdrawals.",
            },
        },
        {
            "@type": "Question",
            "name": "How do I pay on SkinSlinger?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "SkinSlinger accepts USDC on the Polygon network. Deposit crypto and use your balance to buy skins instantly.",
            },
        },
        {
            "@type": "Question",
            "name": "What games does SkinSlinger support?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "SkinSlinger supports CS2 (Counter-Strike 2), Dota 2, Rust, and Team Fortress 2.",
            },
        },
        {
            "@type": "Question",
            "name": "Are my skins safe?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. We only ask for your Steam trade URL to check your inventory and trade eligibility. We have no direct access to your inventory or skins. The marketplace is P2P so you trade your skins directly with other players rather than giving it to a bot.",
            },
        },
        {
            "@type": "Question",
            "name": "How long does it take to deposit/withdraw?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "Deposits and withdrawals are automatic and should take less than 5 minutes to detect and confirm.",
            },
        },
        {
            "@type": "Question",
            "name": "How are 'Market' prices determined?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "We look at prices from other market places and average them out. If the item does not exist on other market places, we use prices from the Steam marketplace.",
            },
        },
    ],
}

//

function Hero() {
    return (
        <div className="flex flex-col justify-center items-center gap-8 px-4 pt-24 pb-4">
            <div className="flex flex-col items-center text-center gap-4">
                <Image src="/logo.png" alt="SkinSlinger logo" width={64} height={64} />

                <p className="eyebrow">
                    Steam Skins Marketplace
                </p>

                <div className="flex flex-col items-center gap-3">
                    <h1 className="text-5xl md:text-6xl font-bold tracking-wide uppercase">
                        Skin<span className="text-special">Slinger</span>
                    </h1>

                    <div className="strip w-90 md:w-110"/>
                </div>

                <p className="text-gray-400 text-lg max-w-md">
                    Trade CS2, Dota 2, Rust and TF2 skins directly with other players.
                </p>
            </div>

            <div className="flex gap-3 text-sm flex-wrap justify-center">
                {games.map(({ label, icon, href }) => (
                    <Link
                        key={label}
                        href={href}
                        className="bg-secondary px-3 py-1.5 rounded-sm flex items-center gap-1.5 text-gray-300 button"
                    >
                        <Image src={icon} alt={label} width={16} height={16} />

                        {label}
                    </Link>
                ))}
            </div>
        </div>
    )
}


function Features() {
    return (
        <div className="flex flex-col items-center gap-6 px-4 pt-10">
            <div className="flex flex-col items-center text-center gap-1 mt-2">
                <p className="eyebrow">
                    Fully transparent
                </p>

                <h2 className="font-semibold text-2xl">
                    The lowest fees in the market
                </h2>
            </div>

            <div className="bg-secondary rounded-sm w-full max-w-sm">
                {fees.map(({ label, value, icon, tiers }, i) => {
                    const border = i < fees.length - 1 ? 'border-b border-gray-700/60' : ''

                    return (
                        <div key={label} className={`px-5 py-3 ${border}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Image
                                        src={icon}
                                        alt=""
                                        width={18}
                                        height={18}
                                        className="opacity-60 invert"
                                    />

                                    <span className="text-sm text-gray-400">
                                        {label}
                                    </span>
                                </div>

                                <span className="font-semibold text-special">
                                    {value}
                                </span>
                            </div>

                            {tiers && (
                                <div className="mt-2 ml-7.5 flex flex-col gap-1">
                                    {tiers.map(({ rate, threshold }) => (
                                        <div key={threshold} className="flex items-center justify-between">
                                            <span className="text-xs text-gray-500">
                                                {threshold}
                                            </span>

                                            <span className="text-xs font-medium text-gray-300">
                                                {rate}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="w-full max-w-2xl mt-4">
                <div className="flex flex-col items-center gap-1 mb-5">
                    <p className="eyebrow">
                        Side by side
                    </p>

                    <h2 className="font-semibold text-2xl text-center">
                        How we compare
                    </h2>
                </div>

                <PlatformComparisonTable />
            </div>

            <div className="flex flex-col items-center gap-2 mt-2 mb-3">
                <p className="eyebrow">
                    Supported payment methods
                </p>

                <div className="flex gap-2 flex-wrap justify-center">
                    {paymentMethods.map(method => (
                        <span key={method} className="bg-secondary text-gray-300 text-xs px-3 py-1.5 rounded-sm">
                            {method}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    )
}


function Explanation() {
    return (
        <div className="w-full max-w-lg mx-auto px-4 pt-12 pb-8">
            <div className="flex flex-col items-center gap-1 mb-8">
                <p className="eyebrow">
                    Escrowed P2P trades
                </p>

                <h2 className="text-2xl font-bold text-center">
                    How it works
                </h2>
            </div>

            <div className="flex flex-col">
                {steps.map((step, i) => (
                    <div key={i} className="flex gap-4">
                        <div className="flex flex-col items-center">
                            <span className="w-8 h-8 shrink-0 rounded-sm bg-secondary flex items-center justify-center text-special text-sm font-semibold [font-family:var(--font-display)]">
                                {i + 1}
                            </span>

                            {i < steps.length - 1 && (
                                <span className="w-px flex-1 bg-gray-700/60 my-1" />
                            )}
                        </div>

                        <div className="pb-6">
                            <p className="font-semibold text-sm pt-1.5">
                                {step.title}
                            </p>

                            <p className="text-gray-400 text-sm mt-1">
                                {step.desc}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}


function Faq() {
    return (
        <div className="w-full max-w-lg mx-auto px-4 pb-14">
            <div className="flex flex-col items-center gap-1 mb-8">
                <p className="eyebrow">
                    Good to know
                </p>

                <h2 className="text-2xl font-bold text-center">
                    Frequently asked questions
                </h2>
            </div>

            <div className="flex flex-col gap-3">
                {faq.mainEntity.map((q, i) => (
                    <div key={i} className="info-card">
                        <p className="font-semibold text-sm">
                            {q.name}
                        </p>

                        <p className="text-gray-400 text-sm mt-1">
                            {q.acceptedAnswer.text}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    )
}


function Footer() {
    return (
        <footer className="py-10 px-6 bg-black/20 relative">
            <div
                className="strip absolute top-0 left-0 right-0 opacity-60"
                style={{ height: 2, borderRadius: 0 }}
            />

            <div className="max-w-2xl mx-auto flex flex-col items-center gap-6">
                <div className="flex items-center gap-2">
                    <Image src="/logo.png" alt="SkinSlinger" width={22} height={22} />

                    <span className="text-sm font-semibold text-gray-300 [font-family:var(--font-display)] tracking-wide">
                        SkinSlinger
                    </span>
                </div>

                <div className="flex gap-6">
                    <a
                        href="mailto:support@skinslinger.com"
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                        Support
                    </a>

                    <a
                        href="mailto:management@skinslinger.com"
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                        Business Contact
                    </a>
                </div>

                <p className="text-xs text-gray-600 text-center">
                    Cobham House, 9 Warwick Court, Midtown, WC1R 5DJ
                </p>

                <div className="border-t border-gray-700/40 w-full pt-5 flex flex-col items-center gap-2">
                    <p className="text-xs text-gray-600 text-center max-w-lg">
                        SkinSlinger is not affiliated with, endorsed by, or in any way officially connected with Valve Corporation or Steam. All game names, logos, and trademarks are the property of their respective owners.
                    </p>

                    <p className="text-xs text-gray-700">
                        © {new Date().getFullYear()} SkinSlinger
                    </p>
                </div>
            </div>
        </footer>
    )
}


export default function Home() {
    return (
        <div className="overflow-y-auto h-full w-full no-scrollbar">
            <Hero />

            <Features />

            <Explanation />

            <Faq />

            <Footer />

            <JsonLd data={websiteJsonLd} />

            <JsonLd data={organizationJsonLd} />

            <JsonLd data={faq} />
        </div>
    )
}

