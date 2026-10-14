import { useState } from "react"

//

type Step = "idle" | "code" | "done"

//

// Notification email flow: send a code to the address, then confirm it.
export function useEmailVerification(initialStep: Step = "idle", initialEmail = "", onConfirmed?: (email: string) => void) {
    const [step, setStep] = useState<Step>(initialStep)
    const [email, setEmail] = useState(initialEmail)
    const [code, setCode] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    async function sendCode() {
        setLoading(true)
        setError("")
        try {
            const res = await fetch("/api/notification-email/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() }),
            })
            if (!res.ok) {
                const d = await res.json()
                setError(d.error ?? "Something went wrong")
                return
            }

            setCode("")
            setStep("code")
        } catch {
            setError("Network error")
        } finally {
            setLoading(false)
        }
    }

    async function confirm() {
        setLoading(true)
        setError("")
        try {
            const res = await fetch("/api/notification-email/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: code.trim() }),
            })
            const d = await res.json()
            if (!res.ok) {
                setError(d.error ?? "Something went wrong")
                return
            }

            onConfirmed?.(d.email)
            setStep("done")
        } catch {
            setError("Network error")
        } finally {
            setLoading(false)
        }
    }

    return { step, setStep, email, setEmail, code, setCode, loading, error, setError, sendCode, confirm }
}
