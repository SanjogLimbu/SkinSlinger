import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Resend } from "resend"
import { randomInt } from "crypto"
import { EmailVerificationEmail } from "@/app/components/emails/EmailVerificationEmail"

//

const resend = new Resend(process.env.RESEND_API)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_TTL_MS = 15 * 60 * 1000

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { email } = await request.json()

        if (typeof email !== "string" || !EMAIL_RE.test(email) || email.length > 254) {
            return Response.json({ error: "Enter a valid email address." }, { status: 400 })
        }

        // The Steam pseudo-domain is the placeholder we're trying to replace.
        if (email.toLowerCase().endsWith("@steamcommunity.com")) {
            return Response.json({ error: "Enter a real email address." }, { status: 400 })
        }

        // The attempt cap in confirm/route.ts limits guessing to 5 tries per email sent.
        const code = String(randomInt(1000, 10000))

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                pendingEmail: email,
                emailCode: code,
                emailCodeExpires: new Date(Date.now() + CODE_TTL_MS),
                emailCodeAttempts: 0,
            },
        })

        await resend.emails.send({
            from: "SkinSlinger <onboarding@skinslinger.com>",
            to: [email],
            subject: "Your SkinSlinger confirmation code",
            react: EmailVerificationEmail({ code }),
        })

        return Response.json(null, { status: 200 })
    }
    catch (error) {
        console.error(error)
        return Response.json({ error: "Server error" }, { status: 500 })
    }
}
