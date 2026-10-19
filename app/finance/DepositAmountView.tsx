import { AmountInput, DetailRow, PageHeader } from './ui'

//

const PRESETS = [10, 25, 50, 100]

//

export default function DepositAmountView({
    amountInput,
    onAmountChange,
    error,
    loading,
    onSubmit,
    onBack,
}: {
    amountInput: string
    onAmountChange: (v: string) => void
    error: string
    loading: boolean
    onSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void
    onBack: () => void
}) {
    const amount = parseFloat(amountInput) || 0

    return (
        <div className="w-full max-w-md flex flex-col gap-4">
            <PageHeader
                eyebrow="Deposit"
                title="Add funds"
                onBack={onBack}
            />

            <form onSubmit={onSubmit} className="bg-secondary rounded-sm frame-shadow p-5 flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <label htmlFor="deposit-amount" className="text-sm text-gray-400">
                        Amount
                    </label>

                    <AmountInput
                        id="deposit-amount"
                        value={amountInput}
                        onChange={onAmountChange}
                    />

                    <div className="grid grid-cols-4 gap-2">
                        {PRESETS.map(p => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => onAmountChange(String(p))}
                                className={`h-9 rounded-sm text-sm button ${amount === p ? "bg-less-special text-special" : "bg-accent"}`}
                            >
                                ${p}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-primary rounded-sm p-4 flex flex-col gap-2.5">
                    <DetailRow label="Pay with" value="USDC" />

                    <DetailRow label="Network" value="Polygon (PoS)" />

                    <DetailRow label="Deposit fee" value="Free" />

                    <DetailRow
                        label="You'll receive"
                        value={`$${amount.toFixed(2)}`}
                        strong
                    />
                </div>

                {error && (
                    <p className="text-sm text-negative">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="bg-special button h-11 rounded-sm w-full disabled:opacity-60"
                >
                    {loading ? "Generating address..." : "Continue"}
                </button>

                <p className="text-xs text-gray-500 text-center">
                    Next you&apos;ll get a one-time address to send your USDC to.
                </p>
            </form>
        </div>
    )
}
