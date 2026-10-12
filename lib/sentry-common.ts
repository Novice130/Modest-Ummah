// Shared Sentry options. This is a shop with customer addresses and payments,
// so nothing identifying leaves the process: no user info, request/response
// bodies, cookies, headers or query strings. Each is switched off outright
// rather than deny-listed, because a deny list only hides names we thought of.
import type { NodeOptions } from '@sentry/nextjs';

type DataCollection = NonNullable<NodeOptions['dataCollection']>;

export const sentryDataCollection: DataCollection = {
  userInfo: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  httpBodies: [],
  httpHeaders: false,
  cookies: false,
  urlQueryParams: false,
};

// Parses a 0..1 sample rate from env strings (first usable one wins).
export function sentryRate(fallback: number, ...raw: Array<string | undefined>): number {
  for (const value of raw) {
    if (value === undefined || value.trim() === '') continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  }
  return fallback;
}
