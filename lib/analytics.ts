// Funnel analytics (PostHog). A thin wrapper so the rest of the shop never
// touches the SDK:
//
//  - Off unless NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST are both
//    set at build time (NEXT_PUBLIC_* values are inlined by `next build`). Off
//    means every export returns on its first line: no import, no storage read,
//    no network.
//  - posthog-js is imported on first use, so it costs nothing until then.
//  - Every failure is swallowed. Analytics must never break checkout.
//  - No personal data: no email, name or address is ever passed in, and
//    scrubEvent removes query strings, because Stripe's return URL carries the
//    PaymentIntent client secret in its query.
import type { PostHog } from 'posthog-js';

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;
// Written against the inlined env values directly, so that in a build without
// them the bundler sees `'' ? import(...) : null` and leaves the SDK chunk out.
// A plain `if (!ENABLED) return` guard still ships the chunk, and dev servers
// fetch it.
const importSdk =
  process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST
    ? () => import('posthog-js')
    : null;
const ENABLED = Boolean(KEY && HOST && importSdk);

const PAYMENT_MARKER = 'mu_analytics_payment';
const ALLOWED_EVENTS = new Set([
  '$pageview',
  'product_viewed',
  'add_to_cart',
  'checkout_started',
  'payment_succeeded',
]);

type CartLine = { price: number; quantity: number };

// What survives the redirect to Stripe and back. Persistence is memory-only, so
// a full page load starts a new anonymous id; without carrying the id, no
// payment_succeeded could ever join its funnel. Written only once a payment
// form is showing, to this tab's sessionStorage, and removed on success.
type PaymentMarker = {
  distinctId: string;
  paymentIntentId: string;
  value?: number;
  itemCount: number;
};

let loading: Promise<PostHog> | null = null;
let carriedDistinctId: string | undefined;

function readMarker(): PaymentMarker | null {
  try {
    const raw = window.sessionStorage.getItem(PAYMENT_MARKER);
    return raw ? (JSON.parse(raw) as PaymentMarker) : null;
  } catch {
    return null;
  }
}

function stripUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/)[0];
  }
}

function scrubProperties(properties: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string' && (/^https?:\/\//i.test(value) || key.includes('pathname'))) {
      properties[key] = stripUrl(value);
    }
  }
}

type ScrubbableEvent = {
  event: string;
  properties: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
};

/** Last gate before anything leaves the browser. Exported for the check script. */
export function scrubEvent<T extends ScrubbableEvent>(event: T | null): T | null {
  if (!event || !ALLOWED_EVENTS.has(event.event)) return null;
  scrubProperties(event.properties);
  if (event.$set) scrubProperties(event.$set);
  if (event.$set_once) scrubProperties(event.$set_once);
  event.properties.$geoip_disable = true;
  return event;
}

function load(): Promise<PostHog> {
  if (!loading) {
    const distinctID = readMarker()?.distinctId ?? carriedDistinctId;
    loading = importSdk!().then(({ default: posthog }) => {
      posthog.init(KEY as string, {
        api_host: HOST,
        persistence: 'memory',
        person_profiles: 'identified_only',
        ...(distinctID ? { bootstrap: { distinctID } } : {}),
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_exceptions: false,
        capture_performance: false,
        capture_heatmaps: false,
        capture_dead_clicks: false,
        rageclick: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        disable_web_experiments: true,
        advanced_disable_flags: true,
        // No further scripts from the PostHog host.
        disable_external_dependency_loading: true,
        save_campaign_params: false,
        mask_personal_data_properties: true,
        before_send: scrubEvent as never,
      });
      return posthog;
    });
  }
  return loading;
}

function withPostHog(use: (posthog: PostHog) => void): void {
  if (!ENABLED || typeof window === 'undefined') return;
  try {
    load().then(use).catch(() => {});
  } catch {
    // Never let analytics reach the caller.
  }
}

function cartValue(items: CartLine[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function cartCount(items: CartLine[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function trackPageView(pathname: string): void {
  if (pathname.startsWith('/admin')) return;
  withPostHog((posthog) => posthog.capture('$pageview'));
}

export function trackProductViewed(productId: string, price: number): void {
  withPostHog((posthog) => posthog.capture('product_viewed', { product_id: productId, price }));
}

export function trackAddToCart(productId: string, price: number, quantity: number): void {
  withPostHog((posthog) =>
    posthog.capture('add_to_cart', { product_id: productId, value: price * quantity, quantity })
  );
}

export function trackCheckoutStarted(items: CartLine[]): void {
  if (items.length === 0) return; // The page is about to redirect to /cart.
  withPostHog((posthog) =>
    posthog.capture('checkout_started', { value: cartValue(items), item_count: cartCount(items) })
  );
}

/** Call when the server has created the PaymentIntent and the form is showing. */
export function markPaymentReady(clientSecret: string, total: unknown, items: CartLine[]): void {
  withPostHog((posthog) => {
    const marker: PaymentMarker = {
      distinctId: posthog.get_distinct_id(),
      paymentIntentId: clientSecret.split('_secret_')[0],
      value: typeof total === 'number' ? total : undefined,
      itemCount: cartCount(items),
    };
    try {
      window.sessionStorage.setItem(PAYMENT_MARKER, JSON.stringify(marker));
    } catch {
      // Storage blocked: the payment simply goes unreported.
    }
  });
}

/**
 * Call on the page Stripe returns to. Fires only when Stripe reports success
 * for the PaymentIntent this tab just started. The marker is removed before the
 * event goes out, so a refresh, a re-render or the same link in another tab
 * finds nothing and sends nothing.
 */
export function trackPaymentSucceeded(): void {
  if (!ENABLED || typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const marker = readMarker();
    if (
      !marker ||
      params.get('redirect_status') !== 'succeeded' ||
      params.get('payment_intent') !== marker.paymentIntentId
    ) {
      return;
    }
    window.sessionStorage.removeItem(PAYMENT_MARKER);
    carriedDistinctId = marker.distinctId;
    withPostHog((posthog) =>
      posthog.capture('payment_succeeded', {
        value: marker.value,
        item_count: marker.itemCount,
        currency: 'usd',
      })
    );
  } catch {
    // Never let analytics reach the caller.
  }
}
