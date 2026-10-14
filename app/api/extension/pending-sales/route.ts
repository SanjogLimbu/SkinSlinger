import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { STEAM_APP_IDS } from "@/lib/steam"

//

// Steam's tradable-item context is always 2 for CS2/Dota2/Rust/TF2.
const STEAM_CONTEXT_ID = 2

export async function GET() {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rows = await prisma.purchase.findMany({
        where: { sellerId: session.user.id, status: "pending" },
        include: { buyer: { select: { steam_id: true } } },
    })

    // Offers whose orders were cancelled on the site but still need cancelling on Steam.
    const toCancel = await prisma.cancelled_trade_offer.findMany({
        where: { sellerId: session.user.id },
        select: { tradeOfferId: true },
    })

    const items = rows
        .filter(p => p.buyer.steam_id)
        .map(p => {
            const [game, assetId] = p.assetId.split(":")
            const appid = STEAM_APP_IDS[game]

            if (!appid || !assetId) return null

            return {
                orderId: p.id,
                buyerSteamId64: p.buyer.steam_id,
                marketName: p.marketName,
                appid,
                contextid: STEAM_CONTEXT_ID,
                assetId,
                tradeOfferId: p.tradeOfferId,
            }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

    return Response.json({
        sellerSteamId: session.user.steam_id ?? null,
        items,
        cancelOfferIds: toCancel.map(r => r.tradeOfferId),
    })
}
