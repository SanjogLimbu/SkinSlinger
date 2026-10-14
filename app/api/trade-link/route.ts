import { prisma  } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

//

const trade_url_pattern = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=(\d+)&token=[a-zA-Z0-9_-]+$/
const steam_id_offset = BigInt("76561197960265728")

//

export async function POST(request: Request) {
    try {
        const { url } = await request.json()
        const match = trade_url_pattern.exec(url)

        if (!match) {
            return Response.json({ error: "Invalid trade URL" }, { status: 400 })
        }


        const urlSteamId = (steam_id_offset + BigInt(match[1])).toString()
        const session = await getServerSession(authOptions)

        if (!session || !session?.user?.email) {
            return Response.json({ error: "Unauthorized request" }, { status: 401 })
        }

        const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { steam_id: true } })

        if (!user?.steam_id) {
            return Response.json({ error: "Link your Steam account before adding a trade URL." }, { status: 400 })
        }

        if (urlSteamId !== user.steam_id) {
            return Response.json({ error: "This trade URL doesn't belong to your linked Steam account." }, { status: 400 })
        }


        await prisma.user.update({
            where: { email: session.user.email },
            data: {
                steam_trade_url: url
            }
        })


        return Response.json(null, { status: 200 })
    }
    catch (error) {
        console.log(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}

