"use client"

import { useState } from "react"
import { FormPrompt } from "./Prompt"

//

const url_start = "https://steamcommunity.com/tradeoffer/new/?partner="

//

// Trade URL validation and saving, shared by the modal below and the trade-restricted page.
export function useTradeUrlForm(onSaved: () => void) {
    const [url, setUrl] = useState("")
    const [error, setError] = useState("")
    const [waiting, setWaiting] = useState(false)

    function checkUrl(event: React.ChangeEvent<HTMLInputElement>) {
        const val = event.target.value
        setUrl(val)

        if (!val.includes(url_start) && val.length > 0) {
            setError("Invalid trade URL.")
        }
        else {
            setError("")
        }
    }

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (error != "") {
            return
        }

        setWaiting(true)

        try {
            const response = await fetch("/api/trade-link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error ?? "Failed to save trade URL")
            }
            else {
                onSaved()
            }
        }
        catch {
            setError("Network error.")
        }
        finally {
            setWaiting(false)
        }
    }

    return { url, error, waiting, checkUrl, onSubmit }
}

//

export default function SteamUrlPrompt({ onLinked, onClose }: {
    onLinked: () => void,
    onClose?: () => void,
}) {
    const { error, waiting, checkUrl, onSubmit } = useTradeUrlForm(onLinked)

    return (
        <FormPrompt
            title="Steam Trade URL required"
            description="We need your trade URL so buyers can send you items directly."
            onClose={onClose}
        >
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                <div className="flex flex-col gap-1">
                    <input
                        id="url"
                        className="w-full h-10 bg-accent rounded-sm border border-gray-500 outline-none px-3 text-sm"
                        placeholder="https://steamcommunity.com/tradeoffer/new/?partner=..."
                        required
                        onChange={checkUrl}
                    />
                    {error && (
                        <p className="text-red-500 text-xs">
                            {error}
                        </p>
                    )}
                </div>

                <a
                    href="https://steamcommunity.com/my/tradeoffers/privacy"
                    target="_blank"
                    className="text-special text-sm hover:underline"
                >
                    Where do I find my trade URL? →
                </a>

                <button
                    disabled={waiting}
                    type="submit"
                    className="rounded-sm button bg-special h-10 text-sm font-medium"
                >
                    {waiting ? "Saving..." : "Save Trade URL"}
                </button>
            </form>
        </FormPrompt>
    )
}
