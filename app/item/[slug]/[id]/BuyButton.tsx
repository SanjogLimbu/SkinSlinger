"use client"

import { useState } from "react"
import { useBasket } from "@/app/components/BasketProvider"
import { signIn, useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

//

export default function BuyButton({
    id,
    marketName,
    price,
    icon,
    hexColor,
    commodity,
    maxQuantity,
}: {
    id: string
    marketName: string
    price: number
    icon: string
    hexColor: string
    commodity: boolean
    maxQuantity: number
}) {
    const { basket, setBasket } = useBasket()
    const { data: session } = useSession()
    const router = useRouter()
    const [quantity, setQuantity] = useState(1)

    const qty = Math.max(1, Math.min(quantity, maxQuantity))
    const total = price * qty
    const showQuantity = commodity && maxQuantity > 1
    const borderStyle = hexColor !== 'b0c3d9' ? { borderTop: `2px solid #${hexColor}` } : {}
    const label = showQuantity ? `BUY ${qty} — $${total.toFixed(2)}` : "BUY NOW"

    function changeQuantity(value: string) {
        const requested = parseInt(value) || 1

        setQuantity(Math.max(1, Math.min(requested, maxQuantity)))
    }


    function handleBuy() {
        if (!session) {
            signIn("steam")

            return
        }


        const alreadyIn = basket.find(b => {
            if (commodity) {
                return b.marketName === marketName && b.commodity
            }


            return b.id === id
        })

        if (alreadyIn) {
            router.push("/basket")

            return
        }


        setBasket([...basket, {
            id,
            marketName,
            price,
            icon,
            hexColor,
            commodity,
            quantity: qty,
            maxQuantity,
        }])
        router.push("/basket")
    }


    return (
        <div className="w-full flex flex-col gap-2">
            {showQuantity && (
                <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-gray-500">
                            Quantity (max {maxQuantity})
                        </label>

                        <input
                            type="number"
                            min={1}
                            max={maxQuantity}
                            value={quantity}
                            onChange={e => changeQuantity(e.target.value)}
                            className="bg-accent rounded-sm h-9 px-3 outline-none border border-gray-600 text-sm w-full"
                        />
                    </div>

                    <div className="flex flex-col gap-1 shrink-0 text-right">
                        <span className="text-xs text-gray-500">Total</span>

                        <span className="text-sm font-medium h-9 flex items-center justify-end">
                            ${total.toFixed(2)}
                        </span>
                    </div>
                </div>
            )}

            <button
                onClick={handleBuy}
                className="w-full h-10 rounded-sm bg-less-special button font-medium"
                style={borderStyle}
            >
                {label}
            </button>
        </div>
    )
}
