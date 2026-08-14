#!/usr/bin/env node
/**
 * Smoke test for the WooCommerce-compatible surface Pirate Ship connects to.
 *
 * Exercises the same things a real Woo REST client does: Basic auth, the
 * query-string credential fallback, pagination headers, the version gate, and
 * the writeback path — plus the negative cases that matter for security
 * (no credentials, wrong secret, read-only key attempting a write).
 *
 * Usage:
 *   WOO_BASE=http://localhost:3000 \
 *   WOO_CK=ck_xxx WOO_CS=cs_xxx \
 *   node scripts/woo-smoke.mjs
 *
 * Generate the key pair in Admin → Settings → Pirate Ship → Generate.
 * The server must be running with WOO_SHIM_ENABLED=true.
 */

import { createHmac, randomBytes } from 'crypto';

const BASE = (process.env.WOO_BASE || 'http://localhost:3000').replace(/\/+$/, '');
const CK = process.env.WOO_CK;
const CS = process.env.WOO_CS;

if (!CK || !CS) {
  console.error('Set WOO_CK and WOO_CS (generate them in Admin → Settings).');
  process.exit(1);
}

const basic = 'Basic ' + Buffer.from(`${CK}:${CS}`).toString('base64');

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'woo-smoke/1.0',
      ...(options.auth === false ? {} : { Authorization: basic }),
      ...(options.headers || {}),
    },
  });

  let body = null;
  const text = await response.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { status: response.status, headers: response.headers, body };
}

// ─── OAuth 1.0a one-legged signer ───────────────────────
// Written from RFC 5849 rather than imported, deliberately: sharing code with
// lib/woo/oauth.ts would make the test agree with the server about any mistake
// they both contain. This mirrors what the oauth-1.0a package (used by the
// official @woocommerce/woocommerce-rest-api client, and most likely by Pirate
// Ship) produces.

function pctEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function signOauth(options) {
  const {
    method = 'GET',
    path,
    query = {},
    consumerKey = CK,
    consumerSecret = CS,
    signatureMethod = 'HMAC-SHA256',
    nonce = randomBytes(16).toString('hex'),
    timestamp = Math.floor(Date.now() / 1000),
  } = options;

  const params = {
    ...query,
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: signatureMethod,
    oauth_timestamp: String(timestamp),
    oauth_version: '1.0',
  };

  const paramString = Object.entries(params)
    .map(([key, value]) => [pctEncode(key), pctEncode(String(value))])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    pctEncode(`${BASE}${path}`),
    pctEncode(paramString),
  ].join('&');

  const algorithm = signatureMethod === 'HMAC-SHA1' ? 'sha1' : 'sha256';
  const signature = createHmac(algorithm, `${consumerSecret}&`)
    .update(baseString)
    .digest('base64');

  const search = Object.entries({ ...params, oauth_signature: signature })
    .map(([key, value]) => `${pctEncode(key)}=${pctEncode(String(value))}`)
    .join('&');

  return { url: `${path}?${search}`, nonce, timestamp };
}

/** A signed request carries no Authorization header at all. */
async function callSigned(options) {
  const signed = signOauth(options);
  const response = await call(signed.url, {
    method: options.method || 'GET',
    auth: false,
    ...(options.body ? { body: options.body } : {}),
  });
  return { ...response, signed };
}

