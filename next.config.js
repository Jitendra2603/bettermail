/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
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
    domains: ['localhost', 'www.googleapis.com', 'storage.googleapis.com', 'lh3.googleusercontent.com', 'firebasestorage.googleapis.com'],
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
  serverExternalPackages: ['firebase-admin'],
  experimental: {
    // Enable build cache
    turbotrace: {
      logLevel: 'error',
    },
    // Optimize compilation
    optimizePackageImports: ['@mui/material', '@mui/icons-material', 'react-icons'],
  },
  // Increase build cache size
  onDemandEntries: {
    // period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 60 * 60 * 1000,
    // number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 5,
  },
  // Disable source maps in production to speed up build
  productionBrowserSourceMaps: false,
  // Increase build memory limit
  env: {
    // Set memory limit for Node.js
    NODE_OPTIONS: '--max-old-space-size=4096',
  },
  // Optimize webpack configuration
  webpack: (config, { dev, isServer }) => {
    // Only enable these optimizations in production
    if (!dev) {
      // Add terser plugin for better minification
      config.optimization.minimize = true;
      
      // Cache webpack modules
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [__filename],
        },
      };
    }
    
    return config;
  },
  // Optimize server-side rendering
  serverRuntimeConfig: {
    // Will only be available on the server side
    PROJECT_ROOT: __dirname,
  },
  // Optimize public runtime config
  publicRuntimeConfig: {
    // Will be available on both server and client
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  },
}

module.exports = nextConfig 