"use client"

//

// Small confirm/notice box shown above the nav. Clicking outside it calls onClose.
export function Prompt({ title, onClose, children }: {
    title: string,
    onClose?: () => void,
    children: React.ReactNode,
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-secondary rounded-sm p-8 flex flex-col gap-4 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
                <p className="text-lg font-medium">
                    {title}
                </p>

                {children}
            </div>
        </div>
    )
}

//

// Wider box for forms. Sits below the nav so the user can still leave the page.
export function FormPrompt({ title, description, onClose, children }: {
    title: string,
    description: string,
    onClose?: () => void,
    children: React.ReactNode,
}) {
    return (
        <div className="fixed inset-0 z-6 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="flex flex-col bg-secondary rounded-sm frame-shadow p-6 gap-4 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
                <div className="flex flex-col gap-1">
                    <p className="text-xl font-semibold">
                        {title}
                    </p>

                    <p className="text-sm text-gray-400">
                        {description}
                    </p>
                </div>

                {children}
            </div>
        </div>
    )
}
