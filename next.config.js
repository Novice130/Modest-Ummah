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
    formats: ['image/avif', 'image/webp'],
  },
  devIndicators: false,
  turbopack: {}, // Required for Next.js 16 middleware
  // Dev-only. Next blocks cross-origin requests for /_next/* dev resources,
  // which silently breaks any page served through a tunnel: the HTML renders
  // but the JS chunks are refused, so nothing hydrates and forms do nothing.
  // Needed while testing the Pirate Ship connector over cloudflared. Has no
  allowedDevOrigins: [
    'localhost:3000',
    '127.0.0.1:3000',
    'localhost',
    '127.0.0.1',
    '*.trycloudflare.com',
    '*.ngrok-free.app',
    '*.ts.net',
  ],
  // Enables 'use cache', cacheTag, cacheLife, and updateTag. Cached
  // scopes may not call cookies()/headers(); those reads live in the
  // root layout and admin trees, which stay dynamic.
  cacheComponents: true,
  // sharp is a native module: bundling it into the server build breaks the
  // .node binding lookup. lib/image-meta.ts uses it inside a Server Action,
  // so it has to stay external and be installed at runtime.
  serverExternalPackages: ['sharp'],
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

