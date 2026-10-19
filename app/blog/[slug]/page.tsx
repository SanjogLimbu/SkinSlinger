import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { posts } from '../posts'
import PlatformComparisonTable from '../../components/PlatformComparisonTable'
import { getBaseUrl, JsonLd } from '../../lib/site'

//

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
    return posts.map((p) => ({ slug: p.slug }))
}


export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params
    const post = posts.find((p) => p.slug === slug)

    if (!post) {
        return {}
    }


    const ogImages = post.image
        ? { images: [{ url: post.image, alt: post.title }] }
        : {}

    return {
        title: post.title,
        description: post.summary,
        alternates: { canonical: `/blog/${slug}` },
        openGraph: {
            title: post.title,
            description: post.summary,
            url: `/blog/${slug}`,
            type: 'article',
            ...ogImages,
        },
        twitter: {
            card: post.image ? 'summary_large_image' : 'summary',
            title: post.title,
            description: post.summary,
        },
    }
}

//

export default async function BlogPostPage({ params }: Props) {
    const { slug } = await params
    const post = posts.find((p) => p.slug === slug)

    if (!post) {
        notFound()
    }


    const base = getBaseUrl()
    const imageField = post.image ? { "image": post.image } : {}

    const articleJsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": post.title,
        "description": post.summary,
        "datePublished": new Date(post.date).toISOString(),
        "url": `${base}/blog/${post.slug}`,
        "mainEntityOfPage": `${base}/blog/${post.slug}`,
        ...imageField,
        "author": {
            "@type": "Organization",
            "name": "SkinSlinger",
            "url": base,
        },
        "publisher": {
            "@type": "Organization",
            "name": "SkinSlinger",
            "logo": {
                "@type": "ImageObject",
                "url": `${base}/logo.png`,
            },
        },
    }

    return (
        <div className="overflow-y-auto h-full w-full no-scrollbar">
            <div className="w-full max-w-2xl mx-auto px-4 pt-24 pb-20">
                <div className="bg-secondary rounded-xl p-8">
                    <Link
                        href="/blog"
                        className="text-gray-500 text-sm hover:text-white transition-colors"
                    >
                        &larr; Blog
                    </Link>

                    <h1 className="text-3xl font-bold mt-6 mb-2">
                        {post.title}
                    </h1>

                    <p className="text-gray-500 text-sm mb-6">
                        {post.date}
                    </p>

                    <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-10">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            TL;DR
                        </p>

                        <p className="text-sm text-gray-300 leading-relaxed">
                            {post.tldr}
                        </p>
                    </div>

                    <div className="flex flex-col gap-6">
                        {post.body.map((block, i) => (
                            <div key={i}>
                                {block.image && (
                                    <div className="flex justify-center mb-3">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={block.image}
                                            alt={block.heading ?? post.title}
                                            className="h-28 w-auto object-contain"
                                        />
                                    </div>
                                )}

                                {block.heading && (
                                    <h2 className="font-semibold text-sm mb-1">
                                        {block.heading}
                                    </h2>
                                )}

                                <p className="text-gray-400 text-sm leading-relaxed">
                                    {block.text}
                                </p>
                            </div>
                        ))}
                    </div>

                    {post.slug === 'lowest-fee-skins-marketplace' && (
                        <div className="mt-8">
                            <PlatformComparisonTable />
                        </div>
                    )}

                    <div className="mt-10 pt-6 border-t border-white/10">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                            Author Perspective
                        </p>

                        <p className="text-sm text-gray-400 leading-relaxed italic">
                            {post.authorPerspective}
                        </p>
                    </div>

                    {post.sources && post.sources.length > 0 && (
                        <div className="mt-10 pt-6 border-t border-white/10">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                                Sources
                            </p>

                            <ol className="flex flex-col gap-1">
                                {post.sources.map((s, i) => (
                                    <li key={i} className="text-xs text-gray-500">
                                        <span className="mr-2">{i + 1}.</span>

                                        <a
                                            href={s.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:text-white transition-colors underline underline-offset-2"
                                        >
                                            {s.label}
                                        </a>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                </div>

                <JsonLd data={articleJsonLd} />
            </div>
        </div>
    )
}
