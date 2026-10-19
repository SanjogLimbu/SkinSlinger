import Image from 'next/image'
import type { WithdrawalFee } from './types'
import { ArrowDownIcon, ArrowUpIcon, DetailRow, PageHeader } from './ui'

//

export default function MenuView({
    balance,
    pending,
    locked,
    withdrawalFee,
    onDeposit,
    onWithdraw,
}: {
    balance: number
    pending: number
    locked: number
    withdrawalFee: WithdrawalFee
    onDeposit: () => void
    onWithdraw: () => void
}) {
    const { rate, volume, next } = withdrawalFee

    const volumeToNextTier = next ? next.minVolume - volume : 0
    const volumeToNextTierText = volumeToNextTier.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })

    return (
        <div className="w-full max-w-md flex flex-col gap-4">
            <PageHeader eyebrow="Wallet" title="Your balance" />

            <div className="bg-secondary rounded-sm frame-shadow p-5 flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                    <span className="text-sm text-gray-400">
                        Available to spend
                    </span>

                    <span className="text-4xl font-bold tracking-tight [font-family:var(--font-display)]">
                        ${balance.toFixed(2)}
                    </span>

                    <span className="flex items-center gap-1.5 mt-1">
                        <Image
                            src="/usdc.png"
                            alt=""
                            width={14}
                            height={14}
                        />

                        <span className="text-xs text-gray-500">
                            Held in USDC on Polygon · 1 USDC = $1.00
                        </span>
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={onDeposit}
                        className="bg-special button h-11 rounded-sm flex items-center justify-center gap-2"
                    >
                        <ArrowDownIcon className="w-4 h-4" />
                        Deposit
                    </button>

                    <button
                        onClick={onWithdraw}
                        className="bg-accent button h-11 rounded-sm flex items-center justify-center gap-2 font-medium"
                    >
                        <ArrowUpIcon className="w-4 h-4 text-inherit" />
                        Withdraw
                    </button>
                </div>

                <div className="border-t border-edge pt-4 flex flex-col gap-2.5">
                    <DetailRow label="Clearing from sales" value={`$${pending.toFixed(2)}`} />

                    <DetailRow label="Locked in open purchases" value={`$${locked.toFixed(2)}`} />
                </div>
            </div>

            <div className="bg-secondary rounded-sm p-5 flex flex-col gap-2.5">
                <p className="eyebrow mb-1">
                    Fees & limits
                </p>

                <DetailRow label="Deposit fee" value="Free" />

                <DetailRow label="Withdrawal fee" value={`${rate * 100}%`} />

                {next && (
                    <p className="text-xs text-gray-500 -mt-1.5">
                        Buy or sell ${volumeToNextTierText} more to lower it to {next.rate * 100}%
                    </p>
                )}

                <DetailRow label="Minimum amount" value="$1.00" />

                <DetailRow label="Deposit time" value="Usually under 5 minutes" />
            </div>
        </div>
    )
}
