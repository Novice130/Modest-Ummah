# Modest Ummah: Locust and Faker testing guide

Adapted on 2026-10-13 from the shared guide at
`infra/gmktec/loadtest/LOCUST_GUIDE.md`, by reading this repo at commit
`78ab1bb`. Every path, body and status code below comes from the code, not
from a run. Nothing here has been executed yet. If the code has moved on,
re-read the files named in each section before trusting it.

It is written for the Claude session working in this project and for the
owner reading along.

## Status

- `staging.modestummah.com` and the load-test VM (`vm-loadtest`) are designed
  in `infra/docs/superpowers/specs/2026-10-13-gmktec-staging-design.md` but
  were not built when this was written. Code reading and writing the
  locustfile can happen now. Runs wait for staging.
- `loadtest/locustfile.py`, `loadtest/README.md`, `loadtest/NOTES.md` and
  `docs/STAGING_AND_LOADTEST.md` do not exist yet.

## Instructions for the assistant

You are helping the owner test how reliable this shop is, using Locust (load
testing, Python) and Faker (realistic fake names, emails, addresses). The
owner is learning. Run things together with him, explain what each number
means in plain words, and keep notes.

### Rules that do not bend

1. **Staging only.** The only site target is `https://staging.modestummah.com`.
   Never `modestummah.com`, `www.` or `next.`. Keep the guard in the skeleton
   at the top of every locustfile.
2. **One outside host is allowed: `api.stripe.com`, sandbox key only.** See
   "Payments" for why the test has to call it.
3. **One site at a time.** The load-test VM and the staging sites share one
   physical machine. Two runs at once spoil both sets of numbers.
4. **No real people.** The staging database is a Neon branch copied from
   production, so real customers and real orders are in it. Every test user
   and every guest order uses an email ending in `@loadtest.invalid`. Never
   sign in as an existing account. `DELETE /api/v1/me` only ever on a user the
   test created.
5. **Start small.** One user first. Raise load only after the journey passes
   cleanly at the level below.
6. **Stop if something outside staging reacts**: a real email arrives, a
   production metric moves, Cloudflare starts blocking, a live-mode object
   appears in Stripe. Report it and wait.
7. **No secrets in the repo.** The Cloudflare Access token and the Stripe
   sandbox key come from the environment on the load-test VM.
8. **Off limits.** Do not send test traffic to any of these:

   | Path | Why |
   |---|---|
   | `/admin/*`, `/api/admin/*`, `/api/data`, `/api/upload` | Admin surface. Admin login locks after 5 failed attempts in 15 minutes per email and per IP (`lib/admin-login-guard.ts`), so a test can lock the owner out |
   | `/wp-json/*`, `/wc-auth/*` | Pirate Ship connector. Returns every paid order with full customer details |
   | `/api/cron/publish` | Publishes scheduled products |
   | `/api/webhooks/stripe` | Only Stripe may post here. Fake events fail the signature check anyway |
   | `/api/auth/google`, `/api/auth/apple` | Not configured on staging. Email and password only |

### Staging settings a checkout test depends on

Check each one before the first checkout run. They decide whether the test
measures this site or something else.

| Setting on `stg-modestummah-web` | Needed value | If wrong |
|---|---|---|
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Start with `sk_test_` / `pk_test_` | Real charges. Do not run |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of a sandbox webhook endpoint pointing at `https://staging.modestummah.com/api/webhooks/stripe`, sending `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` | Payments succeed in Stripe but every order stays `pending_payment` and stock never moves |
| Cloudflare Access | A Bypass policy for the path `/api/webhooks/stripe` only. Stripe cannot send the Access headers | Same as the row above. This bypass is not in the staging design spec yet; raise it with the owner |
| `BREVO_API_KEY` | Not set. `lib/email.ts` then skips the send and logs a warning | Every paid test order sends a confirmation to a `.invalid` address through the real Brevo account, which bounces |
| `PIRATESHIP_API_KEY`, `TAXCLOUD_API_LOGIN_ID`, `TAXCLOUD_API_KEY` | Not set. Checkout then uses the built-in rate and tax estimates | Every checkout calls those services, and the run load-tests them instead of this site |
| `WOO_SHIM_ENABLED` | Not `true` | The connector surface is live on staging |
| `DATABASE_URL` | The Neon `staging` branch host | Test data lands in production |
| `JWT_SECRET` | Different from production | A staging token works on production |

