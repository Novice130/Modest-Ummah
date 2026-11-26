# Load tests for Modest Ummah (Locust + Faker)

Read `GUIDE.md` first for the rules. This file is the how-to.

**Nothing here has been run against staging yet.** Staging did not exist when
the code was written. The files were checked only for syntax, for loading, and
for the two safety guards (see the end).

## Files

| File | What it is |
|---|---|
| `locustfile.py` | The three everyday journeys: `Browser`, `Shopper`, `GuestBuyer` |
| `scenarios.py` | The bulk cases: many one-order users, huge orders, one scarce product |
| `common.py` | Shared code: the guards, fake people, the Stripe step, counters |
| `requirements.txt` | `locust==2.46.7`, `faker==40.43.0` (`requests` comes with Locust) |
| `NOTES.md` | Where results go, one entry per session |

## Must be true on staging before any checkout run

- Stripe: `STRIPE_SECRET_KEY` starts `sk_test_`, the publishable key `pk_test_`.
- A sandbox webhook points at `https://staging.modestummah.com/api/webhooks/stripe`
  (events `payment_intent.succeeded`, `payment_intent.payment_failed`,
  `charge.refunded`), `STRIPE_WEBHOOK_SECRET` is its signing secret, and
  Cloudflare Access has a Bypass for that one path.
- `BREVO_API_KEY` not set. `PIRATESHIP_API_KEY`, `TAXCLOUD_API_LOGIN_ID`,
  `TAXCLOUD_API_KEY` not set. `WOO_SHIM_ENABLED` not `true`.
- `DATABASE_URL` is the Neon staging branch. `JWT_SECRET` differs from production.
- Walk one checkout by hand first (GUIDE.md, Method step 2).

## Setup on the VM

```sh
cd /opt/loadtest/modestummah
/opt/loadtest/venv/bin/pip install -r loadtest/requirements.txt
set -a; . /opt/loadtest/.env; set +a      # CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET, STRIPE_TEST_SECRET_KEY
export LOADTEST_RUN_ID=smoke-1             # optional; default is a timestamp
mkdir -p results
L="/opt/loadtest/venv/bin/locust -f loadtest/locustfile.py --host https://staging.modestummah.com"
```

Every request to the site carries the header `X-Loadtest-Run: <LOADTEST_RUN_ID>`.
Change one thing between runs. Open the site (or run the smoke) just before a
measured run so Neon is awake.

## The runs

```sh
# Smoke: 1 user, 1 minute. Zero failures expected.
$L --headless -u 1 -r 1 -t 1m --csv results/smoke --html results/smoke.html

# Baseline: about 10 users, 5 minutes.
$L --headless -u 10 -r 2 -t 5m --csv results/baseline --html results/baseline.html

# Load: ramp to the busy-day number the owner gives you, hold 10 minutes.
$L --headless -u <N> -r 5 -t 12m --csv results/load --html results/load.html

# Stress: repeat with a higher -u each time until p95 passes 1 s or errors start.
$L --headless -u 40 -r 5 -t 5m --csv results/stress-40

# Spike: many users start at once, then watch whether it recovers.
$L --headless -u 100 -r 100 -t 5m --csv results/spike

# Only anonymous browsing, no payments (no Stripe key needed):
$L --headless -u 20 -r 5 -t 5m Browser

# Web page instead of headless: run $L, then open http://vm-loadtest:8089
```

`-u` users, `-r` users started per second, `-t` duration.

## Bulk scenarios

```sh
S="/opt/loadtest/venv/bin/locust -f loadtest/scenarios.py --host https://staging.modestummah.com"

# 1000 buyers, one order each. Run twice: guests, then with sign-up.
# LOADTEST_TARGET_ORDERS ends the run when that many users have finished.
LOADTEST_TARGET_ORDERS=1000 $S --headless -u 1000 -r 20 -t 30m OneOrderGuest
LOADTEST_TARGET_ORDERS=1000 $S --headless -u 1000 -r 20 -t 30m OneOrderShopper

# A few buyers, very large orders (50 lines x quantity 99 by default).
$S --headless -u 3 -r 1 -t 10m BigOrder

# Many buyers, one scarce product. Use more users than stock.
SCARCE_SLUG=<product-slug> SCARCE_STOCK=<its stock_quantity now> LOADTEST_TARGET_ORDERS=<users> \
  $S --headless -u <2 x stock> -r 50 -t 10m ScarceProduct
# Same with sign-up and read-back: class ScarceProductShopper
```

