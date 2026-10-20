import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { findPriceFormatError, findPriceLimitError } from "@/lib/listings"

//

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }


        const { id } = await params
        const { price } = await req.json()

        const formatError = findPriceFormatError([{ price }])

        if (formatError) {
            return Response.json({ error: formatError }, { status: 400 })
        }


        const listing = await prisma.item_listing.findUnique({ where: { id } })

        if (!listing) {
            return Response.json({ error: "Listing not found" }, { status: 404 })
        }


        if (listing.userId !== session.user.id) {
            return Response.json({ error: "Forbidden" }, { status: 403 })
        }


        // The same limits as a new listing, or a seller could list at an allowed price and then edit it.
        const limitError = await findPriceLimitError([{
            assetId: listing.assetId,
            marketName: listing.marketName,
            price,
            commodity: listing.commodity,
        }])

        if (limitError) {
            return Response.json({ error: limitError }, { status: 400 })
        }


        await prisma.item_listing.update({ where: { id }, data: { price } })

        return Response.json(null, { status: 200 })
    }
    catch (error) {
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


        // Buy orders stay, since they're a standing order book independent of listings.
        await prisma.item_listing.delete({ where: { id } })

        return Response.json(null, { status: 200 })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