### Where things live

Paths are relative to this repo (`vibe_modest/`).

| Thing | Place |
|---|---|
| This guide | `loadtest/GUIDE.md` |
| Test code | `loadtest/locustfile.py` (more files under `loadtest/` if it grows) |
| How to run, and what each journey covers | `loadtest/README.md` |
| Results and lessons, one entry per session | `loadtest/NOTES.md` |
| Server and staging details | `docs/STAGING_AND_LOADTEST.md` |
| Where it runs | VM `vm-loadtest` (VM 204) on the GMKtec server, under `/opt/loadtest/modestummah/`, using `/opt/loadtest/venv` |
| What is being tested | Container `stg-modestummah-web` (1.5 GB, 2 CPUs) in VM 201 `vm-websites-dokploy` |

## How this site works, for testing purposes

- One Next.js 16 container. No separate API service, no Redis, no queue.
- Database is Neon Postgres through the HTTP driver (`lib/db.ts`). Each query
  is its own HTTPS request to Neon. There is no connection pool to exhaust
  and there are no multi-statement transactions.
- The storefront pages load their data with Server Actions. Those cannot be
  called from Locust: the action ids are tied to the build. The JSON API under
  `/api/v1` (built for the mobile app) runs the same logic, so the test uses
  page GETs for rendering cost and `/api/v1` for everything a person does.
  Results therefore cover the mobile app's backend too.
- Login is a custom JWT (`lib/auth.ts`). `/api/v1/auth/*` returns
  `{ token, user }` and the token goes in `Authorization: Bearer`. The web
  routes `/api/auth/*` do the same work and also set an `auth_token` cookie.
  There is no CSRF token, no email verification, no welcome email, and no
  rate limit on sign-up or login.
- Passwords are hashed with `bcryptjs` at cost 12, which is pure JavaScript
  and runs on the one Node thread.
- Guest checkout is allowed. An order needs an email, not an account.

### Requests

Each needs the two Access headers. "Auth" means the bearer token.

| Step | Request | Body | Success |
|---|---|---|---|
| Pages | `GET /`, `/shop`, `/shop/{category}`, `/product/{slug}` | | 200 HTML |
| Categories | `GET /api/v1/categories` | | 200 |
| Product list | `GET /api/v1/products?page=&perPage=&category=&tag=&q=&sort=&inStock=true` | `perPage` max 60 | 200 `{ items, page, totalItems, totalPages }` |
| Featured, new | `GET /api/v1/products/featured`, `/api/v1/products/new-arrivals` | | 200 `{ items }` |
| One product | `GET /api/v1/products/{slug}`, `/api/v1/products/{slug}/related` | | 200, or 404 `not_found` |
| Sign up | `POST /api/v1/auth/register` | `{ email, password, name }`, password 8+ chars | **201** `{ token, user }`. 409 `email_taken` |
| Sign in | `POST /api/v1/auth/login` | `{ email, password }` | 200 `{ token, user }`. 401 `invalid_credentials` |
| Profile | `GET /api/v1/me` (auth) | | 200 |
| Save bag | `PUT /api/v1/cart` (auth) | `{ items: [{ productId, quantity, variantId?, color?, size? }] }`, max 100 lines, quantity clamped to 1..99 | 200 `{ items }` |
| Read bag | `GET /api/v1/cart` (auth) | | 200 `{ items, updatedAt }` |
| Shipping quote | `POST /api/v1/shipping/rates` | `{ items: [{ productId, quantity }], shippingAddress }`, max 50 lines | 200 `{ success, rates: [{ service, rate }] }` |
| Tax quote | `POST /api/v1/tax/calculate` | `{ items: [{ productId, price, quantity, category }], shippingAddress }` | 200 `{ success, totalTax }` |
| Start payment | `POST /api/v1/checkout/payment-intent` (auth optional) | `{ orderId, items, shippingAddress, customerEmail, shippingService?, couponCode? }` | 200 `{ clientSecret, paymentIntentId, resolvedTotal, ... }` |
| Pay | Stripe, see "Payments" | | `status: succeeded` |
| Order list | `GET /api/v1/orders` (auth) | | 200 `{ items }` |
| One order | `GET /api/v1/orders/{orderId}` (auth) | | 200. Someone else's order is 404 |

