"use client"

import { SessionProvider } from "next-auth/react"
import { BasketProvider } from "./BasketProvider"

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <BasketProvider>
                {children}
            </BasketProvider>
        </SessionProvider>
    )
}
