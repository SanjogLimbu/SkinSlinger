import { CheckIcon, ExternalIcon } from './ui'

//

export default function WithdrawSuccessView({ usdcAmount, transactionHash, onDone }: {
    usdcAmount: number,
    transactionHash?: string,
    onDone: () => void,
}) {
    return (
        <div className="w-full max-w-md bg-secondary rounded-sm frame-shadow p-8 flex flex-col items-center text-center gap-4">
            <span className="w-14 h-14 rounded-full bg-special/15 ring-1 ring-special/40 flex items-center justify-center">
                <CheckIcon className="w-7 h-7 text-special" />
            </span>

            <div className="flex flex-col gap-1">
                <h1 className="text-xl font-bold">
                    Withdrawal sent
                </h1>

                <p className="text-sm text-gray-400">
                    {usdcAmount.toFixed(2)} USDC is on its way to your wallet.
                </p>
            </div>

            {transactionHash && (
                <a
                    href={`https://polygonscan.com/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-special hover:underline"
                >
                    View on Polygonscan
                    <ExternalIcon className="w-3.5 h-3.5 text-inherit" />
                </a>
            )}

            <button className="bg-special button h-11 rounded-sm w-full mt-2" onClick={onDone}>
                Done
            </button>
        </div>
    )
}