`shippingAddress` is `{ firstName, lastName, address1, address2?, city,
state, postalCode, country, phone?, email? }`. `address1`, `city`, `state` and
`postalCode` are required.

### What checkout does (`app/api/checkout/create-payment-intent/route.ts`)

`/api/v1/checkout/payment-intent` re-exports this handler, so both paths are
the same code.

- It rejects any body containing `amount`, `shipping`, `tax` or `discount`
  with 400. Do not send them. Prices, shipping and tax are recomputed from the
  database in `lib/pricing.ts`.
- The response does not include the order id. Send your own `orderId`
  (the web checkout does the same), or the test cannot look the order up
  afterwards. Use `LT-` plus random characters so test orders are easy to find.
- It inserts the order row first, with status `pending_payment`, then creates
  the Stripe PaymentIntent. Every call leaves an order row whether or not it
  is ever paid.
- Bad input (empty cart, unknown product, incomplete address, bad coupon) is
  thrown inside the handler and comes back as **500** with the message in
  `error`, not as 400. A mistake in the test looks like a server error, so
  read the body before calling a 500 a fault.
- Stock is not checked here. It is only reduced later, by the webhook.
- The owner of the order comes from the token, never from the body.
- Shipping is free when the subtotal after discount is $75 or more. Without
  Pirate Ship configured the services are `usps_ground_advantage`,
  `usps_priority`, `usps_priority_express`.
- `/api/v1` product payloads carry `inStock` but no variant ids and no stock
  quantity. Order by `productId` alone; the parent product's price and stock
  are then used.

### Payments

The server creates the PaymentIntent and stops. In the browser, Stripe.js
confirms it (`components/checkout/checkout-form.tsx`). Nothing on this site
confirms a payment, so a Locust user that only calls this site never produces
a paid order, a stock change or a webhook.

To complete the journey the test confirms the intent itself against the
Stripe sandbox API. This is Stripe's API, not its hosted pages:

```sh
curl https://api.stripe.com/v1/payment_intents/$PAYMENT_INTENT_ID/confirm \
  -u "$STRIPE_TEST_SECRET_KEY:" \
  -d payment_method=pm_card_visa \
  -d return_url=https://staging.modestummah.com/checkout/success
```

`return_url` is needed because the intent is created with
`automatic_payment_methods` enabled. Expect `"status": "succeeded"`. Try this
by hand in step 2 of the method before building on it.

- `STRIPE_TEST_SECRET_KEY` lives in `/opt/loadtest/.env`. The locustfile
  refuses to start unless it begins with `sk_test_`.
- Send it from a separate HTTP session, so the Cloudflare Access token is
  never sent to Stripe. The skeleton does this.
- Stripe then posts `payment_intent.succeeded` to the staging webhook, which
  marks the order `paid` / `processing`, reduces stock, counts the coupon and
  empties the user's saved bag. The test polls `GET /api/v1/orders/{orderId}`
  until `paymentStatus` is `paid`. That wait is the webhook's delivery time.
- Stripe's sandbox allows about 25 requests a second. One checkout is two
  Stripe calls (create, confirm), so roughly 12 paid orders a second is the
  ceiling whatever this site can do. When a run hits it, write that Stripe
  was the limit; do not read it as a fault in the site.
- Card `4242 4242 4242 4242`, any future expiry, any CVC, is for the by-hand
  browser walk only.

## Method

Work through these in order. Do not skip ahead.

1. **Read the code again** if the commit is not `78ab1bb`. Confirm the
   request table with the owner and agree which journey goes first.
2. **Walk it by hand once.** A real checkout in a browser on staging with the
   network tab open, then the same requests with `curl`, including the Stripe
   confirm above. Confirm the order turns `paid` in the staging database.
3. **Write the journeys** from the skeleton. Check status and a piece of the
   body on every response.
4. **Smoke: 1 user, 1 minute.** Zero failures. In the staging database, the
   test user, its order (`paid`) and a `stripe_events` row exist.
5. **Baseline: about 10 users, 5 minutes.** Record median, 95th percentile,
   requests per second and failure rate per request name.
6. **Load: ramp to the expected busy-day level, hold 10 minutes.** Ask the
   owner what a busy day is; there is no number in the repo.
