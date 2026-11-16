import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'
import { posts } from './blog/posts'
import { toSlug, getBaseUrl } from './lib/site'

//

const base = getBaseUrl()

// Listings change all day, so a sitemap cached at build would list sold items and miss new ones.
export const revalidate = 3600

//

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // One page per unique market name, since those are the indexed pages.
    const groups = await prisma.item_listing.groupBy({
        by: ['marketName'],
        _max: { createdAt: true },
    })

    const itemUrls: MetadataRoute.Sitemap = groups.map(g => ({
        url: `${base}/item/${toSlug(g.marketName)}`,
        lastModified: g._max.createdAt ?? undefined,
    }))

    const blogUrls: MetadataRoute.Sitemap = posts.map(p => ({
        url: `${base}/blog/${p.slug}`,
        lastModified: new Date(p.updated ?? p.date),
    }))

    const marketUrls: MetadataRoute.Sitemap = ['cs2', 'dota2', 'rust', 'tf2'].map(game => ({
        url: `${base}/market/${game}`,
    }))

    const itemIndexUrls: MetadataRoute.Sitemap = ['cs2', 'dota2', 'rust', 'tf2'].map(game => ({
        url: `${base}/market/${game}/items`,
    }))

    return [
        {
            url: `${base}/`,
        },
        ...marketUrls,
        ...itemIndexUrls,
        {
            url: `${base}/blog`,
        },
        ...blogUrls,
        ...itemUrls,
    ]
}
