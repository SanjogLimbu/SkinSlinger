import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "./db"

//

const adapter = PrismaAdapter(prisma)

// next-auth-steam adds a steamId field that the account table has no column for.
const baseLinkAccount = adapter.linkAccount!

type SteamAccount = Parameters<typeof baseLinkAccount>[0] & { steamId?: string }

adapter.linkAccount = ({ steamId, ...account }: SteamAccount) => baseLinkAccount(account)

//

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


            // next-auth-steam never saves steam_id, so it's backfilled from the Steam account id.
            const steamId = account?.provider === 'steam' ? account.providerAccountId : null

            if (steamId && token.id && token.steam_id !== steamId) {
                await prisma.user.update({
                    where: { id: token.id as string },
                    data: { steam_id: steamId },
                })
                token.steam_id = steamId
            }


            if (!token.id && token.email) {
                const dbUser = await prisma.user.findUnique({
                    where: { email: token.email },
                    select: {
                        id: true,
                        cash: true,
                        steam_trade_url: true,
                        steam_id: true,
                    },
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
