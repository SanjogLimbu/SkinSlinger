// This folder has no page.tsx, so it isn't a route.

export function toSlug(name: string): string {
    const dashed = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

    return dashed.replace(/^-|-$/g, '')
}

export const GAME_NAMES: Record<string, string> = {
    CS2:   "Counter-Strike 2",
    Dota2: "Dota 2",
    Rust:  "Rust",
    TF2:   "Team Fortress 2",
}

export const GAME_SLUGS: Record<string, string> = {
    CS2:   "cs2",
    Dota2: "dota2",
    Rust:  "rust",
    TF2:   "tf2",
}

// Warns in production rather than silently emitting broken relative URLs.
export function getBaseUrl(): string {
    const url = process.env.NEXTAUTH_URL

    if (!url) {
        if (process.env.NODE_ENV === 'production') {
            console.warn('NEXTAUTH_URL is not set — absolute URLs in metadata/JSON-LD will be wrong')
        }


        return 'http://localhost:3000'
    }


    return url.replace(/\/$/, '')
}


// Escapes `<` so an item name can never close the script tag.
export function JsonLd({ data }: { data: object }) {
    const json = JSON.stringify(data).replace(/</g, '\\u003c')

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: json }}
        />
    )
}
