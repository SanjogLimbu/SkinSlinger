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

  // Safe because the email comes from Steam's verified SteamID, the only provider.
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
