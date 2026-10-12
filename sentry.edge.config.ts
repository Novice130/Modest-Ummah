import * as Sentry from '@sentry/nextjs';
import { sentryDataCollection, sentryRate } from '@/lib/sentry-common';

// Empty DSN = SDK disabled. (Nothing in this app runs on the edge runtime today;
// the file exists so the SDK is configured if a route ever opts in.)
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  release: process.env.SENTRY_RELEASE,
  dataCollection: sentryDataCollection,
  sampleRate: sentryRate(1, process.env.SENTRY_SAMPLE_RATE, process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE),
  tracesSampleRate: sentryRate(
    0.05,
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  ),
});
