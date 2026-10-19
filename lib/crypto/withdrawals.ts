import { createWalletClient, http, erc20Abi, parseUnits } from 'viem'
import { polygon } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

//

const minWithdrawal = 1
const USDC_DECIMALS = 6

type WithdrawalResult = { transactionHash: `0x${string}`; usdcAmount: number }

//

export async function processWithdrawal(
    amount: number,
    toAddress: string,
    feeRate: number,
    deductBalance: () => Promise<boolean>,
    refundBalance: () => Promise<void>,
): Promise<WithdrawalResult> {
    if (!amount || amount < minWithdrawal) {
        throw new Error(`Minimum withdrawal is $${minWithdrawal}.00`)
    }


    if (!toAddress?.trim()) {
        throw new Error('Wallet address required')
    }


    const ok = await deductBalance()

    if (!ok) {
        throw new Error('Insufficient balance')
    }


    const feeAmount = amount * feeRate
    const netAmount = amount - feeAmount
    const usdcAmount = parseUnits(netAmount.toFixed(USDC_DECIMALS), USDC_DECIMALS)
    const usdcFee = parseUnits(feeAmount.toFixed(USDC_DECIMALS), USDC_DECIMALS)

    const account = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY as `0x${string}`)

    const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(process.env.ALCHEMY_POLYGON_RPC!),
    })

    let transactionHash: `0x${string}`

    try {
        transactionHash = await walletClient.writeContract({
            address: process.env.USDC_ADDRESS as `0x${string}`,
            abi: erc20Abi,
            functionName: 'transfer',
            args: [toAddress as `0x${string}`, usdcAmount],
        })
    }
    catch (err) {
        await refundBalance()

        throw err
    }


    try {
        await walletClient.writeContract({
            address: process.env.USDC_ADDRESS as `0x${string}`,
            abi: erc20Abi,
            functionName: 'transfer',
            args: [process.env.USDC_PROFIT_ADDRESS as `0x${string}`, usdcFee],
        })
    }
    catch (err) {
        console.error('[withdrawals] fee transfer failed:', err)
    }


    return { transactionHash, usdcAmount: netAmount }
}
