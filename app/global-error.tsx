'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Replaces the root layout when it throws, so it renders its own <html> and
// cannot use the app's fonts, theme or components. Inline styles only.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 16px',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 448 }}>
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#666', marginBottom: 24 }}>
            We encountered an unexpected error. Please try again or return to the homepage.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, color: '#666', marginBottom: 24 }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{ padding: '8px 16px', marginRight: 12, cursor: 'pointer' }}
          >
            Try Again
          </button>
          {/* A plain anchor: next/link needs the router, which may be what broke. */}
          <a href="/" style={{ color: 'inherit' }}>
            Go Home
          </a>
        </div>
      </body>
    </html>
  );
}
