import { SignJWT, jwtVerify } from 'jose'

//

type InventoryItem = { assetId: string; marketName: string }

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET)

export async function signInventoryToken(userId: string, items: InventoryItem[]): Promise<string> {
    return new SignJWT({ items })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime('30m')
        .sign(secret)
}

export async function verifyInventoryToken(token: string, userId: string): Promise<InventoryItem[] | null> {
    try {
        const { payload } = await jwtVerify(token, secret)
        if (payload.sub !== userId) return null
        return payload.items as InventoryItem[]
    } catch {
        return null
    }
}
