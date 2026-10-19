import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"

//

export async function DELETE() {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return Response.json({ error: "Unauthorized" }, { status: 401 })
    }


    await prisma.user.update({
        where: { id: session.user.id },
        data: { lastInventoryRefresh: new Date(0), inventoryCache: [] },
    })

    return Response.json(null, { status: 200 })
}
