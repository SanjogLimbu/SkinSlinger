import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"

//

const MAX_ATTEMPTS = 5

//

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }


        const { code } = await request.json()

        if (typeof code !== "string") {
            return Response.json({ error: "Enter the code from your email." }, { status: 400 })
        }


        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                pendingEmail: true,
                emailCode: true,
                emailCodeExpires: true,
                emailCodeAttempts: true,
            },
        })

        if (!user?.pendingEmail || !user.emailCode || !user.emailCodeExpires) {
            return Response.json(
                { error: "No pending email to confirm. Request a new code." },
                { status: 400 },
            )
        }


        if (user.emailCodeExpires.getTime() < Date.now()) {
            return Response.json(
                { error: "That code has expired. Request a new one." },
                { status: 400 },
            )
        }


        if (user.emailCodeAttempts >= MAX_ATTEMPTS) {
            return Response.json(
                { error: "Too many incorrect attempts. Request a new code." },
                { status: 429 },
            )
        }


        if (code.trim() !== user.emailCode) {
            await prisma.user.update({
                where: { id: session.user.id },
                data: { emailCodeAttempts: { increment: 1 } },
            })

            return Response.json({ error: "Incorrect code." }, { status: 400 })
        }


        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                notificationEmail: user.pendingEmail,
                pendingEmail: null,
                emailCode: null,
                emailCodeExpires: null,
            },
        })

        return Response.json({ email: user.pendingEmail }, { status: 200 })
    }
    catch (error) {
        console.error(error)

        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
