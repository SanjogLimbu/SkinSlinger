"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useBasket } from './BasketProvider'
import { signIn, signOut } from 'next-auth/react'

//

export default function TopNav() {
    const { data: session, status } = useSession()
    const { basket } = useBasket()
    const [menuOpen, setMenuOpen] = useState(false)
    const [pendingOrderCount, setPendingOrderCount] = useState(0)

    // The logo box matches the market's wider left panel
    const isMarket = usePathname().startsWith("/market")

    let basketCount = 0

    for (let i = 0; i < basket.length; i++) {
        const item = basket[i]

        if ("quantity" in item) {
            basketCount += item.quantity
        } else {
            basketCount += 1
        }
    }

    useEffect(() => {
        if (!session?.user?.id || !session.user.steam_trade_url) {
            setPendingOrderCount(0)
            return
        }

        let cancelled = false

        fetch("/api/orders/pending")
            .then(res => res.json())
            .then(data => { if (!cancelled) setPendingOrderCount(data.count ?? 0); })
            .catch(() => {})

        return () => { cancelled = true; }
    }, [session?.user?.id, session?.user?.steam_trade_url])


    // Shared by the desktop bar and the mobile dropdown
    const pageLinks = (className: string) => (
        <>
            <Link href="/listings" className={className} onClick={() => setMenuOpen(false)}>
                Listings
            </Link>

            {session?.user.steam_trade_url && (
                <Link
                    href="/orders"
                    className={`${className} ${pendingOrderCount > 0 ? "bg-special text-white!" : ""}`}
                    onClick={() => setMenuOpen(false)}
                >
                    {pendingOrderCount > 0 ? `Orders (${pendingOrderCount})` : "Orders"}
                </Link>
            )}

            <Link href="/inventory" className={className} onClick={() => setMenuOpen(false)}>
                Inventory
            </Link>
        </>
    )


    return (
        <>
            <nav className="fixed top-2 h-14 w-[95%] left-[2.5%] z-50 flex">
                <div className={`w-43 ${isMarket ? "2xl:w-64" : ""} h-full flex justify-center items-center border border-gray-800 rounded-sm shrink-0 frame-shadow`}>
                    <Link href="/">
                        <p className="transition-all cursor-pointer text-xl font-bold tracking-wide [font-family:var(--font-display)] group">
                            Skin<span className="text-special">Slinger</span>
                        </p>
                    </Link>
                </div>


                {/* Nav bar */}
                <div className="flex-1 h-full flex justify-end md:justify-between items-center border border-gray-800 ml-3 rounded-sm px-3 frame-shadow">
                    <div className="hidden md:flex h-full items-center gap-3">
                        <Link href="/market" className="right-nav-link button">
                            Market
                        </Link>
                    </div>

                    <div className="flex h-full items-center gap-3">
                        {status !== "loading" && (session ? (
                            <>
                                <Link href="/finance" className="h-full flex items-center">
                                    <button className="h-8 px-3 text-sm md:h-[80%] md:w-20 md:px-0 md:text-base flex items-center justify-center bg-special button rounded-sm text-white!">
                                        ${(session.user.cash ?? 0).toFixed(2)}
                                    </button>
                                </Link>

                                <div className="hidden md:contents">
                                    {basketCount > 0 && (
                                        <Link href="/basket" className="right-nav-link button bg-special text-white!">
                                            Basket ({basketCount})
                                        </Link>
                                    )}

                                    {pageLinks("right-nav-link button")}
                                </div>

                                <Link href="/profile" className="cursor-pointer ring-1 ring-special rounded-sm p-0.5">
                                    <Image src={session.user.image!} alt="Profile" width={40} height={40} className="rounded-[4px]" />
                                </Link>
                            </>
                        ) : (
                            <button
                                onClick={() => signIn('steam', { callbackUrl: '/market' })}
                                className="flex items-center gap-2 h-[80%] px-4 rounded-sm cursor-pointer transition-all bg-[#1b2838] hover:bg-[#2a475e] text-sm font-medium"
                            >
                                <Image src="/steam-icon.svg" alt="Steam" width={20} height={20} className="shrink-0" />
                                <span className="md:hidden">Sign in</span>
                                <span className="hidden md:inline">Sign in through Steam</span>
                            </button>
                        ))}

                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="md:hidden flex flex-col gap-1.25 p-2 cursor-pointer"
                            aria-label="Menu"
                        >
                            <span className="block w-5 h-0.5 bg-white" />
                            <span className="block w-5 h-0.5 bg-white" />
                            <span className="block w-5 h-0.5 bg-white" />
                        </button>
                    </div>
                </div>
            </nav>


            {/* Mobile dropdown */}
            {menuOpen && (
                <nav className="md:hidden fixed top-18 right-[2.5%] w-[30%] z-49 bg-secondary rounded-sm flex flex-col divide-y divide-gray-700 frame-shadow">
                    {status !== "loading" && (session ? (
                        <>
                            {basketCount > 0 && (
                                <Link href="/basket" className="mobile_menu_button button" onClick={() => setMenuOpen(false)}>
                                    Basket ({basketCount})
                                </Link>
                            )}

                            <Link href="/market" className="mobile_menu_button button" onClick={() => setMenuOpen(false)}>
                                Market
                            </Link>

                            {pageLinks("mobile_menu_button button")}

                            <button className="mobile_menu_button button text-negative" onClick={() => signOut({"callbackUrl": "/"})}>
                                Log out 
                            </button>
                        </>
                    ) : (
                        <>
                            <Link href="/market" className="mobile_menu_button button" onClick={() => setMenuOpen(false)}>
                                Market
                            </Link>
                        </>
                    ))}
                </nav>
            )}
        </>
    )
}
