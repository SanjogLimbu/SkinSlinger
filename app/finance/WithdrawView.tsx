import { AmountInput, DetailRow, Notice, PageHeader } from './ui'

//

export default function WithdrawView({
    amountInput,
    onAmountChange,
    address,
    onAddressChange,
    balance,
    feeRate,
    error,
    loading,
    onSubmit,
    onBack,
}: {
    amountInput: string
    onAmountChange: (v: string) => void
    address: string
    onAddressChange: (v: string) => void
    balance: number
    feeRate: number
    error: string
    loading: boolean
    onSubmit: (e: React.FormEvent) => void
    onBack: () => void
}) {
    const amount = parseFloat(amountInput) || 0
    const fee = amount * feeRate
    const net = amount - fee

    return (
        <div className="w-full max-w-md flex flex-col gap-4">
            <PageHeader
                eyebrow="Withdraw"
                title="Withdraw funds"
                onBack={onBack}
            />

            <form onSubmit={onSubmit} className="bg-secondary rounded-sm frame-shadow p-5 flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <label htmlFor="withdraw-amount" className="text-sm text-gray-400">
                            Amount
                        </label>

                        <span className="text-xs text-gray-500">
                            Available: ${balance.toFixed(2)}
                        </span>
                    </div>

                    <AmountInput
                        id="withdraw-amount"
                        value={amountInput}
                        onChange={onAmountChange}
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label htmlFor="withdraw-address" className="text-sm text-gray-400">
                        Polygon wallet address
                    </label>

                    <input
                        id="withdraw-address"
                        type="text"
                        placeholder="0x..."
                        spellCheck={false}
                        autoComplete="off"
                        value={address}
                        onChange={e => onAddressChange(e.target.value)}
                        className="w-full h-11 px-3 bg-primary rounded-sm border border-gray-700 focus:border-special-fill outline-none text-sm font-mono"
                        required
                    />
                </div>

                <div className="bg-primary rounded-sm p-4 flex flex-col gap-2.5">
                    <DetailRow label="Amount" value={`$${amount.toFixed(2)}`} />

                    <DetailRow label={`Processing fee (${feeRate * 100}%)`} value={`-$${fee.toFixed(2)}`} />

                    <div className="border-t border-edge" />

                    <DetailRow
                        label="You'll receive"
                        value={`${net.toFixed(2)} USDC`}
                        strong
                    />
                </div>

                <Notice>
                    Only withdraw to a wallet that supports USDC on the Polygon network. Withdrawals can&apos;t be reversed.
                </Notice>

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
                    {loading ? "Processing..." : "Withdraw"}
                </button>
            </form>
        </div>
    )
}
