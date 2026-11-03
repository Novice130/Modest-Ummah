// Proves lib/analytics.ts does nothing without a key, and that with a key it
// sends only what it should. Runs against a stub of posthog-js: no network, and
// no event reaches any real project.
//
//   node scripts/check-analytics.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let sdkImports = 0;
let stub;
const STUB_URL = 'stub:posthog-js';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'posthog-js') {
      sdkImports += 1;
      return { url: STUB_URL, shortCircuit: true, format: 'module' };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === STUB_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        // Node caches this module, so delegate to whichever fake is current.
        source:
          'export default new Proxy({}, { get: (_, prop) => globalThis.__posthogStub[prop] });',
      };
    }
    return next(url, context);
  },
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const items = [{ price: 10, quantity: 2 }];
const SECRET = 'pi_abc_secret_xyz';
let instance = 0;

function fakeBrowser(search = '') {
  const store = new Map();
  globalThis.window = {
    location: { search },
    sessionStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, String(v)),
      removeItem: (k) => void store.delete(k),
    },
  };
  return store;
}

function fakeSdk() {
  const sdk = {
    captured: [],
    config: null,
    init(key, config) {
      sdk.key = key;
      sdk.config = config;
    },
    capture: (event, properties) => sdk.captured.push({ event, properties }),
    get_distinct_id: () => 'anon-1',
  };
  globalThis.__posthogStub = sdk;
  return sdk;
}

async function loadModule() {
  instance += 1;
  return import(`../lib/analytics.ts?instance=${instance}`);
}

function callEverything(m) {
  m.trackPageView('/shop');
  m.trackProductViewed('p1', 10);
  m.trackAddToCart('p1', 10, 2);
  m.trackCheckoutStarted(items);
  m.markPaymentReady(SECRET, 20, items);
  m.trackPaymentSucceeded();
}

// ── No key: nothing runs ────────────────────────────────────────────────────
for (const env of [
  {},
  { NEXT_PUBLIC_POSTHOG_KEY: '' , NEXT_PUBLIC_POSTHOG_HOST: '' },
  { NEXT_PUBLIC_POSTHOG_KEY: 'phc_fake' },
  { NEXT_PUBLIC_POSTHOG_HOST: 'http://127.0.0.1:9' },
]) {
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  Object.assign(process.env, env);

  // Any touch of window, storage or fetch fails the check.
  const touched = [];
  const trap = new Proxy({}, { get: (_, prop) => (touched.push(String(prop)), undefined) });
  globalThis.window = trap;
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    touched.push('fetch');
    throw new Error('network');
  };

  sdkImports = 0;
  callEverything(await loadModule());
  await tick();
  globalThis.fetch = realFetch;

  assert.equal(sdkImports, 0, 'posthog-js must not be imported without key and host');
  assert.deepEqual(touched, [], 'window/fetch must not be touched without key and host');
}
console.log('ok  off: no key/host => 0 SDK imports, 0 window, storage or fetch access');

// ── Key set: configuration ──────────────────────────────────────────────────
process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_fake';
process.env.NEXT_PUBLIC_POSTHOG_HOST = 'http://127.0.0.1:9';

{
  fakeBrowser();
  stub = fakeSdk();
  const m = await loadModule();
  m.trackPageView('/admin/orders');
  await tick();
  assert.equal(stub.config, null, 'admin pages must not load the SDK');

  m.trackPageView('/shop');
  m.trackProductViewed('p1', 10);
  m.trackAddToCart('p1', 10, 2);
  m.trackCheckoutStarted(items);
  await tick();
  const c = stub.config;
  assert.equal(c.persistence, 'memory');
  assert.equal(c.autocapture, false);
  assert.equal(c.disable_session_recording, true);
  assert.equal(c.capture_pageview, false);
  assert.equal(c.disable_external_dependency_loading, true);
  assert.deepEqual(
    stub.captured.map((e) => e.event),
    ['$pageview', 'product_viewed', 'add_to_cart', 'checkout_started']
  );
  assert.deepEqual(stub.captured[3].properties, { value: 20, item_count: 2 });
  console.log('ok  on: memory persistence, no autocapture/recording, 4 funnel events in order');

  const scrubbed = m.scrubEvent({
    event: '$pageview',
    properties: {
      $current_url: `https://x.test/checkout/success?payment_intent_client_secret=${SECRET}#a`,
      $referrer: 'https://search.test/q?email=a@b.test',
      $pathname: '/checkout/success?x=1',
    },
    $set_once: { $initial_current_url: 'https://x.test/p?token=abc' },
  });
  assert.equal(scrubbed.properties.$current_url, 'https://x.test/checkout/success');
  assert.equal(scrubbed.properties.$referrer, 'https://search.test/q');
  assert.equal(scrubbed.properties.$pathname, '/checkout/success');
  assert.equal(scrubbed.$set_once.$initial_current_url, 'https://x.test/p');
  assert.ok(!JSON.stringify(scrubbed).includes('secret'));
  for (const event of ['$autocapture', '$snapshot', '$exception', '$identify', 'other']) {
    assert.equal(m.scrubEvent({ event, properties: {} }), null, `${event} must be dropped`);
  }
  console.log('ok  scrub: query strings removed (Stripe client secret), other events dropped');
}

