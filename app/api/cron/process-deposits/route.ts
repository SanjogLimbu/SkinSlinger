import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { processDeposits } from '@/lib/crypto'

//

export async function GET(req: Request) {
    if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


    const { processed } = await processDeposits(async (userId, amountUsdc) => {
        await prisma.user.update({
            where: { id: userId },
            data: { cash: { increment: amountUsdc } },
        })
    })

    return NextResponse.json({ processed })
}
