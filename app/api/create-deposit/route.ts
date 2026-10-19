import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createDeposit } from '@/lib/crypto'

//

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


    const { amount } = await req.json()

    try {
        const { address, amount: amountUsdc } = await createDeposit(session.user.id, amount)

        return NextResponse.json({
            depositId: address,
            payAddress: address,
            payAmount: amountUsdc,
        })
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create deposit'

        return NextResponse.json({ error: message }, { status: 400 })
    }
}