// ── payment_succeeded: once, real path only ─────────────────────────────────
const paid = (sdk) => sdk.captured.filter((e) => e.event === 'payment_succeeded');
const SUCCESS = '?payment_intent=pi_abc&payment_intent_client_secret=x&redirect_status=succeeded';

async function startPayment() {
  const store = fakeBrowser();
  const sdk = fakeSdk();
  (await loadModule()).markPaymentReady(SECRET, 42.5, items);
  await tick();
  return { store, sdk };
}

async function returnFromStripe(store, search) {
  // A full page load: new module state, same tab storage.
  const saved = [...store];
  const next = fakeBrowser(search);
  saved.forEach(([k, v]) => next.set(k, v));
  const sdk = fakeSdk();
  const m = await loadModule();
  return { m, sdk, store: next };
}

{
  const { store } = await startPayment();
  const first = await returnFromStripe(store, SUCCESS);
  first.m.trackPaymentSucceeded();
  first.m.trackPaymentSucceeded(); // React strict-mode double effect
  await tick();
  assert.equal(paid(first.sdk).length, 1);
  assert.deepEqual(paid(first.sdk)[0].properties, { value: 42.5, item_count: 2, currency: 'usd' });
  assert.equal(first.sdk.config.bootstrap.distinctID, 'anon-1', 'must join the same funnel');

  const refresh = await returnFromStripe(first.store, SUCCESS);
  refresh.m.trackPaymentSucceeded();
  await tick();
  assert.equal(paid(refresh.sdk).length, 0, 'refresh must not fire');
  console.log('ok  payment: fires once, joins the funnel id, refresh sends nothing');
}
for (const [label, search] of [
  ['failed status', '?payment_intent=pi_abc&redirect_status=failed'],
  ['processing status', '?payment_intent=pi_abc&redirect_status=processing'],
  ['another intent', '?payment_intent=pi_other&redirect_status=succeeded'],
  ['no params', ''],
]) {
  const { store } = await startPayment();
  const back = await returnFromStripe(store, search);
  back.m.trackPaymentSucceeded();
  await tick();
  assert.equal(paid(back.sdk).length, 0, `${label} must not fire`);
}
{
  const direct = await returnFromStripe(new Map(), SUCCESS);
  direct.m.trackPaymentSucceeded();
  await tick();
  assert.equal(paid(direct.sdk).length, 0, 'no marker must not fire');
}
console.log('ok  payment: failed, processing, wrong intent, no params, no marker send nothing');

// ── Failure is silent ───────────────────────────────────────────────────────
{
  const rejections = [];
  const onRejection = (e) => rejections.push(e);
  process.on('unhandledRejection', onRejection);

  fakeBrowser(SUCCESS);
  const sdk = fakeSdk();
  sdk.init = () => {
    throw new Error('init failed');
  };
  callEverything(await loadModule());
  await tick();

  fakeBrowser(SUCCESS);
  const sdk2 = fakeSdk();
  sdk2.capture = () => {
    throw new Error('capture failed');
  };
  callEverything(await loadModule());
  await tick();

  const storage = () => {
    throw new Error('storage blocked');
  };
  globalThis.window = {
    location: { search: SUCCESS },
    sessionStorage: { getItem: storage, setItem: storage, removeItem: storage },
  };
  fakeSdk();
  callEverything(await loadModule());
  await tick();

  process.off('unhandledRejection', onRejection);
  assert.deepEqual(rejections, []);
  console.log('ok  failure: SDK init, capture and blocked storage neither throw nor reject');
}

delete globalThis.window;
console.log('PASS (stubbed SDK; nothing was sent anywhere)');
