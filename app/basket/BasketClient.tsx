"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import Image from "next/image"
import { useBasket } from "@/app/components/BasketProvider"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import SteamUrlPrompt from "@/app/components/SteamUrlPrompt"
import { Prompt } from "@/app/components/Prompt"

//

export default function BasketClient({ hasPendingPurchase }: { hasPendingPurchase: boolean }) {
    const { data: session } = useSession()
    const { basket, setBasket, clearBasketState } = useBasket()
    const [checking, setChecking] = useState(false)
    const [error, setError] = useState("")
    const [inventoryPrompt, setInventoryPrompt] = useState(false)
    const [linkPrompt, setLinkPrompt] = useState(false)
    const router = useRouter()

    useEffect(() => {
        if (session === null) router.push("/")
    }, [session, router])


    function remove(id: string) {
        setBasket(basket.filter(item => item.id !== id))
    }


    async function checkout() {
        setChecking(true)
        setError("")

        const res = await fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                items: basket.map(i => ({
                    id: i.id,
                    marketName: i.marketName,
                    commodity: i.commodity,
                    quantity: i.quantity,
                    expectedPrice: i.price,
                })),
            }),
        })


        const data = await res.json()

        if (res.ok) {
            clearBasketState()
        } else if (data.error?.includes("link your Steam")) {
            setLinkPrompt(true)
        } else if (data.error?.includes("inventory")) {
            setInventoryPrompt(true)
        } else {
            setError(data.error ?? "Checkout failed")
        }


        setChecking(false)
    }


    const total = basket.reduce((sum, item) => sum + item.price * item.quantity, 0)


    const cash = session?.user?.cash ?? 0
    const canAfford = cash >= total && basket.length > 0
    const canCheckout = canAfford && !checking && !hasPendingPurchase

    return (
        <div className="w-full h-full flex justify-center items-center">
            {linkPrompt && (
                <SteamUrlPrompt
                    onLinked={() => { setLinkPrompt(false); router.refresh(); checkout(); }}
                    onClose={() => setLinkPrompt(false)}
                />
            )}
            {inventoryPrompt && (
                <Prompt title="Inventory must be public" onClose={() => setInventoryPrompt(false)}>
                    <p className="opacity-60 text-sm">Your Steam inventory must be set to public before making purchases.</p>
                    {session?.user?.steam_id && (
                        <a
                            href={`https://steamcommunity.com/profiles/${session.user.steam_id}/edit/settings/`}
                            target="_blank"
                            className="text-special text-sm"
                        >
                            Open Steam privacy settings
                        </a>
                    )}
                    <button onClick={() => setInventoryPrompt(false)} className="h-9 px-4 rounded-sm bg-accent button w-fit">Dismiss</button>
                </Prompt>
            )}
            <div className="flex mt-14 w-310 h-210 gap-3">
                {/* Item list */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-secondary">
                    {basket.length === 0 ? (
                        <p className="opacity-50 text-center mt-10">Your basket is empty</p>
                    ) : (
                        basket.map(item => (
                            <div key={item.id} className="bg-accent flex items-center gap-4 p-3 rounded-sm">
                                <div style={{ filter: `drop-shadow(0 0 6px #${item.hexColor}99)` }}>
                                    <Image src={item.icon} alt="" width={60} height={60} style={{ width: 'auto', height: '60px' }} />
                                </div>

                                <div className="flex-1">
                                    <p style={{ color: `#${item.hexColor}` }}>
                                        {item.marketName}
                                    </p>

                                    <p className="text-sm opacity-60">
                                        ${item.price.toFixed(2)} each
                                    </p>
                                </div>

                                {item.quantity > 1 && (
                                    <span className="opacity-60 text-sm">
                                        x{item.quantity}
                                    </span>
                                )}

                                <p className="w-16 text-right">
                                    ${(item.price * item.quantity).toFixed(2)}
                                </p>

                                <button onClick={() => remove(item.id)} className="bg-negative button w-20 h-12 text-sm rounded-sm">
                                    REMOVE
                                </button>
                            </div>
                        ))
                    )}
                </div>


                {/* Summary panel */}
                <div className="w-60 bg-secondary flex flex-col p-6 gap-4 shrink-0">
                    <p className="text-2xl">Summary</p>
                    <div className="border-t border-white/10" />

                    <div className="flex justify-between">
                        <p className="opacity-60">Items</p>

                        <p>
                            {basket.reduce((sum, i) => sum + i.quantity, 0)}
                        </p>
                    </div>

                    <div className="flex justify-between">
                        <p className="opacity-60">Total</p>

                        <p>
                            ${total.toFixed(2)}
                        </p>
                    </div>

                    <div className="flex justify-between">
                        <p className="opacity-60">Fees</p>

                        <p className="text-special">0%</p>
                    </div>

                    <div className="border-t border-white/10" />

                    <div className="flex justify-between">
                        <p className="opacity-60">Your Balance</p>
                        <p>${cash.toFixed(2)}</p>
                    </div>

                    <div className="flex justify-between">
                        <p className="opacity-60">After Purchase</p>
                        <p className={cash - total < 0 ? "text-red-500" : ""}>${(cash - total).toFixed(2)}</p>
                    </div>

                    {!canAfford && basket.length > 0 && (
                        <p className="text-red-500 text-sm">Insufficient balance</p>
                    )}

                    {hasPendingPurchase && (
                        <p className="text-yellow-400 text-sm">You have an active order. Complete or cancel it before checking out.</p>
                    )}

                    {error && <p className="text-red-500 text-sm">{error}</p>}

                    <button
                        onClick={checkout}
                        disabled={!canCheckout}
                        className={`mt-auto w-full h-10 rounded-sm ${canCheckout ? "bg-special button" : "bg-accent opacity-50"}`}
                    >
                        {checking ? "PROCESSING..." : "CHECKOUT"}
                    </button>
                </div>
            </div>
        </div>
    )
}
