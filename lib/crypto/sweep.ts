import { createWalletClient, http, erc20Abi, parseEther } from 'viem'
import { polygon } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { getDepositAccount, getPublicClient } from './account'

//

const GAS_FUND_AMOUNT = parseEther('0.05')

//

export async function sweepUSDC(index: number, amountUsdc: bigint): Promise<`0x${string}`> {
    const account = getDepositAccount(index)
    const rpc = process.env.ALCHEMY_POLYGON_RPC!

    const polBalance = await getPublicClient().getBalance({ address: account.address })

    // The deposit address needs gas to send its USDC on.
    if (polBalance < GAS_FUND_AMOUNT) {
        const mainAccount = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY as `0x${string}`)

        const funder = createWalletClient({
            account: mainAccount,
            chain: polygon,
            transport: http(rpc),
        })

        const fundTx = await funder.sendTransaction({ to: account.address, value: GAS_FUND_AMOUNT })
        await getPublicClient().waitForTransactionReceipt({ hash: fundTx })
    }


    const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(rpc),
    })

    return walletClient.writeContract({
        address: process.env.USDC_ADDRESS as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [process.env.MAIN_WALLET_ADDRESS as `0x${string}`, amountUsdc],
    })
}
