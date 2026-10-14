/** @type {import('next').NextConfig} */
const nextConfig = {
  // Stop Turbopack from inferring C:\Users\Elon (stray package-lock.json there) as the root
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

