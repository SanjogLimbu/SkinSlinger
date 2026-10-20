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


        const cancelled = await prisma.$transaction(async (tx) => {
            // A sale can fill part of the order after it was read, and those units mustn't be refunded too.
            const removed = await tx.buy_order.deleteMany({ where: { id, quantity: order.quantity } })

            if (removed.count === 0) {
                return false
            }


            await tx.user.update({
                where: { id: session.user.id },
                data: { cash: { increment: order.price * order.quantity } },
            })

            return true
        })

        if (!cancelled) {
            return Response.json(
                { error: "This order just changed. Refresh and try again." },
                { status: 409 },
            )
        }


        return Response.json(null, { status: 200 })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
