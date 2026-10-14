"use client"

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTradeUrlForm } from '@/app/components/SteamUrlPrompt'

export default function TradeRestrictedClient({ reason }: { reason: string | null }) {
    const router = useRouter()
    const { url, error: urlError, waiting, checkUrl, onSubmit } = useTradeUrlForm(() => router.refresh())

    const isCorruptUrl = reason === "corrupt_url"

    const displayReason = isCorruptUrl
        ? "Your saved trade URL is malformed. Please enter a valid one to continue."
        : (reason ?? "Your Steam account cannot trade at this time.")

    return (
        <div className="flex items-center justify-center h-full px-4">
            <div className="bg-secondary frame-shadow rounded-sm flex flex-col items-center text-center gap-5 px-8 py-10 w-full max-w-sm">

                <Image src="/lock.svg" alt="Trade restricted" width={56} height={56} className="invert" />

                <div className="flex flex-col gap-2">
                    <p className="text-lg font-semibold">Trade Restricted</p>
                    <p className="text-gray-400 text-sm leading-relaxed">{displayReason}</p>
                </div>

                {isCorruptUrl && (
                    <>
                        <div className="w-full border-t border-gray-700" />

                        <form onSubmit={onSubmit} className="flex flex-col items-center gap-5 w-full">
                            <div className="input-box relative">
                                <input
                                    id="trade-url"
                                    className="sign-up-input peer"
                                    placeholder=""
                                    required
                                    onChange={checkUrl}
                                />
                                <label htmlFor="trade-url" className="floating-label">Trade URL</label>
                                {urlError && <p className="error">{urlError}</p>}
                            </div>

                            <a
                                href="https://steamcommunity.com/my/tradeoffers/privacy"
                                target="_blank"
                                className="text-special text-xs hover:underline"
                            >
                                Where do I find my Trade URL?
                            </a>

                            <button
                                disabled={waiting || !!urlError || !url}
                                type="submit"
                                className="button bg-accent rounded-sm h-9 px-8 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {waiting ? "Saving..." : "Save Trade URL"}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    )
}
