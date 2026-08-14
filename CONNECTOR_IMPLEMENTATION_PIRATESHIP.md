# Pirate Ship Connector — Implementation Spec

**Status:** implemented and smoke-tested locally (56/56, Basic + OAuth 1.0a). First live connection attempt **failed**; the namespace bug behind it is fixed and OAuth 1.0a — the leading suspect for the remaining 401 — is now implemented. See [§0 Live findings](#0-live-findings-2026-08-13). Awaiting a second live attempt.
**Strategy:** WooCommerce REST API v3 compatibility shim
**Owner doc for:** endpoint contract, field mappings, operator runbook

## What exists now

| Area | Files |
|---|---|
| Auth, errors, request wrapper | `lib/woo/auth.ts`, `lib/woo/errors.ts`, `lib/woo/handler.ts` |
| OAuth 1.0a, secret encryption | `lib/woo/oauth.ts`, `lib/woo/secret-box.ts` |
| Serializers | `lib/woo/serialize.ts` |
| Queries | `lib/woo/queries.ts` |
| Writeback | `lib/woo/writeback.ts` |
| Store identity / origin | `lib/woo/store.ts` |
| Endpoint handlers + dispatcher | `lib/woo/endpoints.ts`, `lib/woo/path.ts` |
| Routes | `app/wp-json/**` — 4 files: root index, `[...path]` logger, `wc/[version]`, `wc/[version]/[...resource]` |
| Parcel + address | `lib/parcel.ts`, `lib/address.ts` |
| Admin | `lib/actions/connector.actions.ts`, `components/admin/pirate-ship-connector.tsx` |
| Schema | `lib/schema.ts`, `scripts/apply-connector-schema.mjs` |
| Verification | `scripts/woo-smoke.mjs` |

**Deviations from the original plan** — the rest of this document describes the
design as built, except:

- **OAuth 1.0a one-legged is implemented** (2026-08-14, `lib/woo/oauth.ts`).
  The original plan skipped it on the grounds that WooCommerce documents it as
  the plain-HTTP scheme and Pirate Ship requires SSL — but nothing stops a
  client from signing every request, and the first live attempt 401'd. Both
  HMAC-SHA1 and HMAC-SHA256 are accepted. Two consequences worth knowing:
  secrets are now also stored encrypted (`api_keys.consumer_secret_enc`,
  AES-256-GCM) because a signature cannot be verified against a hash, and
  nonces are recorded in `woo_oauth_nonces` so a captured signature cannot be
  replayed inside its 15-minute window.
- **The namespace is version-agnostic.** Originally v3-only; Pirate Ship calls
  v1, so `wc/v1`, `wc/v2` and `wc/v3` are now all served by one dispatcher.
- **`orders.trackingNumber` / `trackingCarrier`, `products.lengthIn/widthIn/
  heightIn` and per-variant `weight` already existed** from the product-builder
  work, so only the remaining fulfilment columns were added.
- **The `db:push` history means `drizzle/0001_*.sql` is a catch-up migration**
  containing all prior drift. Do not run `drizzle-kit migrate` against an
  existing database — use `scripts/apply-connector-schema.mjs`, which is
  additive and idempotent.
- **`app/admin/settings/page.tsx` no longer had the hardcoded "Manual Export"
  card** to replace; the connector panel was added alongside the persisted
  settings form instead.

---

## 0. Live findings (2026-08-13)

First real connection attempt from Pirate Ship. It failed with:

> Pirate Ship couldn't connect to your WooCommerce store at &lt;url&gt; with your saved credentials.

The `integration_events` catch-all logger captured exactly what happened, which
is the whole reason it was built first. Two separate problems.

### Finding 1 — Pirate Ship calls `wc/v1`, not `wc/v3`  ✅ fixed

```
when      method  path               status  ip             user_agent
20:31:42  GET     /wp-json/wc/v1     401     18.118.64.11   Pirate Ship WooCommerce Integration
20:32:27  GET     /wp-json/wc/v1     401     18.118.64.11   Pirate Ship WooCommerce Integration
```

Their integration targets the **v1 namespace**. Only `wc/v3` existed, so even
with perfect credentials the probe would have 404'd.

WooCommerce still serves `wc/v1` and `wc/v2` alongside `v3` for backwards
compatibility, and the fields Pirate Ship reads (`id`, `status`, `billing`,
`shipping`, `line_items`, `meta_data`) are identical across all three.

**Fix applied:** the eight per-resource v3 route files were collapsed into one
version-aware dispatcher. `wc/v1`, `wc/v2` and `wc/v3` are all served, and the
namespace index echoes back whichever version was requested (`{"namespace":
"wc/v1", ...}`) rather than a hardcoded v3 — a client that validates the echo
would otherwise reject us.

| Before | After |
|---|---|
| `app/wp-json/wc/v3/orders/route.ts` (+7 more) | `app/wp-json/wc/[version]/[...resource]/route.ts` |
| — | `app/wp-json/wc/[version]/route.ts` |
| — | `lib/woo/endpoints.ts` — all handlers + dispatcher |
| — | `lib/woo/path.ts` — version/resource parsing |

Verified: `wc/v1`, `wc/v2`, `wc/v3` all return 200 on `/orders`,
`/system_status` and the namespace index.

### Finding 2 — the credentials did not authenticate  ⚠️ unresolved

The v1 probes returned **401, not 404**. Auth failed before routing was ever
reached, so fixing the namespace alone will not connect it.

Cause unknown, because at the time the log recorded only the status code. The
plausible explanations:

1. Pirate Ship sends **OAuth 1.0a one-legged** even over HTTPS. WooCommerce's
   docs present OAuth as the plain-HTTP scheme and Basic as the HTTPS scheme,
   but nothing stops a client from always signing. This was the one deliberate
   gap in the implementation (see the deviations list below).
2. Credentials are sent in a form not parsed — e.g. `Authorization: Bearer`, or
   a body field rather than the header or query string.
3. Cloudflare's quick tunnel strips or rewrites the `Authorization` header.
4. The key was entered wrong on their side.

**Instrumentation added** so the next attempt answers this definitively.
`lib/woo/auth.ts` now returns an `AuthDiagnostic` on every failure and
`lib/woo/handler.ts` writes it to `integration_events.body`. It records the
*shape* of the attempt only — never secret material:

```json
{"_auth": {
  "detail": "consumer key matched, consumer secret did not",
  "authHeaderScheme": "basic",
  "oauthParams": [],
  "hasQueryConsumerKey": false,
  "hasQueryConsumerSecret": false,
  "consumerKeyPrefix": "ck_020",
  "matchedKeyId": "22c08754-…"
}}
```

`detail` distinguishes the four cases that all present as one opaque 401 to the
caller: no credentials / unknown key / right key + wrong secret / read-only key
attempting a write. `consumerKeyPrefix` is 6 characters — enough to compare
against the admin card, useless as a credential. Verified working locally
against both the no-credentials and wrong-secret paths.

### Finding 2, follow-up (2026-08-14) — OAuth implemented pre-emptively

Rather than spend a second tunnel session discovering that OAuth is the answer,
it was built and tested first. `lib/woo/oauth.ts` verifies one-legged
signatures the way `class-wc-rest-authentication.php` does:

```
base string = METHOD & pctEnc(url) & pctEnc(sorted "k=v" pairs joined by &)
signing key = consumer secret + "&"
signature   = base64(HMAC-SHA1|SHA256(base string, signing key))
```

Three things a correct client would still trip over, all handled:

- **The signed URL is not the URL we see.** Behind the tunnel `nextUrl` is
  `http://localhost:3000` while the client signed the public host. Candidates
  are tried in order — `x-forwarded-host`, the `Host` header (https then
  http), `storeUrl()`, `nextUrl.origin` — and the one that matched is written
  to the log, so a working integration tells us its real origin.
- **Double-encoded parameters.** Some libraries percent-encode before signing.
  Verification is attempted against both the normalised and the raw wire form.
- **Replay.** A one-legged signature is a bearer token for its whole 15-minute
  window. `woo_oauth_nonces` has a unique `(key_id, nonce)` index; the nonce is
  consumed only *after* the signature verifies, so garbage replays cannot burn
  a legitimate client's nonces.

Secrets could no longer be stored as a digest alone — HMAC needs the plaintext
key. `api_keys.consumer_secret_enc` holds an AES-256-GCM ciphertext
(`lib/woo/secret-box.ts`), keyed by `WOO_SECRET_ENC_KEY` or, unset, a value
derived from `JWT_SECRET`. WooCommerce itself stores this column in cleartext.
Keys minted before this column existed cannot use OAuth and say so in the
diagnostic rather than failing opaquely.

**Also changed:** the auth-failure rate limit was 10 per 15 minutes per IP,
which the expanded test suite tripped over itself — and which would equally
have fired during a live debugging session, replacing the diagnostic 401 with
an uninformative 429. Now 60. Consumer keys are 160-bit; this limit caps
database work, it is not what stands between anyone and a brute force.

### Finding 3 — the connection probe is unauthenticated  ✅ fixed

Second live attempt, 2026-08-14, now with the diagnostic in place. Pirate Ship
made exactly **one** request and stopped:

```
when      method  path            status  user_agent
20:57:22  GET     /wp-json/wc/v1  401     Pirate Ship WooCommerce Integration
```

```json
{"_auth": {
  "detail": "no Basic auth header and no consumer_key/consumer_secret query pair",
  "scheme": null, "authHeaderScheme": null, "oauthParams": [],
  "hasQueryConsumerKey": false, "consumerKeyPrefix": null }}
```

**No credentials of any kind.** Not Basic, not OAuth, nothing in the query
string — so OAuth was the wrong suspect, and nothing was stripped in transit
either, because nothing was sent.

The namespace index is **public in WordPress**. `WP_REST_Server::get_namespace_index`
has no permission callback, and neither does the `/wp-json` root: a client has
to identify a site before it can know how to authenticate to it. Pirate Ship's
connection check reads the namespace index anonymously to confirm the store is
a WooCommerce install, and reports any failure — including our 401 — to the
merchant as *"couldn't connect with your saved credentials"*, which is what
sent both of the previous investigations chasing the credentials.

Every handler authenticating as its first statement, §4's rule, was correct for
order and product data and wrong for discovery.

**Fix applied:** `wooRoute(handler, { allowAnonymous: true })` on `/wp-json`
and `/wp-json/wc/{version}` only. Credentials that *are* presented are still
verified there, so a bad key fails on discovery exactly as it does anywhere
else; the carve-out is for callers presenting none. Orders, products,
system_status and settings are unchanged. Regression-tested in
`scripts/woo-smoke.mjs` from both directions: anonymous discovery 200,
anonymous orders 401, bad credentials on the index 401.

Note what this does *not* tell us: Pirate Ship never got far enough to send
credentials, so which scheme it uses on authenticated calls is still unknown.
The next attempt's `integration_events` rows will answer that — and the OAuth
support from Finding 2's follow-up means either answer now works.

### Finding 4 — Pirate Ship uses the WooCommerce auth endpoint  ✅ implemented

With discovery public, the probe returned 200 and Pirate Ship carried on — and
immediately sent the browser somewhere we do not serve:

```
GET /wc-auth/v1/authorize
    ?app_name=Pirate+Ship
    &scope=read_write
    &user_id=f06845d3…
    &return_url=https://ship.pirateship.com/woocommerce/install/redirect
    &callback_url=https://ship.pirateship.com/woocommerce/install/callback
```

Plain Next.js 404. This is WooCommerce's **key-exchange endpoint**
(`includes/class-wc-auth.php`): the app never wants pasted credentials, it
wants the store to mint a pair and deliver them. The flow is

1. app redirects the merchant's browser to `/wc-auth/v1/authorize`,
2. the store authenticates the merchant and shows a consent screen,
3. on approval the store creates a key and **POSTs it to `callback_url`** as
   `{key_id, user_id, consumer_key, consumer_secret, key_permissions}`,
4. the browser is returned to `return_url` with `success=1&user_id=…`.

That also explains the very first failure back on 2026-08-13: the manual
credential entry their troubleshooting page describes is the fallback path,
not the one their connect button takes.

**Implemented:**

| File | |
|---|---|
| `app/wc-auth/v1/authorize/page.tsx` | consent screen; sign-in gate when there is no admin session |
| `components/admin/woo-auth-consent.tsx` | approve / deny |
| `lib/actions/woo-auth.actions.ts` | mint, deliver to the callback, redirect |
| `lib/woo/auth-endpoint.ts` | parameter validation, host allowlist, return-URL building |
| `api_keys.woo_key_id` | integer surrogate; Woo's callback contract carries an int `key_id` |

This endpoint mints a `read_write` credential to customer PII and posts it to a
URL supplied in the query string, so the parameters are attacker-controllable
by construction — anyone can mail a logged-in admin a crafted link. Four
guards:

- an **admin session** is required to render and re-checked inside the action;
- approval is an **explicit click**, and the screen names the app and the exact
  host that will receive the credentials;
- `callback_url` and `return_url` must be **HTTPS on an allowlisted host**
  (`WOO_AUTH_CALLBACK_HOSTS`, default `pirateship.com`). WooCommerce enforces
  only the SSL half; a store with one shipping vendor has no reason to hand
  keys to an arbitrary domain;
- if the callback does not answer 2xx the key is **revoked immediately** — a
  credential nobody received is one nobody should be able to use. The row is
  kept, unlike Woo which deletes it, so the attempt stays in the audit trail.

Also added: `/admin/login?redirect=…` (same-origin paths only — an open
redirect on the admin login page would be worth more to an attacker than the
convenience is worth to us), so the sign-in detour returns to the consent
screen instead of dumping the merchant on the dashboard.

### Finding 5 — their callback is behind a Cloudflare challenge  ⚠️ blocked from local

The consent screen worked, the key was minted, and the delivery POST to
`https://ship.pirateship.com/woocommerce/install/callback` came back **403**
with 932 KB of HTML. The headers say what that HTML is:

```
HTTP/2 403
cf-mitigated: challenge
server: cloudflare
content-length: 932529
```

A Cloudflare **managed challenge**, not their API. Confirmed it has nothing to
do with our request: a bare `GET` on the same URL is challenged identically, as
is `https://support.pirateship.com/...` — their public documentation. Every
request from this machine's IP to `pirateship.com` is being challenged.
Browser-shaped headers (Chrome UA, `sec-ch-ua`, `Origin`, `Referer`) do not
help; the challenge keys on TLS fingerprint and IP reputation, which a
server-side `fetch` cannot satisfy.

Two attempts were made with a fresh `user_id` each. The initial
"install session expired" reading of the first 403 was wrong — the response
body was never read at that point. It is read now, and a Cloudflare
interstitial is called by name in both the UI and `integration_events`.

**What this does and does not block.** The auth endpoint is correct and stays;
it is the delivery hop out of this laptop that fails. Two ways round it:

1. **Manual credentials** — Pirate Ship's documented fallback, and now viable:
   the reason it failed on 2026-08-13 was Finding 1 and Finding 3, both fixed.
   Generate a key in Admin → Settings → Pirate Ship and paste it in.
2. **Run the flow from the deployed server.** A Dokploy host has a different
   IP and reputation, and the merchant's own browser is what visits the consent
   screen. Retest `/wc-auth/v1/authorize` there before assuming it is broken in
   production.

### Next session — do this first

1. Start dev server + tunnel, set `NEXT_PUBLIC_APP_URL` to the tunnel host.
2. Generate a fresh key (the one used on 2026-08-13 is burned — it was pasted
   into a chat transcript). Revoke the old one.
3. Retry the Pirate Ship connection.
4. Read the diagnostic:

   ```sql
   SELECT created_at, path, status_code, body->'_auth' AS auth
   FROM integration_events
   WHERE user_agent ILIKE '%pirate%'
   ORDER BY created_at DESC
   LIMIT 20;
   ```

   - `scheme: "oauth1"` with `"OAuth signature did not verify against any known
     base URL"` → the scheme is right and something about the base string is
     not. Log the reconstructed candidates and compare; a host, a port or a
     trailing slash is the usual culprit.
   - `authHeaderScheme: null`, no query pair, no oauth params → the header is
     being stripped in transit; test against the real Dokploy domain instead of
     the tunnel.
   - `"consumer key matched, consumer secret did not"` → simple paste error.
   - No `%pirate%` rows at all → it never reached us; DNS/TLS/tunnel problem.

### Also fixed along the way

**Admin login appeared broken through the tunnel.** Not a password problem —
the password hash verified correctly the whole time. Next.js dev refuses to
serve `/_next/*` chunks cross-origin, so the login page rendered as HTML (200)
but never hydrated, leaving the form inert. Added `allowedDevOrigins` to
`next.config.js` for `*.trycloudflare.com`, `*.ngrok-free.app` and `*.ts.net`.
Dev-only; production builds are unaffected. Added
`scripts/reset-admin-password.mjs` (bcrypt cost 12, also clears the 5-strike
lockout in `admin_login_attempts`).

---

## 1. Why a shim

Pirate Ship has **no public REST API**. `lib/shipping.ts` is written against `https://api.pirateship.com/v1` — that host and its `/rates`, `/shipments`, `/tracking`, `/pickups` endpoints do not exist. `PIRATESHIP_API_KEY` is set in no environment, so `getShippingRates()` falls through to `getEstimatedRates()` and **customers are currently quoted prices from a hardcoded 3-zone table with no error raised**.

Pirate Ship ingests orders only through platform integrations. Their list: Big Cartel, BigCommerce, Cratejoy, Discogs, eBay, Ecwid, PayPal, Shopify, Square, Squarespace, Subbly, Wix, WooCommerce.

**WooCommerce is the only one where the merchant supplies their own base URL.** Every other option is OAuth against the vendor's domain — Shopify wants a `.myshopify.com` install, BigCommerce a store hash on `api.bigcommerce.com`, Big Cartel a subdomain. None can point at `modestummah.com`.

WooCommerce connection form asks for exactly three things:

| Field | Value we supply |
|---|---|
| Store URL | `https://<our-domain>` |
| Consumer Key | `ck_…` we generate |
| Consumer Secret | `cs_…` we generate |

Requirements Pirate Ship states: valid SSL certificate, WooCommerce ≥ 3.5, WordPress ≥ 4.4.

And it is **two-way**: after a label is bought, Pirate Ship marks the order Completed in WooCommerce and writes the tracking number back as an order note (or customer note, per their setting).

Refs:
- <https://www.pirateship.com/integrations/woocommerce>
- <https://support.pirateship.com/en/articles/1515789-how-does-the-woocommerce-integration-work>
- <https://woocommerce.github.io/woocommerce-rest-api-docs/>

---

## 2. Architecture

```
                     Basic auth  ck / cs
 Pirate Ship  ──────────────────────────────►  GET  /wp-json/wc/v3/orders
                                               GET  /wp-json/wc/v3/orders/{wooId}
                                               GET  /wp-json/wc/v3/products/{wooId}

              ◄──────────────────────────────  PUT  /wp-json/wc/v3/orders/{wooId}   {status:"completed"}
                  writes status + tracking      POST /wp-json/wc/v3/orders/{wooId}/notes

                                                        │
                                                        ▼
                                          lib/woo/writeback.ts
                                          → orders.status = 'shipped'
                                          → orders.trackingNumber / carrier / labelUrl
                                          → sendShippingNotification()  (lib/email.ts:203)
```

Route handlers live at `app/wp-json/…`, **not** `app/api/wp-json/…` — App Router `route.ts` works at any path, and the path must match WordPress exactly.

New modules:

| File | Responsibility |
|---|---|
| `lib/woo/auth.ts` | ck/cs verification, Woo-shaped errors |
| `lib/woo/serialize.ts` | our row → Woo JSON |
| `lib/woo/writeback.ts` | Woo JSON → our row |
| `lib/parcel.ts` | single parcel/weight calculator |
| `lib/address.ts` | `ShippingAddressDB` → carrier / Woo shapes |
| `app/wp-json/[...path]/route.ts` | catch-all logger (build first) |

---

## 3. Schema changes

### `orders` — new columns

| Column | Type | Notes |
|---|---|---|
| `wooId` | `integer` identity, unique | **Woo IDs are ints, ours are uuid.** Pirate Ship PUTs to `/orders/{int}`. Mandatory. |
| `trackingNumber` | `text` | |
| `trackingCarrier` | `text` | |
| `labelUrl` | `text` | |
| `shipmentId` | `text` | Pirate Ship's id, for later void/refund |
| `shippedAt` | `timestamp` | |
| `deliveredAt` | `timestamp` | |
| `externalSource` | `text` | `'pirateship'` |

Nothing fulfillment-related exists today. `ShipmentLabel` (`lib/shipping.ts:52`) is the right shape and is currently returned into the void.

### `products`

Add `wooProductId` (`integer` identity, unique) and `lengthIn` / `widthIn` / `heightIn` (`numeric(8,2)`).
`weight` already exists but is **NULL on every row** — document its unit as **ounces**. Keep the free-text `dimensions` column for back-compat; stop writing it.

### `OrderItem` (jsonb, `lib/schema.ts:178`)

Add `weightOz?: number` — snapshot at checkout so historical orders keep the weight they were priced at.

### New tables

**`api_keys`** — mirrors `woocommerce_api_keys`:
`id`, `description`, `consumerKeyHash`, `consumerSecretHash`, `truncatedKey`, `permissions` (`read` | `read_write`), `lastAccess`, `createdAt`, `revokedAt`.
Index on `consumerKeyHash`.

> sha256, **not bcrypt**. Keys are 40 hex chars of CSPRNG entropy — there is nothing to brute force, and bcrypt on every request would be a self-inflicted DoS.

**`order_notes`** — `id`, `orderId`, `note`, `customerNote` (bool), `author`, `createdAt`.

**`integration_events`** — `id`, `source`, `method`, `path`, `statusCode`, `body` (jsonb), `createdAt`. Follows the `stripe_events` audit precedent.

Migration: generate one (`db:generate`) even though the project's habit is `db:push` — these are additive columns on a production table.

---

## 4. Authentication

WooCommerce over HTTPS uses **HTTP Basic** — consumer key as username, secret as password. Query-string `?consumer_key=…&consumer_secret=…` is the documented fallback for servers that strip the `Authorization` header. Support both.

**OAuth 1.0a one-legged is also accepted** (`lib/woo/oauth.ts`), on any transport. WooCommerce documents it as the plain-HTTP scheme, but a client may sign regardless — and one apparently does. Signed requests carry no `Authorization` credentials at all; the key is proven by the signature.

Implementation notes:

- Key format mimics Woo: `ck_` + 40 hex, `cs_` + 40 hex.
- Basic/query: look up by `sha256(ck)`, then `crypto.timingSafeEqual` on `sha256(cs)`.
- OAuth: look up by `sha256(oauth_consumer_key)`, decrypt `consumer_secret_enc`, recompute the HMAC, compare in constant time, then consume the nonce. Signature first, nonce second.
- Both paths share the permission check and the `lastAccess` stamp.
- `permissions: 'read'` rejects every non-GET.
- Rate-limit auth failures by IP (60 / 15 min), reusing the `lib/admin-login-guard.ts` pattern.

Errors must be **Woo-shaped** — clients branch on `code`, not on the HTTP status alone:

```json
{ "code": "woocommerce_rest_cannot_view",
  "message": "Sorry, you cannot list resources.",
  "data": { "status": 401 } }
```

| Situation | `code` | status |
|---|---|---|
| No/bad credentials | `woocommerce_rest_authentication_error` | 401 |
| Read key attempting write | `woocommerce_rest_cannot_edit` | 403 |
| Unknown route | `rest_no_route` | 404 |
| Unknown order | `woocommerce_rest_invalid_order_id` | 404 |

### Security requirements

This publishes customer PII — names, street addresses, emails, phone numbers — to the public internet.

- Every `/wp-json/*` handler calls the verifier as its **first statement**. `middleware.ts` matches only `/admin/*` and `/account/*` and will not cover these routes.
- **Two exceptions, both discovery:** `/wp-json` and `/wp-json/wc/{version}` serve anonymous callers (`allowAnonymous: true`), matching WordPress. They return a site name, a namespace list and a route listing — no customer data. Presented credentials are still verified. See §0 Finding 3 for why this is required, not optional.
- Issue exactly one `read_write` key, for Pirate Ship.
- Display the secret once, at creation. Never again.
- `WOO_SHIM_ENABLED` env kill switch, checked before auth.

**Pre-existing holes to close in the same pass:**
`app/api/shipping/rates/route.ts` and `app/api/shipping/tracking/[trackingNumber]/route.ts` have no auth at all — the tracking route is an open proxy to the carrier account.

---

## 5. Endpoints

### Build the catch-all first

`app/wp-json/[...path]/route.ts` — authenticate, record method/path/query/body to `integration_events`, return Woo-shaped `rest_no_route` 404.

Pirate Ship's exact call sequence is undocumented. Ship the logger, connect the integration, read the table, then implement precisely what it asked for. **Every `rest_no_route` row is a missing endpoint — that list is the real spec.**

### Endpoint table

| Method | Path | Purpose |
|---|---|---|
| GET | `/wc-auth/v1/authorize` | **key exchange** — consent screen; mints a key and POSTs it to the app's callback. Not under `/wp-json`; see §0 Finding 4 |
| GET | `/wp-json` | WP index — `name`, `url`, `home`, `namespaces:["wp/v2","wc/v3"]`, `authentication:{}`. **Anonymous** |
| GET | `/wp-json/wc/v3` | namespace index. **Anonymous** — this is Pirate Ship's connection probe |
| GET | `/wp-json/wc/v3/system_status` | **version gate** — see below |
| GET | `/wp-json/wc/v3/settings/general` | store origin address |
| GET | `/wp-json/wc/v3/orders` | list, paginated |
| GET | `/wp-json/wc/v3/orders/{id}` | single |
| PUT/POST | `/wp-json/wc/v3/orders/{id}` | **writeback** — status + meta |
| GET/POST | `/wp-json/wc/v3/orders/{id}/notes` | **writeback** — tracking note |
| GET | `/wp-json/wc/v3/products` · `/products/{id}` | weight + dimensions for parcel sizing |

`system_status` must report `environment.version` (WooCommerce) and `environment.wp_version` above the 3.5 / 4.4 floors, plus `settings.currency: "USD"`. Report a plausible recent pair — e.g. WC `9.4.0`, WP `6.7` — not the bare minimum.

`settings/general` returns `woocommerce_store_address`, `_address_2`, `_city`, `_postcode`, `default_country`, sourced from the `PIRATESHIP_ORIGIN_*` env vars `lib/shipping.ts:63` already reads.

### Orders list

Honor: `status`, `after`, `before`, `modified_after`, `page`, `per_page` (cap 100), `order`, `orderby`, `search`.

**Must send `X-WP-Total` and `X-WP-TotalPages` headers.** Every Woo client paginates off these; omitting them is the classic "only the first page ever imports" bug.

**Only expose orders where `paymentStatus = 'paid'`.** Rows are inserted *before* payment with `status: 'pending_payment'` (`app/api/checkout/create-payment-intent/route.ts`) — an unpaid order must never reach a label queue.

---

## 6. Field mappings

### Order status

| ours (`order_status`) | Woo |
|---|---|
| `pending`, `pending_payment` | `pending` |
| `processing` | `processing` |
| `shipped`, `delivered` | `completed` |
| `cancelled` | `cancelled` |
| *(`paymentStatus = 'refunded'`)* | `refunded` |

Inbound (writeback): `completed` → `shipped`, `cancelled` → `cancelled`, `refunded` → ignore (Stripe owns that transition).

### Order envelope

Woo importers break on missing keys, so emit the full envelope even where values are empty:

`id` (= `wooId`), `parent_id: 0`, `number` (= `orderId`), `order_key`, `created_via: "checkout"`, `version`, `status`, `currency: "USD"`, `date_created`, `date_created_gmt`, `date_modified`, `date_modified_gmt`, `date_paid`, `date_paid_gmt`, `date_completed`, `discount_total`, `discount_tax`, `shipping_total`, `shipping_tax`, `cart_tax`, `total`, `total_tax`, `prices_include_tax: false`, `customer_id`, `billing`, `shipping`, `payment_method: "stripe"`, `payment_method_title`, `transaction_id` (= `paymentIntentId`), `customer_note`, `line_items`, `tax_lines`, `shipping_lines`, `fee_lines`, `coupon_lines`, `refunds`, `meta_data`.

Two format traps:

- **Dates are naive local ISO** — `2026-08-14T10:00:00`, no `Z`, no offset. The `_gmt` variant carries UTC, also naive.
- **All monetary values are strings** — `"12.99"`. Convenient: our `numeric` columns already come out of Drizzle as strings.

There is no `currency` column; it is hardcoded `'usd'` in `lib/stripe.ts` and the payment-intent route. Emit `"USD"`.

### Address

`ShippingAddressDB` (`lib/schema.ts:189`) → Woo `billing` / `shipping`:

| ours | Woo |
|---|---|
| `firstName` | `first_name` |
| `lastName` | `last_name` |
| — | `company` (`""`) |
| `address1` | `address_1` |
| `address2` | `address_2` |
| `city` | `city` |
| `state` | `state` |
| `postalCode` | `postcode` |
| `country` | `country` |
| `phone` | `phone` |
| `orders.email` | `email` *(billing only)* |

Customer email lives on `orders.email`, not reliably inside the address blob — read the column.

The same DB→carrier mapping is currently copy-pasted at `lib/pricing.ts:109-120`, `app/api/shipping/rates/route.ts:26-35`, and `app/api/webhooks/stripe/route.ts:112-119`. Collapse into `lib/address.ts`.

### Line items

`OrderItem` → Woo `line_items[]`: `id`, `name`, `product_id` (= `wooProductId`), `variation_id: 0`, `quantity`, `subtotal`, `subtotal_tax`, `total`, `total_tax`, `taxes: []`, `sku`, `price`, `meta_data`.

We have no variant model — `colors`/`sizes` are plain JSONB arrays on the product. Surface the chosen `color` / `size` as `meta_data` entries so they print on the packing slip.

`shipping_lines[]`: single entry, `method_id` from `orders.shippingService`, `total` from `orders.shipping`.

---

## 7. Writeback

`lib/woo/writeback.ts`, triggered by `PUT /orders/{id}` and `POST /orders/{id}/notes`. Also accept `POST` + `X-HTTP-Method-Override: PUT`.

1. `status: "completed"` → `status = 'shipped'`, `shippedAt = now()`.
2. Scan `meta_data` for `_tracking_number`, `tracking_number`, `_tracking_provider`, `_wc_shipment_tracking_items`.
3. On a note POST, persist to `order_notes` and extract the tracking number by regex:
   - USPS `9[0-5]\d{20}`
   - UPS `1Z[0-9A-Z]{16}`
   - FedEx 12–22 digits

   Infer carrier from the match.
4. Persist tracking / carrier / labelUrl / shipmentId, then call **`sendShippingNotification()`** (`lib/email.ts:203`). It already builds USPS/UPS/FedEx tracking URLs and has **never been called once**, while `app/faq/page.tsx:30` promises customers exactly this email. Needs `BREVO_API_KEY`, currently unset.
5. Idempotent — no-op when `trackingNumber` is unchanged. Log to `integration_events` regardless.

This writes through Drizzle directly: it is an API-key request, not an admin session, so it cannot route through `updateOrderAction()`.

Related fixes in `lib/actions/order.actions.ts`:
- `updateOrderAction` (`:127-130`) whitelists only `status`/`paymentStatus`/`paymentIntentId`/`notes` — widen it so an admin can enter a tracking number manually.
- `mapOrder` (`:35-55`) **drops `shippingService`**, so the admin UI cannot see which service the customer paid for. Add it.

---

## 8. Weights and parcel sizing

Pirate Ship buys postage at whatever weight we report. Today every weight is a fabricated **8 oz**, duplicated across five files:

`lib/shipping.ts:444` · `lib/pricing.ts:126` · `lib/admin-helpers.ts:281` · `app/admin/orders/page.tsx:105` · `components/checkout/checkout-form.tsx:194`

…with two different hardcoded parcels (10×7×1 vs 12×9×4). This is a money bug, not a tidiness one.

- `products.weight` and `dimensions` are **never written** — `createProductAction` / `updateProductAction` (`lib/actions/product.actions.ts:131-186`) omit them and no admin form has the inputs. Add weight (oz) + L/W/H to `components/admin/product-form.tsx` and `product-editor.tsx`, widen both actions.
- New `lib/parcel.ts` → `computeParcel(items)`: sum real per-item weights, fall back to 8 oz only when NULL, select from the existing `PACKAGE_PRESETS` (`lib/shipping.ts:77`). Single caller for pricing, the rates route, the CSV export, and the Woo product payload.
- Snapshot `weightOz` onto each `OrderItem` in `resolveCheckoutOrder()` (`lib/pricing.ts:88-97`).

Side benefit: `resolveCheckoutOrder()` currently calls `getShippingRates()` a *second* time after the client already hit `/api/shipping/rates`, with a different parcel — so the quote shown and the amount charged can diverge. One `computeParcel` closes that.

---

## 9. Admin UI

- `app/admin/settings/page.tsx:63-64` hardcodes the string `"Pirate Ship: Manual Export"`. Replace with a live card: generate/revoke API keys, display the store URL to paste into Pirate Ship, show `lastAccess` and recent `integration_events` as a sync log.
- `app/admin/orders/[id]/page.tsx` — tracking number as a carrier link, carrier, label URL.
- Keep CSV export as fallback, but delete the divergent client-side copy at `app/admin/orders/page.tsx:58-137` (defaults weight to 16 oz where the server copy can emit 0) and point the buttons at the already-admin-authed `app/api/admin/orders/export/route.ts`.

---

## 10. Operator runbook

**Connecting** — no key is generated by hand; Pirate Ship asks for one.

1. Sign in to `/admin` first. The flow lands on a consent screen that needs an
   admin session, and doing it in advance avoids the sign-in detour.
2. In Pirate Ship: Settings → Integrations → **Connect New Source** → WooCommerce.
3. Store URL = `https://<our-domain>` (no trailing slash, no `/wp-json`). Connect.
4. Pirate Ship redirects to `/wc-auth/v1/authorize`. Check the app name and the
   destination host on the screen, then **Approve**. The key is minted, POSTed
   straight to Pirate Ship, and never displayed — there is nothing to copy.
5. Confirm the new row in Admin → Settings → Pirate Ship, described
   `Pirate Ship (auth endpoint)`.

The **Generate API Key** button on that card remains for manual entry — Pirate
Ship's "Enter credentials manually" fallback, and for testing with curl or
`scripts/woo-smoke.mjs`.

**Local testing**

```bash
cloudflared tunnel --url http://localhost:3000
```

Pirate Ship requires a valid certificate, so a tunnel is mandatory — `localhost` will not connect. Use the tunnel hostname as the Store URL.

**Debugging a failed import**

```sql
SELECT method, path, status_code, created_at
FROM integration_events
ORDER BY created_at DESC
LIMIT 50;
```

- `status_code = 404` / `rest_no_route` → endpoint we have not implemented yet. Implement it.
- `status_code = 401` → key revoked, or the `Authorization` header is being stripped upstream; fall back to query-string credentials.
- No rows at all → Pirate Ship never reached us. Check DNS, SSL chain, and `WOO_SHIM_ENABLED`.
- Rows present but no orders imported → check the `paymentStatus = 'paid'` filter and the `X-WP-Total` headers.

---

## 11. Verification

1. **Unit** — `lib/woo/serialize.test.ts`: assert serialized output against a fixture captured from a real WooCommerce install, field for field, including naive-ISO dates and string decimals.
2. **Contract** — `scripts/woo-smoke.mjs` against `localhost:3000`: 56 assertions covering discovery, the version gate, pagination headers, serialization formats, writeback, and both auth schemes. Its OAuth signer is written from RFC 5849 rather than importing `lib/woo/oauth.ts`, so the test cannot agree with the server about a shared mistake; it reproduces what the `oauth-1.0a` package behind the official WooCommerce clients emits.

   Rejection cases run **last** on purpose — each one counts against the server's auth-failure rate limit, and a 429 would mask the 401 being asserted.

   The writeback block needs a `paymentStatus = 'paid'` order to exist; with none it skips, so seed one before trusting a green run.
3. **curl** — 401 on bad key; 200 on good; `X-WP-Total` / `X-WP-TotalPages` present; `?status=processing&after=…` filters; `read`-only key rejected on PUT.
4. **Live** — connect via tunnel, confirm the order imports with correct address and weight, buy one label, confirm the order flips to `shipped`, tracking lands in `orders.trackingNumber`, and the Brevo email sends. **Unused labels are refundable within 30 days**, so a real test label costs nothing.
5. Re-read `integration_events` after every attempt.

---

## 12. Environment variables

Missing from `.env`, `.env.example`, the `docker-compose.yml` passthrough list, and the Dokploy environment — all of them:

```
PIRATESHIP_ORIGIN_NAME
PIRATESHIP_ORIGIN_COMPANY
PIRATESHIP_ORIGIN_STREET1
PIRATESHIP_ORIGIN_STREET2
PIRATESHIP_ORIGIN_CITY
PIRATESHIP_ORIGIN_STATE
PIRATESHIP_ORIGIN_ZIP
PIRATESHIP_ORIGIN_PHONE
PIRATESHIP_ORIGIN_EMAIL
BREVO_API_KEY
WOO_SHIM_ENABLED
NEXT_PUBLIC_APP_URL
```

`WOO_SECRET_ENC_KEY` (32 bytes of hex) is optional — unset, the secret-box key
is derived from `JWT_SECRET`. Set it explicitly in production if `JWT_SECRET`
may be rotated independently; rotating either invalidates OAuth for existing
keys, which must then be regenerated.

Until the origin vars are set, `lib/shipping.ts:63` falls back to the placeholder **123 Business St, New York, NY 10001** — which would print on real labels.

`PIRATESHIP_API_KEY` becomes obsolete. Leave `getEstimatedRates()` in place as the checkout quote engine: the shim delivers labels and tracking, not live rate quotes.

---

## 13. Open risks

| Risk | Mitigation |
|---|---|
| Pirate Ship's call sequence is undocumented | Catch-all logger ships first; they enumerate their own requirements |
| Checkout quotes stay estimates | Shim gives labels, not quotes. Real-time quoting is a separate EasyPost/Shippo decision; `getShippingRates()` is a clean seam |
| Deeper WooCommerce version sniffing than `system_status` | Logger reveals it, we extend |
| Public PII surface | Section 4. The single most important thing to get right on review |
| Presenting as a WooCommerce install | Compatibility layer, not merchant impersonation — but the reported WC/WP version strings are fabricated. Conscious, accepted |