7. **Stress: raise users in steps until something gives.** Note where the
   95th percentile passes 1 second and where errors start, and what gave.
8. **Spike: from few users to many in seconds.** Does it recover unaided?
9. **Soak (optional): moderate load for 30 to 60 minutes.** Watch memory
   against the 1.5 GB limit.
10. **Order scenarios** below.
11. **Write up, reset.** Add the entry to `NOTES.md`, then ask the owner
    whether to reset the Neon `staging` branch.

Change one thing between runs. Open the site or run the smoke just before a
measured run: a Neon branch that went idle answers its first request slowly.

While a run is going, watch:

- `docker stats` for `stg-modestummah-web` on VM 201 (CPU against 2 cores,
  memory against 1.5 GB).
- Stripe sandbox dashboard, Developers, Webhooks: failed deliveries.
- The container log for `OVERSOLD`, `CRITICAL: Order not found`,
  `Error updating order`.
- The Neon console for the staging branch's compute.
- GlitchTip, once the staging DSN is set.

### Journeys

| Class | Share | What it does |
|---|---|---|
| `Browser` | most | Anonymous. Home, shop, a category, a product page, and the `/api/v1` catalogue calls behind them |
| `Shopper` | some | Sign up, browse, save bag, shipping quote, tax quote, start payment, pay, wait for `paid`, read order list |
| `GuestBuyer` | few | No account. Quote, start payment, pay. Checked in the database afterwards, since a guest has no order endpoint |

### Order scenarios

**1000 buyers, one order each, inside a few minutes.** Run it twice: once as
`GuestBuyer` so the number is checkout alone, once as `Shopper` so sign-up is
included. Expect Stripe's limit to set the pace.

**A few buyers, very large orders.** Start at 50 lines of quantity 99, the
largest the shipping quote accepts. The payment endpoint itself has no cap on
the number of lines; record that as a finding and ask before going past 50.

**Many buyers, one scarce product.** Pick a test product, note its
`stock_quantity`, and have more buyers than stock order it at once.

After each, check in the staging database:

```sql
-- test orders by state: paid should equal successful confirms in Locust
select status, payment_status, count(*) from orders
where email like '%@loadtest.invalid' group by 1, 2;

-- no payment recorded on two orders
select payment_intent_id, count(*) from orders
where payment_intent_id is not null group by 1 having count(*) > 1;

-- units sold per product in paid test orders
select item->>'productId' as product_id, sum((item->>'quantity')::int) as units
from orders o, jsonb_array_elements(o.items) as item
where o.email like '%@loadtest.invalid' and o.payment_status = 'paid'
group by 1;

-- webhook events handled in the last hour
select type, count(*) from stripe_events
where processed_at > now() - interval '1 hour' group by 1;
```

Then compare three counts: confirms Locust reported as succeeded, succeeded
payments in the Stripe sandbox, and `paid` orders. They should be equal.

For stock, take `select id, stock_quantity from products` before and after.
Stock before, minus units sold, should equal stock after.

### What the code suggests will give first

These come from reading, not from a run. Treat each as a thing to confirm or
rule out, and write the result in the notes.

- **Stock under concurrent orders.** `lib/inventory.ts` reads the quantity,
  subtracts, and writes it back in separate queries. Two webhooks for the
  same product at the same moment can both read the same number, so stock
  ends higher than it should. The result is also clamped at 0, so stock can
  never go negative and the `OVERSOLD` log line can never fire. "Stock did not
  go negative" therefore proves nothing; use the arithmetic check above.
- **Overselling.** Because stock is not checked at checkout, the scarce
  product scenario should sell more units than existed.
- **Sign-up and login.** bcryptjs at cost 12 holds the single Node thread for
  each hash. A burst of sign-ups should slow every other request, including
  page views. Judge these two endpoints separately from the rest.
- **A webhook that fails halfway.** The event id is recorded before the order
  is updated, and errors in the update are caught and logged. A Stripe retry
  is then skipped as a duplicate, so the order can stay `pending_payment`
  although the customer paid. Look for paid intents in Stripe with no `paid`
  order.
- **Coupon limits.** The usage limit is checked at checkout and counted at
  payment, so a limited coupon can be used more times than its limit when
  many buyers use it together.
