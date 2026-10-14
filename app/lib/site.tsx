// Shared helpers used across pages. Lives inside app/ (no page.tsx here, so it's not a route).

export function toSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
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

/**
 * Single source of truth for the site's absolute base URL.
 * Warns loudly in production instead of silently emitting broken relative URLs
 * in metadata and JSON-LD.
 */
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

/**
 * Renders a JSON-LD script tag with `<` escaped, so externally-sourced strings
 * (e.g. Steam market names) can never contain `</script>` and break out of the tag.
 */
export function JsonLd({ data }: { data: object }) {
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
        />
    )
}
