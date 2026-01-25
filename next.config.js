/** @type {import('next').NextConfig} */
// NOTE: next-pwa is temporarily disabled for Next.js 16 compatibility
// Next.js 16 has built-in PWA support - consider migrating
// const withPWA = require('next-pwa')({
//   dest: 'public',
//   register: true,
//   skipWaiting: true,
//   disable: process.env.NODE_ENV === 'development',
// });

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: 'pocketbase-ak48ow80wcc0o0008ogcsg8s.35.196.155.128.sslip.io',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  turbopack: {}, // Required for Next.js 16 middleware
  experimental: {
    // optimizeCss: true, // Disabled to fix missing 'critters' error
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  output: 'standalone', // Required for Docker deployment
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