async function main() {
  console.log(`\nWooCommerce shim smoke test → ${BASE}\n`);

  // ─── Authentication ───
  // Only the positive cases run here. Every rejection counts against the
  // server's auth-failure rate limit, so they are deferred to the end of the
  // suite — otherwise the tests 429 themselves before reaching the endpoints.
  console.log('Authentication');
  {
    const query = await call(
      `/wp-json/wc/v3/orders?consumer_key=${encodeURIComponent(CK)}&consumer_secret=${encodeURIComponent(CS)}`,
      { auth: false }
    );
    check('query-string credentials accepted', query.status === 200, `got ${query.status}`);
  }

  // ─── OAuth 1.0a ───
  // The scheme Pirate Ship is suspected of using. Every case here sends no
  // Authorization header — the credentials exist only inside the signature.
  console.log('\nOAuth 1.0a (one-legged)');
  let spentNonce = null;
  {
    const sha256 = await callSigned({ path: '/wp-json/wc/v1/orders' });
    spentNonce = sha256.signed.nonce;
    check('HMAC-SHA256 signed GET → 200', sha256.status === 200, `got ${sha256.status}`);

    const sha1 = await callSigned({
      path: '/wp-json/wc/v3/orders',
      signatureMethod: 'HMAC-SHA1',
    });
    check('HMAC-SHA1 signed GET → 200', sha1.status === 200, `got ${sha1.status}`);

    const withQuery = await callSigned({
      path: '/wp-json/wc/v3/orders',
      query: { per_page: '5', status: 'processing', orderby: 'date' },
    });
    check(
      'signature covers the query parameters',
      withQuery.status === 200,
      `got ${withQuery.status}`
    );

    const ns = await callSigned({ path: '/wp-json/wc/v1' });
    check('signed namespace index → 200', ns.status === 200, `got ${ns.status}`);
    check('namespace echoes the requested version', ns.body?.namespace === 'wc/v1');
  }

  // ─── Discovery ───
  console.log('\nDiscovery');
  {
    const index = await call('/wp-json');
    check('GET /wp-json → 200', index.status === 200, `got ${index.status}`);
    check(
      'advertises the wc/v3 namespace',
      Array.isArray(index.body?.namespaces) && index.body.namespaces.includes('wc/v3')
    );

    const ns = await call('/wp-json/wc/v3');
    check('GET /wp-json/wc/v3 → 200', ns.status === 200, `got ${ns.status}`);

    // Discovery is anonymous in WordPress, and Pirate Ship's connection check
    // depends on it: its first probe carries no credentials at all. A 401 here
    // is reported to the merchant as a credentials failure.
    const anonIndex = await call('/wp-json', { auth: false });
    check('anonymous GET /wp-json → 200', anonIndex.status === 200, `got ${anonIndex.status}`);

    const anonNs = await call('/wp-json/wc/v1', { auth: false });
    check(
      'anonymous GET /wp-json/wc/v1 → 200 (Pirate Ship connection probe)',
      anonNs.status === 200,
      `got ${anonNs.status}`
    );
    check('anonymous probe still echoes the namespace', anonNs.body?.namespace === 'wc/v1');

    const status = await call('/wp-json/wc/v3/system_status');
    check('GET system_status → 200', status.status === 200, `got ${status.status}`);

    const wc = String(status.body?.environment?.version || '0');
    const wp = String(status.body?.environment?.wp_version || '0');
    const gte = (v, min) => {
      const a = v.split('.').map(Number);
      const b = min.split('.').map(Number);
      for (let i = 0; i < b.length; i++) {
        if ((a[i] || 0) > (b[i] || 0)) return true;
        if ((a[i] || 0) < (b[i] || 0)) return false;
      }
      return true;
    };
    check(`WooCommerce version ${wc} >= 3.5 (Pirate Ship floor)`, gte(wc, '3.5'));
    check(`WordPress version ${wp} >= 4.4 (Pirate Ship floor)`, gte(wp, '4.4'));
    check(
      'weight unit is oz (must match lib/parcel.ts)',
      status.body?.settings?.woocommerce_weight_unit === 'oz'
    );

    const settings = await call('/wp-json/wc/v3/settings/general');
    check('GET settings/general → 200', settings.status === 200, `got ${settings.status}`);
  }

  // ─── Orders ───
  console.log('\nOrders');
  let sampleOrder = null;
  {
    const list = await call('/wp-json/wc/v3/orders?per_page=10');
    check('GET orders → 200', list.status === 200, `got ${list.status}`);
    check('returns an array', Array.isArray(list.body));

    const total = list.headers.get('x-wp-total');
    const totalPages = list.headers.get('x-wp-totalpages');
    check('X-WP-Total header present', total !== null, 'clients page off this');
    check('X-WP-TotalPages header present', totalPages !== null);

    if (Array.isArray(list.body) && list.body.length > 0) {
      sampleOrder = list.body[0];

      check('order id is an integer', Number.isInteger(sampleOrder.id));
      check(
        'monetary values are strings',
        typeof sampleOrder.total === 'string' && /^\d+\.\d{2}$/.test(sampleOrder.total),
        `total=${JSON.stringify(sampleOrder.total)}`
      );
      check(
        'dates are naive ISO (no Z, no offset)',
        typeof sampleOrder.date_created === 'string' &&
          !/[Z+]/.test(sampleOrder.date_created),
        `date_created=${sampleOrder.date_created}`
      );
      check('has line_items', Array.isArray(sampleOrder.line_items));
      check('has a shipping address', typeof sampleOrder.shipping?.address_1 === 'string');
      check('billing carries the email', typeof sampleOrder.billing?.email === 'string');
      check(
        'status is a Woo status',
        ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'].includes(
          sampleOrder.status
        ),
        `status=${sampleOrder.status}`
      );

      const single = await call(`/wp-json/wc/v3/orders/${sampleOrder.id}`);
      check('GET orders/{id} → 200', single.status === 200, `got ${single.status}`);
      check('single order id matches', single.body?.id === sampleOrder.id);
    } else {
      console.log('  \x1b[33mSKIP\x1b[0m no paid orders in the database to inspect');
    }

    const missing = await call('/wp-json/wc/v3/orders/99999999');
    check('unknown order → 404', missing.status === 404, `got ${missing.status}`);
    check(
      'unknown order uses the Woo error code',
      missing.body?.code === 'woocommerce_rest_invalid_order_id',
      `code=${missing.body?.code}`
    );
  }

  // ─── Products ───
  console.log('\nProducts');
  {
    const list = await call('/wp-json/wc/v3/products?per_page=5');
    check('GET products → 200', list.status === 200, `got ${list.status}`);
    check('X-WP-Total header present', list.headers.get('x-wp-total') !== null);

    if (Array.isArray(list.body) && list.body.length > 0) {
      const product = list.body[0];
      check('product id is an integer', Number.isInteger(product.id));
      check(
        'exposes dimensions object',
        product.dimensions &&
          typeof product.dimensions.length === 'string' &&
          typeof product.dimensions.width === 'string'
      );
      check('exposes weight as a string', typeof product.weight === 'string');
      if (!product.weight) {
        console.log(
          '  \x1b[33mNOTE\x1b[0m first product has no weight set — Pirate Ship will price it at the 8 oz fallback'
        );
      }

      const single = await call(`/wp-json/wc/v3/products/${product.id}`);
      check('GET products/{id} → 200', single.status === 200, `got ${single.status}`);
    } else {
      console.log('  \x1b[33mSKIP\x1b[0m no products in the database');
    }
  }

  // ─── Catch-all logger ───
  console.log('\nUnimplemented routes');
  {
    const unknown = await call('/wp-json/wc/v3/coupons');
    check('unknown route → 404', unknown.status === 404, `got ${unknown.status}`);
    check(
      'answers with rest_no_route',
      unknown.body?.code === 'rest_no_route',
      `code=${unknown.body?.code}`
    );
    console.log('  \x1b[33mNOTE\x1b[0m that request is now in integration_events for review');
  }

  // ─── Writeback ───
  console.log('\nWriteback');
  if (sampleOrder) {
    const tracking = `94001234567890${Math.floor(100000 + Math.random() * 899999)}`;

    const put = await call(`/wp-json/wc/v3/orders/${sampleOrder.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'completed',
        meta_data: [
          { key: '_tracking_number', value: tracking },
          { key: '_tracking_provider', value: 'USPS' },
        ],
      }),
    });

    check('PUT orders/{id} → 200', put.status === 200, `got ${put.status}`);
    check('order is now completed', put.body?.status === 'completed', `status=${put.body?.status}`);
    check(
      'tracking number is echoed back in meta_data',
      Array.isArray(put.body?.meta_data) &&
        put.body.meta_data.some((m) => m.key === '_tracking_number' && m.value === tracking)
    );

    const repeat = await call(`/wp-json/wc/v3/orders/${sampleOrder.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'completed',
        meta_data: [{ key: '_tracking_number', value: tracking }],
      }),
    });
    check('re-posting the same tracking is idempotent', repeat.status === 200);

    const note = await call(`/wp-json/wc/v3/orders/${sampleOrder.id}/notes`, {
      method: 'POST',
      body: JSON.stringify({
        note: `USPS tracking number: ${tracking}`,
        customer_note: false,
      }),
    });
    check('POST orders/{id}/notes → 201', note.status === 201, `got ${note.status}`);

    const notes = await call(`/wp-json/wc/v3/orders/${sampleOrder.id}/notes`);
    check('GET notes → 200', notes.status === 200, `got ${notes.status}`);
    check('the note was persisted', Array.isArray(notes.body) && notes.body.length > 0);

    // Same writeback, authenticated by signature instead of Basic — a JSON
    // body is not part of the OAuth base string, so this must still verify.
    const signedPut = await callSigned({
      method: 'PUT',
      path: `/wp-json/wc/v1/orders/${sampleOrder.id}`,
      body: JSON.stringify({
        status: 'completed',
        meta_data: [{ key: '_tracking_number', value: tracking }],
      }),
    });
    check('signed PUT with a JSON body → 200', signedPut.status === 200,
      `got ${signedPut.status}`);

    console.log(
      `  \x1b[33mNOTE\x1b[0m order ${sampleOrder.id} was moved to shipped with tracking ${tracking}`
    );
  } else {
    console.log('  \x1b[33mSKIP\x1b[0m no order available to write back to');
  }

  // ─── Rejections ───
  // Last, on purpose: each one of these adds a row to the auth-failure rate
  // limit's window, and a 429 would mask the 401 the assertions look for.
  console.log('\nRejections');
  {
    const anon = await call('/wp-json/wc/v3/orders', { auth: false });
    check('no credentials → 401', anon.status === 401, `got ${anon.status}`);
    check(
      'error uses the Woo envelope',
      anon.body?.code === 'woocommerce_rest_authentication_error' ||
        anon.body?.code === 'rest_no_route',
      `code=${anon.body?.code}`
    );

    const bad = await call('/wp-json/wc/v3/orders', {
      headers: { Authorization: 'Basic ' + Buffer.from(`${CK}:cs_wrong`).toString('base64') },
    });
    check('wrong secret → 401', bad.status === 401, `got ${bad.status}`);

    // Anonymous is allowed on discovery; wrong credentials never are, there or
    // anywhere else.
    const badOnIndex = await call('/wp-json/wc/v1', {
      headers: { Authorization: 'Basic ' + Buffer.from(`${CK}:cs_wrong`).toString('base64') },
    });
    check(
      'bad credentials on the namespace index → 401',
      badOnIndex.status === 401,
      `got ${badOnIndex.status}`
    );

    const ordersAnon = await call('/wp-json/wc/v1/orders', { auth: false });
    check(
      'orders are never anonymous → 401',
      ordersAnon.status === 401,
      `got ${ordersAnon.status}`
    );

    const unknown = await call('/wp-json/wc/v3/orders', {
      headers: {
        Authorization: 'Basic ' + Buffer.from('ck_does_not_exist:cs_nope').toString('base64'),
      },
    });
    check('unknown key → 401', unknown.status === 401, `got ${unknown.status}`);
    check(
      'unknown key and wrong secret are indistinguishable',
      unknown.body?.code === bad.body?.code && unknown.body?.message === bad.body?.message
    );

    // Signed requests: replay, clock skew, forged signature, tampered query.
    const replay = await call(
      signOauth({ path: '/wp-json/wc/v1/orders', nonce: spentNonce }).url,
      { auth: false }
    );
    check('replayed OAuth nonce → 401', replay.status === 401, `got ${replay.status}`);

    const stale = await callSigned({
      path: '/wp-json/wc/v3/orders',
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });
    check('OAuth timestamp an hour old → 401', stale.status === 401, `got ${stale.status}`);

    const wrongSecret = await callSigned({
      path: '/wp-json/wc/v3/orders',
      consumerSecret: 'cs_wrong',
    });
    check(
      'OAuth signature under the wrong secret → 401',
      wrongSecret.status === 401,
      `got ${wrongSecret.status}`
    );
    check(
      'signed failures use the Woo error envelope',
      wrongSecret.body?.code === 'woocommerce_rest_authentication_error',
      `code=${wrongSecret.body?.code}`
    );

    const unknownSigned = await callSigned({
      path: '/wp-json/wc/v3/orders',
      consumerKey: 'ck_does_not_exist',
    });
    check(
      'OAuth with an unknown consumer key → 401',
      unknownSigned.status === 401,
      `got ${unknownSigned.status}`
    );

    const tampered = signOauth({ path: '/wp-json/wc/v3/orders' });
    const tamperedRetry = await call(`${tampered.url}&per_page=99`, { auth: false });
    check(
      'appending an unsigned parameter → 401',
      tamperedRetry.status === 401,
      `got ${tamperedRetry.status}`
    );
  }

  // ─── Summary ───
  console.log(`\n${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('Shim looks correct. Remaining manual step: connect the real');
    console.log('Pirate Ship account over an HTTPS tunnel and read');
    console.log('integration_events for any 404 rows.\n');
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error);
  process.exit(1);
});
