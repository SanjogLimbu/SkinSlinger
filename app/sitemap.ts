import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'
import { posts } from './blog/posts'
import { toSlug, getBaseUrl } from './lib/site'

//

const base = getBaseUrl()

//

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // One page per unique market name, since those are the indexed pages.
    const groups = await prisma.item_listing.groupBy({
        by: ['marketName'],
        _min: { createdAt: true },
    })

    const itemUrls: MetadataRoute.Sitemap = groups.map(g => ({
        url: `${base}/item/${toSlug(g.marketName)}`,
        lastModified: g._min.createdAt ?? new Date(),
        changeFrequency: 'daily',
        priority: 0.8,
    }))

    const blogUrls: MetadataRoute.Sitemap = posts.map(p => ({
        url: `${base}/blog/${p.slug}`,
        lastModified: new Date(p.date),
        changeFrequency: 'monthly',
        priority: 0.7,
    }))

    const marketUrls: MetadataRoute.Sitemap = ['cs2', 'dota2', 'rust', 'tf2'].map(game => ({
        url: `${base}/market/${game}`,
        lastModified: new Date(),
        changeFrequency: 'hourly',
        priority: 0.9,
    }))

    return [
        {
            url: `${base}/`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 1.0,
        },
        ...marketUrls,
        {
            url: `${base}/blog`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.7,
        },
        ...blogUrls,
        ...itemUrls,
    ]
}
