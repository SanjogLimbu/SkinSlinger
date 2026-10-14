import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "./db"

//

const adapter = PrismaAdapter(prisma)

// next-auth-steam adds a non-schema `steamId` field to the token set (the
// userinfo step reads it), and NextAuth forwards the whole token into
// account.create(). The `account` model has no `steamId` column, so strip it
// before the insert to avoid a PrismaClientValidationError on linkAccount.
const baseLinkAccount = adapter.linkAccount!
adapter.linkAccount = ({ steamId, ...account }: Parameters<typeof baseLinkAccount>[0] & { steamId?: string }) =>
    baseLinkAccount(account)

export const authOptions: NextAuthOptions = {
    adapter,
    secret: process.env.NEXTAUTH_SECRET,

    session: {
        strategy: 'jwt'
    },

    callbacks: {
        async jwt({ token, user, account }) {
            if (user) {
                token.id = user.id
                token.steam_id = user.steam_id
            }

            // next-auth-steam's profile() doesn't include steam_id, so the adapter
            // never persists it on the user row. Backfill it from the OAuth account's
            // providerAccountId (the Steam64 id) whenever a Steam sign-in happens.
            if (account?.provider === 'steam' && account.providerAccountId && token.id && token.steam_id !== account.providerAccountId) {
                await prisma.user.update({
                    where: { id: token.id as string },
                    data: { steam_id: account.providerAccountId },
                })
                token.steam_id = account.providerAccountId
            }

            // Fallback: if token.id was never set, look up by email
            if (!token.id && token.email) {
                const dbUser = await prisma.user.findUnique({
                    where: { email: token.email },
                    select: { id: true, cash: true, steam_trade_url: true, steam_id: true },
                })
                if (dbUser) {
                    token.id = dbUser.id
                    token.cash = dbUser.cash
                    token.steam_id = dbUser.steam_id ?? undefined
                    token.steam_trade_url = dbUser.steam_trade_url ?? undefined
                }

                return token
            }

            if (token.id) {
                const dbUser = await prisma.user.findUnique({
                    where: { id: token.id as string },
                    select: { cash: true, steam_trade_url: true, steam_id: true },
                })

                if (dbUser) {
                    token.cash = dbUser.cash
                    token.steam_id = dbUser.steam_id ?? undefined
                    token.steam_trade_url = dbUser.steam_trade_url ?? undefined
                }
            }

            return token
        },

        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id
                session.user.steam_id = token.steam_id
                session.user.steam_trade_url = token.steam_trade_url
                session.user.cash = token.cash
            }

            return session
        }
    },

    providers: []
}