- **Unpaid orders pile up.** Each call to start a payment inserts an order
  row and creates a PaymentIntent, with no rate limit.
- **Every query is a round trip to Neon.** Checkout makes several in a row
  before it reaches Stripe.

### Reading the numbers (explain these to the owner as they appear)

- **Users**: simulated people, each repeating the journey with pauses.
- **RPS**: requests per second the site is handling.
- **Median (p50)**: what a typical request took.
- **p95 / p99**: what the slowest 5% / 1% took. This is what unlucky users
  feel; it matters more than the average.
- **Failures**: requests that errored or failed a check. Above 1% under normal
  load is a problem to explain.
- **The knee**: the user count where response time stops rising gently and
  shoots up. Capacity is a bit below that.

Starting thresholds, to be tuned: p95 under 800 ms and failures under 1% at
expected load; no 5xx at all in smoke and baseline. Leave `stripe confirm`
and `order status (poll)` out of the site's numbers: the first is Stripe's
speed, the second is webhook delivery time.

Staging shares a home server with the load generator. Numbers compare one
build with another and show what breaks. They are not production capacity:
production has 2 shared vCPUs.

### Skeleton

```python
import os
import random
import time
import uuid
from urllib.parse import urlparse

import gevent
import requests
from faker import Faker
from locust import HttpUser, between, events, task

fake = Faker("en_US")

STAGING_HOST = "staging.modestummah.com"
STRIPE_KEY = os.environ["STRIPE_TEST_SECRET_KEY"]
ACCESS_HEADERS = {
    "CF-Access-Client-Id": os.environ["CF_ACCESS_CLIENT_ID"],
    "CF-Access-Client-Secret": os.environ["CF_ACCESS_CLIENT_SECRET"],
    "User-Agent": "locust-staging-loadtest",
}


@events.init.add_listener
def staging_only(environment, **_):
    """Refuse to start unless the target is staging and Stripe is sandbox."""
    url = urlparse(environment.host or "")
    if url.scheme != "https" or url.hostname != STAGING_HOST:
        raise SystemExit(f"guard: refusing to run against {environment.host!r}")
    if not STRIPE_KEY.startswith("sk_test_"):
        raise SystemExit("guard: STRIPE_TEST_SECRET_KEY is not a sandbox key")


def new_person():
    first, last = fake.first_name(), fake.last_name()
    email = f"lt-{uuid.uuid4().hex[:12]}@loadtest.invalid"
    return {
        "name": f"{first} {last}",
        "email": email,
        "password": fake.password(length=14),
        "address": {
            "firstName": first,
            "lastName": last,
            "address1": fake.street_address(),
            "city": fake.city(),
            "state": fake.state_abbr(include_territories=False,
                                     include_freely_associated_states=False),
            "postalCode": fake.postcode(),
            "country": "US",
            "phone": fake.phone_number(),
            "email": email,
        },
    }


class Shopper(HttpUser):
    wait_time = between(1, 4)  # a person pauses between actions

    def on_start(self):
        self.client.headers.update(ACCESS_HEADERS)
        # Separate session: the Access token must never be sent to Stripe.
        self.stripe = requests.Session()
        self.person = new_person()
        self.products = []
        with self.client.post("/api/v1/auth/register", name="sign up",
                              json={k: self.person[k] for k in ("name", "email", "password")},
                              catch_response=True) as r:
            if r.status_code != 201:
                r.failure(f"sign up {r.status_code}: {r.text[:120]}")
                return
            self.auth = {"Authorization": f"Bearer {r.json()['token']}"}

    @task(5)
    def browse(self):
        self.client.get("/", name="home")
        with self.client.get("/api/v1/products?perPage=24&inStock=true",
                             name="product list", catch_response=True) as r:
            if r.status_code != 200 or "items" not in r.json():
                r.failure(f"product list {r.status_code}")
                return
            self.products = r.json()["items"]
        if self.products:
            slug = random.choice(self.products)["slug"]
            self.client.get(f"/product/{slug}", name="product page")
            self.client.get(f"/api/v1/products/{slug}", name="product json")

    @task(1)
    def buy(self):
        if not self.products:
            return
        picks = random.sample(self.products, k=min(2, len(self.products)))
        items = [{"productId": p["id"], "quantity": 1} for p in picks]
        address = self.person["address"]
        order_id = f"LT-{uuid.uuid4().hex[:16]}".upper()

        self.client.put("/api/v1/cart", name="save bag", headers=self.auth,
                        json={"items": items})
        self.client.post("/api/v1/shipping/rates", name="shipping quote",
                         json={"items": items, "shippingAddress": address})

        # No amount, shipping, tax or discount: the server rejects them.
        with self.client.post("/api/v1/checkout/payment-intent", name="start payment",
                              headers=self.auth, catch_response=True,
                              json={"orderId": order_id, "items": items,
                                    "shippingAddress": address,
                                    "customerEmail": self.person["email"]}) as r:
            if r.status_code != 200 or "paymentIntentId" not in r.json():
                r.failure(f"start payment {r.status_code}: {r.text[:160]}")
                return
            intent_id = r.json()["paymentIntentId"]

        if self.confirm_with_stripe(intent_id):
            self.wait_for_paid(order_id)

    def confirm_with_stripe(self, intent_id):
        """Stands in for Stripe.js in the browser. Reported as its own row."""
        started, response, error = time.perf_counter(), None, None
        try:
            response = self.stripe.post(
                f"https://api.stripe.com/v1/payment_intents/{intent_id}/confirm",
                auth=(STRIPE_KEY, ""), timeout=30,
                data={"payment_method": "pm_card_visa",
                      "return_url": f"https://{STAGING_HOST}/checkout/success"})
            if response.status_code != 200 or response.json().get("status") != "succeeded":
                error = Exception(f"stripe {response.status_code}: {response.text[:160]}")
        except requests.RequestException as exc:
            error = exc
        self.environment.events.request.fire(
            request_type="POST", name="stripe confirm",
            response_time=(time.perf_counter() - started) * 1000,
            response_length=len(response.content) if response is not None else 0,
            response=response, context={}, exception=error)
        return error is None

    def wait_for_paid(self, order_id):
        """The webhook marks the order paid. Poll until it has, up to 15 s."""
        for attempt in range(15):
            with self.client.get(f"/api/v1/orders/{order_id}", headers=self.auth,
                                 name="order status (poll)", catch_response=True) as r:
                paid = r.status_code == 200 and r.json().get("paymentStatus") == "paid"
                if paid or attempt < 14:
                    r.success()
                else:
                    r.failure(f"order {order_id} not paid after 15 s: webhook late or lost")
            if paid:
                return
            gevent.sleep(1)
```

