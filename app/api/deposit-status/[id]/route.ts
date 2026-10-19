import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDepositStatus } from '@/lib/crypto'

//

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


    const { id } = await params
    const status = await getDepositStatus(id, session.user.id)

    if (status === null) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }


    return NextResponse.json({ status })
}
