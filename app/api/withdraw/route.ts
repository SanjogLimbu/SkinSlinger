import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { processWithdrawal } from '@/lib/crypto'
import { getWithdrawalFee } from '@/lib/fees'

//

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


    const { amount, address } = await req.json()
    const userId = session.user.id

    if (typeof amount !== "number" || !Number.isFinite(amount)) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
    }


    if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 })
    }


    const deductBalance = async () => {
        const updated = await prisma.user.updateMany({
            where: { id: userId, cash: { gte: amount } },
            data: { cash: { decrement: amount } },
        })

        return updated.count > 0
    }

    const refundBalance = async () => {
        await prisma.user.update({
            where: { id: userId },
            data: { cash: { increment: amount } },
        })
    }

    try {
        const { rate } = await getWithdrawalFee(userId)
        const result = await processWithdrawal(amount, address, rate, deductBalance, refundBalance)

        return NextResponse.json(result)
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Withdrawal failed'
        const isUserError = message === 'Insufficient balance' || message.startsWith('Minimum')

        return NextResponse.json({ error: message }, { status: isUserError ? 400 : 500 })
    }
}