`Browser` and `GuestBuyer` follow the same pattern: `Browser` keeps only the
`browse` task, with `/shop` and a category page added; `GuestBuyer` skips
sign-up and sends no `Authorization` header.

Run with the web UI, then open `http://vm-loadtest:8089` over Tailscale:

```sh
cd /opt/loadtest/modestummah
set -a; . /opt/loadtest/.env; set +a
/opt/loadtest/venv/bin/locust -f loadtest/locustfile.py --host https://staging.modestummah.com
```

Run without the UI, saving results:

```sh
/opt/loadtest/venv/bin/locust -f loadtest/locustfile.py --host https://staging.modestummah.com \
  --headless -u 10 -r 2 -t 5m --csv results/baseline --html results/baseline.html
```

`-u` is users, `-r` is how many users start per second, `-t` is duration.
`/opt/loadtest/.env` needs `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`
and `STRIPE_TEST_SECRET_KEY`.

### Clearing up

Resetting the Neon `staging` branch from its parent removes the test users,
their orders, the `stripe_events` rows, and puts stock back. Ask the owner
first. Payments made in the Stripe sandbox stay there; that is harmless.

### Notes format (`loadtest/NOTES.md`)

One entry per session, newest first:

```
## 2026-10-20: checkout baseline and stress
Build: <commit sha>    Target: https://staging.modestummah.com
Journey: sign up → save bag → start payment → pay → paid
| Run | Users | Ramp | Time | RPS | p50 | p95 | Fail % |
Counts: Locust confirms / Stripe succeeded / paid orders
Found: what broke or slowed, at what load, and the cause if known.
Changed: fixes made as a result (commit).
Learned: what the owner should remember next time, in plain words.
Next: what to test next.
```

Report results as they are. If a run failed or was cut short, write that.
