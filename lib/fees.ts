import { prisma } from './db'

//

// Must match the fee tiers advertised on the homepage.
const WITHDRAWAL_FEE_TIERS = [
    { minVolume: 25000, rate: 0.005 },
    { minVolume: 5000, rate: 0.01 },
    { minVolume: 1000, rate: 0.015 },
    { minVolume: 100, rate: 0.02 },
    { minVolume: 0, rate: 0.025 },
]

//

export async function getWithdrawalFee(userId?: string) {
    let volume = 0

    if (userId) {
        const { _sum } = await prisma.purchase.aggregate({
            where: {
                status: 'completed',
                OR: [{ buyerId: userId }, { sellerId: userId }],
            },
            _sum: { price: true },
        })

        volume = _sum.price ?? 0
    }


    const i = WITHDRAWAL_FEE_TIERS.findIndex(t => volume >= t.minVolume)
    const tier = WITHDRAWAL_FEE_TIERS[i]
    const nextTier = i > 0 ? WITHDRAWAL_FEE_TIERS[i - 1] : null

    return {
        rate: tier.rate,
        volume,
        next: nextTier,
    }
}
