/** @type {import('next').NextConfig} */
const nextConfig = {
  // Stops Turbopack treating C:\Users\Elon, which has a stray package-lock.json, as the root.
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "community.cloudflare.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "community.akamai.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "cdn.steamstatic.com",
      },
    ],
  },
}

module.exports = nextConfig

