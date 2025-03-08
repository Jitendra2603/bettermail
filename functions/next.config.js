/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.googleapis.com',
        pathname: '/gmail/v1/users/me/messages/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
    ],
    domains: ['localhost', 'www.googleapis.com', 'storage.googleapis.com'],
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/api/upload',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'POST' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
      {
        source: '/api/emails/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000' },
        ],
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: 'standalone',
  serverExternalPackages: ['firebase-admin']
}

module.exports = nextConfig 