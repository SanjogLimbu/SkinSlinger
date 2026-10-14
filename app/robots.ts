import type { MetadataRoute } from 'next'

//

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/inventory', '/orders', '/basket', '/finance', '/profile', '/reset-password', '/status', '/api/'],
            },
        ],
        sitemap: "https://skinslinger.com/sitemap.xml",
    }
}
