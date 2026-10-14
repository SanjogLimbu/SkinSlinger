"use client"

import { createContext, useContext, useState, useEffect } from "react"
import { BasketItem, getBasket, saveBasket, clearBasket } from "@/lib/basket"

//

type BasketContextType = {
    basket: BasketItem[]
    setBasket: (items: BasketItem[]) => void
    clearBasketState: () => void
}

const BasketContext = createContext<BasketContextType | null>(null)

//

export function BasketProvider({ children }: { children: React.ReactNode }) {
    const [basket, setBasketState] = useState<BasketItem[]>([])

    useEffect(() => {
        setBasketState(getBasket())
    }, [])

    function setBasket(items: BasketItem[]) {
        saveBasket(items)
        setBasketState(items)
    }

    function clearBasketState() {
        clearBasket()
        setBasketState([])
    }

    return (
        <BasketContext.Provider value={{ basket, setBasket, clearBasketState }}>
            {children}
        </BasketContext.Provider>
    )
}

export function useBasket() {
    const ctx = useContext(BasketContext)

    if (!ctx) {
        throw new Error("useBasket must be used within BasketProvider")
    }

    return ctx
}

