import Link from 'next/link'
import type { Metadata } from 'next'
import { posts } from './posts'

//

export const metadata: Metadata = {
    title: 'Blog',
    description: 'Guides, tips, and news from the SkinSlinger team.',
}

//

export default function BlogPage() {
    return (
        <div className="overflow-y-auto h-full w-full no-scrollbar">
            <div className="w-full max-w-4xl mx-auto px-4 pt-24 pb-20">
                <div className="rounded-xl p-8">
                    <h1 className="text-3xl font-bold mb-2">Blog</h1>

                    <p className="text-gray-500 text-sm mb-10">
                        Guides, tips, and updates from the SkinSlinger team.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {posts.map((post) => (
                            <Link
                                key={post.slug}
                                href={`/blog/${post.slug}`}
                                className="block bg-primary border border-white/10 rounded-xl overflow-hidden hover:border-white/25 transition-colors"
                            >
                                {post.image && (
                                    <div className="h-32 bg-accent flex items-center justify-center">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={post.image}
                                            alt={post.title}
                                            className="h-24 w-auto object-contain"
                                        />
                                    </div>
                                )}

                                <div className="p-5">
                                    <p className="text-gray-500 text-xs mb-1">
                                        {post.date}
                                    </p>

                                    <h2 className="font-semibold text-base mb-1">
                                        {post.title}
                                    </h2>

                                    <p className="text-gray-400 text-sm leading-relaxed">
                                        {post.summary}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
