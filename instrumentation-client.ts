import * as Sentry from '@sentry/nextjs';
import { sentryDataCollection, sentryRate } from '@/lib/sentry-common';

// Empty DSN = SDK disabled. NEXT_PUBLIC_* values are inlined at build time.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  release: process.env.SENTRY_RELEASE,
  dataCollection: sentryDataCollection,
  sampleRate: sentryRate(1, process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE),
  tracesSampleRate: sentryRate(0.05, process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
  // No Session Replay: no replay integration, and the sample rates stay unset.
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
