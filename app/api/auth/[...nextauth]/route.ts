import NextAuth from "next-auth"
import Steam from 'next-auth-steam'
import type { NextRequest } from 'next/server'
import { authOptions } from "@/lib/auth"

//

async function auth(
  req: NextRequest,
  ctx: {
    params: Promise<{
      nextauth: string[]
    }>
  }
) {
  const params = await ctx.params

  const steam = Steam(req, {
    clientSecret: process.env.STEAM_SECRET!
  })

  // Link a fresh OAuth account to an existing user matched by email. Safe here
  // because the email is `<steamid>@steamcommunity.com` derived from Steam's
  // OpenID-verified SteamID (the only provider), so it can't be spoofed. This
  // also recovers users whose `account` row was lost but whose `user` remains.
  steam.allowDangerousEmailAccountLinking = true

  return NextAuth(req, { params }, {
    ...authOptions,
    providers: [
      ...authOptions.providers,
      steam
    ]
  })
}

//

export { auth as GET, auth as POST }