Settings: `BIG_ORDER_LINES` (50, max), `BIG_ORDER_QTY` (99), `BIG_ORDERS_PER_USER` (1),
`SCARCE_QTY` (1). More than 50 lines needs the owner's go-ahead and
`LOADTEST_ALLOW_OVER_50_LINES=yes`. Stripe refuses an amount over $999,999.99,
so a huge order may fail at "start payment"; the failure text will say why.

## What each journey does

- **Browser** (weight 7): home, shop, a category page, a product page, and the
  `/api/v1` catalogue calls behind them (categories, list, featured, new
  arrivals, one product, related, search). No account.
- **Shopper** (weight 2): sign up, browse, save bag, read bag, shipping quote,
  tax quote, start payment, pay on Stripe, poll the order until `paid`, list
  orders. Also profile and sign-in (the sign-in row is bcrypt-heavy: judge it
  on its own).
- **GuestBuyer** (weight 1): no account. Quote, start payment, pay. There is
  no order endpoint for guests, so `paid` is checked in the database after.

Rows named `stripe confirm` (Stripe's speed) and `order status (poll)`
(webhook delivery time) are not the site's speed. Leave them out of the
site's numbers.

## Safety built in

1. The host must be exactly `https://staging.modestummah.com`. Anything else
   stops the run before any request (checked at start, again when the run
   starts, and again for every simulated user).
2. Classes that pay refuse to start unless `STRIPE_TEST_SECRET_KEY` starts with
   `sk_test_`. Every Stripe answer must say `livemode: false`. If one says
   `true`, or Stripe cannot find the intent (what a live-mode intent looks like
   to a test key), the whole process stops at once.
3. Stripe pacing: confirms are capped at `STRIPE_MAX_CONFIRMS_PER_SEC` (10) per
   process, because the sandbox allows about 25 requests a second and the site
   also makes one per checkout. The cap is printed when the run starts and in
   the end summary. With several Locust workers it applies per worker, so
   divide it. If the rate sits at the cap, Stripe is the limit, not the site.
4. All emails end `@loadtest.invalid`; addresses come from Faker `en_US`; the
   only card is Stripe's test method `pm_card_visa`.

## After a run

When Locust stops it prints a summary: starts accepted, successful confirms,
orders read as paid, units per product. It also writes
`results/orders-<run>-<pid>.csv` (every order id and payment intent) and
`results/counts-<run>-<pid>.json`. Compare with the SQL in `GUIDE.md`:
Locust confirms, Stripe sandbox succeeded payments, and `paid` orders should
all be equal. For stock: before, minus units sold, should equal after. For the
scarce product the summary prints what the arithmetic predicts.

## Where the code differs from the guide

Checked against commit `893608b` (the guide was written at `78ab1bb`).

1. `POST /api/v1/checkout/payment-intent`: `orderId` is now optional (the
   server makes one if missing, `create-payment-intent/route.ts:42`). The
   response still does not return it, so the test keeps sending its own `LT-`
   id.
2. The order endpoint hides `paymentIntentId` (`orders/[id]/route.ts:46`) and
   needs a signed-in owner (`:16`), so guests cannot be polled at all.
3. The guide says the checkout 500s on bad input; confirmed
   (`create-payment-intent/route.ts:114`), but a missing email is a 400 (`:57`).
4. Errors from `/api/v1` routes built by `lib/api/v1/http.ts:24` look like
   `{ error: { message, code } }`; the checkout and shipping/tax handlers
   return `{ error: "text" }` instead. The test checks status first.
5. Session: bearer token or `auth_token` cookie; the cookie wins if both are
   sent (`lib/auth.ts:130`). The v1 routes set no cookie, so the test uses
   bearer only. No Origin or CSRF check exists in `proxy.ts`, `lib/auth.ts` or
   the routes.
6. Product payloads carry `price` as a string (`serializers.ts:67`); the tax
   quote needs a number, so the test converts it.
7. Checkout caps each line at quantity 99 silently (`lib/pricing.ts:117`).

Nothing else disagreed: methods, paths, body fields, success codes (201 for
register, 200 elsewhere) and `paymentStatus` / `paymentIntentId` /
`clientSecret` fields match the guide.

## Checked offline only

`python -m py_compile` on each file; `locust --list`; a wrong `--host` and a
non-`sk_test_` key both exit before any request, counted with a harness that
refuses every network call.
