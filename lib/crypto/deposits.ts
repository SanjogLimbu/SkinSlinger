import { prisma } from '../db'
import { getDepositAddress, getPublicClient } from './account'
import { sweepUSDC } from './sweep'
import { erc20Abi, formatUnits, parseAbiItem } from 'viem'

//

const USDC_ADDRESS = process.env.USDC_ADDRESS as `0x${string}`
const USDC_DECIMALS = 6
const EXPIRY_MINUTES = 30
const LATE_PAYMENT_DAYS = 7
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

const BALANCE_OF_ABI = [{
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
}] as const

const STATUS_MAP: Record<string, string> = {
    pending: 'waiting',
    confirmed: 'confirming',
    swept: 'finished',
    expired: 'expired',
}

//

export async function createDeposit(userId: string, amount: number) {
    if (!amount || amount < 1) {
        throw new Error('Minimum deposit is $1.00')
    }


    const counter = await prisma.deposit_counter.upsert({
        where: { id: 'global' },
        update: { value: { increment: 1 } },
        create: { id: 'global', value: 1, lastBlock: BigInt(0) },
    })

    const index = counter.value
    const address = await getDepositAddress(index)
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000)

    await prisma.crypto_deposit.create({
        data: { userId, address, index, amountUsdc: amount, expiresAt },
    })

    return { address, amount, expiresAt }
}


export async function getDepositStatus(address: string, userId: string): Promise<string | null> {
    const deposit = await prisma.crypto_deposit.findUnique({ where: { address } })

    if (!deposit || deposit.userId !== userId) {
        return null
    }


    if (deposit.status === 'pending' && deposit.expiresAt < new Date()) {
        await prisma.crypto_deposit.update({ where: { address }, data: { status: 'expired' } })

        return 'expired'
    }


    return STATUS_MAP[deposit.status] ?? deposit.status
}


export async function processDeposits(
    onCredit: (userId: string, amountUsdc: number) => Promise<void>,
): Promise<{ processed: number }> {
    const client = getPublicClient()
    const currentBlock = await client.getBlockNumber()

    const counter = await prisma.deposit_counter.upsert({
        where: { id: 'global' },
        update: {},
        create: { id: 'global', value: 0, lastBlock: currentBlock as bigint },
    })

    const scannedBefore = counter.lastBlock > BigInt(0)
    const fromBlock = scannedBefore ? counter.lastBlock + BigInt(1) : currentBlock - BigInt(100)

    let processed = 0

    // Late payments, and second transfers after a sweep, are found by balance and retried below.
    const latePaymentCutoff = new Date(Date.now() - LATE_PAYMENT_DAYS * 24 * 60 * 60 * 1000)

    const recentDeposits = await prisma.crypto_deposit.findMany({
        where: {
            status: { in: ['expired', 'swept'] },
            createdAt: { gt: latePaymentCutoff },
        },
    })

    if (recentDeposits.length > 0) {
        const balances = await client.multicall({
            contracts: recentDeposits.map(d => ({
                address: USDC_ADDRESS,
                abi: erc20Abi,
                functionName: 'balanceOf' as const,
                args: [d.address as `0x${string}`] as const,
            })),
            allowFailure: false,
        })

        for (const [i, deposit] of recentDeposits.entries()) {
            if (balances[i] === BigInt(0)) {
                continue
            }


            // Until a sweep is mined the old balance is still visible, so it isn't credited twice.
            if (deposit.status === 'swept') {
                const hash = deposit.txHash as `0x${string}`
                const receipt = await client.getTransactionReceipt({ hash }).catch(() => null)

                if (receipt?.status !== 'success') {
                    continue
                }
            }


            await prisma.crypto_deposit.update({
                where: { id: deposit.id },
                data: { status: 'confirmed' },
            })
        }
    }


    const confirmedDeposits = await prisma.crypto_deposit.findMany({
        where: { status: 'confirmed' },
    })

    for (const deposit of confirmedDeposits) {
        try {
            const balance = await getPublicClient().readContract({
                address: USDC_ADDRESS,
                abi: BALANCE_OF_ABI,
                functionName: 'balanceOf',
                args: [deposit.address as `0x${string}`],
            }) as bigint

            // An empty balance means it was already swept.
            if (balance === 0n) {
                await prisma.crypto_deposit.delete({ where: { id: deposit.id } })

                continue
            }


            const sweepTx = await sweepUSDC(deposit.index, balance)

            await prisma.crypto_deposit.update({
                where: { id: deposit.id },
                data: { status: 'swept', txHash: sweepTx },
            })

            // Credits what was actually swept, not the requested amount.
            await onCredit(deposit.userId, Number(formatUnits(balance, USDC_DECIMALS)))

            processed++
        }
        catch (err) {
            console.error(`[deposits] retry sweep failed for deposit ${deposit.id}:`, err)
        }
    }


    const pending = await prisma.crypto_deposit.findMany({
        where: { status: 'pending', expiresAt: { gt: new Date() } },
    })

    if (pending.length > 0) {
        const pendingAddresses = pending.map(d => d.address as `0x${string}`)

        const logs = await client.getLogs({
            address: USDC_ADDRESS,
            event: TRANSFER_EVENT,
            args: { to: pendingAddresses },
            fromBlock,
            toBlock: currentBlock,
        })

        for (const log of logs) {
            const to = log.args.to?.toLowerCase()
            const deposit = pending.find(d => d.address.toLowerCase() === to)

            if (!deposit) {
                continue
            }


            const received = log.args.value ?? BigInt(0)

            // Zero-value transfers are address-poisoning spam.
            if (received === BigInt(0)) {
                continue
            }


            await prisma.crypto_deposit.update({
                where: { id: deposit.id },
                data: { status: 'confirmed', txHash: log.transactionHash },
            })

            try {
                const sweepTx = await sweepUSDC(deposit.index, received)

                await prisma.crypto_deposit.update({
                    where: { id: deposit.id },
                    data: { status: 'swept', txHash: sweepTx },
                })

                // Credits what actually arrived, whether under or over the requested amount.
                await onCredit(deposit.userId, Number(formatUnits(received, USDC_DECIMALS)))
                processed++
            }
            catch (err) {
                console.error(`[deposits] sweep failed for deposit ${deposit.id}:`, err)
            }
        }
    }


    // Expired deposits are kept, so late payments can still be found.
    await prisma.crypto_deposit.updateMany({
        where: { status: 'pending', expiresAt: { lt: new Date() } },
        data: { status: 'expired' },
    })

    await prisma.deposit_counter.update({
        where: { id: 'global' },
        data: { lastBlock: currentBlock },
    })

    return { processed }
}
