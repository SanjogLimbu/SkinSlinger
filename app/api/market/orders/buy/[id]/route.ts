import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"

//

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }


        const { id } = await params

        const order = await prisma.buy_order.findUnique({ where: { id } })

        if (!order) {
            return Response.json({ error: "Order not found" }, { status: 404 })
        }


        if (order.userId !== session.user.id) {
            return Response.json({ error: "Forbidden" }, { status: 403 })
        }


        await prisma.$transaction(async (tx) => {
            await tx.buy_order.delete({ where: { id } })
            await tx.user.update({
                where: { id: session.user.id },
                data: { cash: { increment: order.price * order.quantity } },
            })
        })

        return Response.json(null, { status: 200 })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
