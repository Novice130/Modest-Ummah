const { withSentryConfig } = require('@sentry/nextjs/config');

/** @type {import('next').NextConfig} */
// NOTE: next-pwa is temporarily disabled for Next.js 16 compatibility
// Next.js 16 has built-in PWA support - consider migrating
// const withPWA = require('next-pwa')({
//   dest: 'public',
//   register: true,
//   skipWaiting: true,
//   disable: process.env.NODE_ENV === 'development',
// });

// Report-only for now: violations show in the browser console and nothing is
// blocked. Tighten and switch to the enforcing header once a release runs
// clean. 'unsafe-inline' scripts are needed because Next's inline bootstrap
// has no nonce. Sentry goes through the same-origin /monitoring tunnel.
const posthogHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_POSTHOG_HOST
      ? new URL(process.env.NEXT_PUBLIC_POSTHOG_HOST).origin
      : '';
  } catch {
    return '';
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://appleid.apple.com",
  [
    "script-src 'self' 'unsafe-inline'",
    process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : '',
    'https://js.stripe.com https://*.js.stripe.com',
    'https://accounts.google.com/gsi/client',
    'https://appleid.cdn-apple.com',
  ].filter(Boolean).join(' '),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.stripe.com",
  [
    "connect-src 'self'",
    'https://api.stripe.com https://*.stripe.com',
    'https://accounts.google.com',
    'https://appleid.apple.com',
    'https://*.ingest.sentry.io https://*.ingest.us.sentry.io',
    posthogHost,
  ].filter(Boolean).join(' '),
  'frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://*.stripe.com https://accounts.google.com https://appleid.apple.com',
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

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
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

// Source maps are uploaded only when SENTRY_AUTH_TOKEN is present (a BuildKit
// secret in the Dockerfile); without it the build neither uploads nor fails.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

module.exports = withSentryConfig(nextConfig, {
  org: 'learnnovicecom',
  project: process.env.SENTRY_PROJECT || 'modestummah-web',
  authToken: sentryAuthToken,
  silent: !process.env.CI,
  telemetry: false,
  release: { name: process.env.SENTRY_RELEASE || undefined },
  sourcemaps: { disable: !sentryAuthToken },
  // Browser events go through this same-origin route so ad blockers do not
  // drop them. proxy.ts only matches /admin and /account, so it never sees
  // /monitoring.
  tunnelRoute: '/monitoring',
});

