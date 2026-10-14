"use client"

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

//

function StatusContent() {
    const searchParams = useSearchParams()
    const message = searchParams.get("message")
    const redirect = searchParams.get("redirect")

    return (
        <div className="h-full w-full flex justify-center items-center">
            <div className="bg-secondary w-96 flex flex-col items-center gap-6 p-10 rounded-sm frame-shadow">
                <p className="text-2xl text-center">
                    {message ?? "Something went wrong"}
                </p>

                <Link href={redirect ?? "/"} className="w-full">
                    <button className="button bg-accent w-full h-11 rounded-sm">
                        Okay
                    </button>
                </Link>
            </div>
        </div>
    )
}

export default function Status() {
    return (
        <Suspense>
            <StatusContent />
        </Suspense>
    )
}

