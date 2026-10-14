import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"

//

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { id } = await params
        const { price } = await req.json()

        if (typeof price !== "number" || price <= 0) {
            return Response.json({ error: "Invalid price" }, { status: 400 })
        }

        const listing = await prisma.item_listing.findUnique({ where: { id } })

        if (!listing) {
            return Response.json({ error: "Listing not found" }, { status: 404 })
        }

        if (listing.userId !== session.user.id) {
            return Response.json({ error: "Forbidden" }, { status: 403 })
        }

        await prisma.item_listing.update({ where: { id }, data: { price } })

        return Response.json(null, { status: 200 })
    } catch (error) {
        console.error(error)
        return Response.json({ error: "Server error" }, { status: 500 })
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { id } = await params

        const listing = await prisma.item_listing.findUnique({ where: { id } })

        if (!listing) {
            return Response.json({ error: "Listing not found" }, { status: 404 })
        }

        if (listing.userId !== session.user.id) {
            return Response.json({ error: "Forbidden" }, { status: 403 })
        }

        await prisma.item_listing.delete({ where: { id } })

        // Buy orders are a standing order book — they persist independently of listings
        // (the old "refund all buy orders when listings hit 0" cleanup let any seller
        // wipe the book, and its stale read could double-refund against a live match).

        return Response.json(null, { status: 200 })
    } catch (error) {
        console.error(error)
        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
