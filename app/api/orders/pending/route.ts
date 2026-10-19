import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"

//

export async function GET() {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return Response.json({ count: 0 })
    }


    const count = await prisma.purchase.count({
        where: {
            status: { in: ["pending", "holding"] },
            OR: [
                { buyerId: session.user.id },
                { sellerId: session.user.id },
            ],
        },
    })

    return Response.json({ count })
}
