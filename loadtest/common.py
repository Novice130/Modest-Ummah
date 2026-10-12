"""Shared helpers for the Modest Ummah load tests.

Used by locustfile.py (the three journeys) and scenarios.py (the bulk cases).
Importing this module installs the guards, so every locustfile that imports it
is protected:

  Guard 1 (all classes): the host must be exactly https://staging.modestummah.com
  Guard 2 (classes with confirms_payments = True): STRIPE_TEST_SECRET_KEY must
          start with sk_test_, and every Stripe answer must say livemode=false.
          One live answer stops the whole run at once.

Secrets come from the environment only. Nothing in this file is a secret.
"""

import json
import os
import re
import sys
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from urllib.parse import urlparse

import gevent
import requests
from faker import Faker
from locust import HttpUser, events
from locust.exception import StopUser

fake = Faker("en_US")

STAGING_URL = "https://staging.modestummah.com"
STAGING_HOST = "staging.modestummah.com"
STRIPE_API = "https://api.stripe.com"

# Every request to the site carries this so the run can be found in logs.
RUN_ID = os.environ.get("LOADTEST_RUN_ID") or datetime.now(timezone.utc).strftime(
    "%Y%m%dT%H%M%SZ"
)

# Stripe sandbox allows about 25 requests a second. One checkout is two Stripe
# calls (the site creates the intent, the test confirms it). Default stays well
# under half of 25 so the site's own create calls fit too. Counted PER PROCESS.
STRIPE_MAX_CONFIRMS_PER_SEC = float(os.environ.get("STRIPE_MAX_CONFIRMS_PER_SEC", "10"))
POLL_TIMEOUT_S = int(os.environ.get("LOADTEST_POLL_TIMEOUT_S", "15"))
RESULTS_DIR = os.environ.get("LOADTEST_RESULTS_DIR", "results")

_INTENT_RE = re.compile(r"^pi_[A-Za-z0-9]+$")


# --------------------------------------------------------------------------
# Guards
# --------------------------------------------------------------------------

def abort(message, code=2):
    """Stop the whole process now. Used once the run has already started."""
    sys.stderr.write(f"\nGUARD: {message}\n")
    sys.stderr.flush()
    try:
        print_summary(reason="aborted")
    except Exception:  # never let reporting block the abort
        pass
    sys.stdout.flush()
    os._exit(code)


def check_host(host):
    """Return an error string if host is not exactly the staging site."""
    if not host:
        return "no --host given"
    url = urlparse(host)
    clean = host.rstrip("/")
    if (
        clean != STAGING_URL
        or url.scheme != "https"
        or url.hostname != STAGING_HOST
        or url.port not in (None, 443)
        or url.username
        or url.password
    ):
        return f"refusing to run against {host!r}; only {STAGING_URL} is allowed"
    return None


def check_env_for(user_classes):
    """Return an error string if the environment is not safe for these classes."""
    for name in ("CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"):
        if not os.environ.get(name):
            return f"{name} is not set"
    pays = [c.__name__ for c in user_classes if getattr(c, "confirms_payments", False)]
    if pays:
        key = os.environ.get("STRIPE_TEST_SECRET_KEY", "")
        if not key.startswith("sk_test_"):
            return (
                f"{', '.join(pays)} confirm payments, so STRIPE_TEST_SECRET_KEY "
                "must be set and start with sk_test_"
            )
    return None


def _run_guards(environment, hard):
    """hard=True aborts the process; hard=False raises SystemExit (init time)."""
    problems = []
    # At init the host may still be empty if it will be typed in the web UI.
    if environment.host or hard:
        problems.append(check_host(environment.host))
    problems.append(check_env_for(environment.user_classes))
    problems = [p for p in problems if p]
    if not problems:
        return
    msg = "; ".join(problems)
    if hard:
        abort(msg)
    raise SystemExit(f"GUARD: {msg}")


@events.init.add_listener
def _guard_at_init(environment, **_):
    _run_guards(environment, hard=False)


@events.test_start.add_listener
def _guard_at_start(environment, **_):
    # Catches a host typed in the web UI, after init.
    _run_guards(environment, hard=True)
    print(
        f"[loadtest] run id {RUN_ID}. Stripe confirm cap: "
        f"{STRIPE_MAX_CONFIRMS_PER_SEC:g}/s per process (Stripe sandbox limit is "
        "about 25 requests/s in total, and the site also makes one Stripe call "
        "per checkout). If throughput flattens at this rate, Stripe pacing is "
        "the limit, not the site."
    )


# --------------------------------------------------------------------------
# Counters for the after-checks
# --------------------------------------------------------------------------

class Counters:
    def __init__(self):
        self.reset()

    def reset(self):
        self.intents_started = 0
        self.confirms_ok = 0
        self.confirms_failed = 0
        self.stripe_429 = 0
        self.throttle_waits = 0
        self.throttle_wait_s = 0.0
        self.orders_seen_paid = 0
        self.orders_not_paid = 0
        self.units_requested = defaultdict(int)  # productId -> units, intent accepted
        self.units_confirmed = defaultdict(int)  # productId -> units, Stripe succeeded
        self.units_seen_paid = defaultdict(int)  # productId -> units, order read as paid
        self.product_labels = {}
        self.orders = []  # (orderId, intentId, confirmed)


COUNTERS = Counters()
SUMMARY_HOOKS = []  # scenarios add functions that return extra lines


def print_summary(reason="finished"):
    c = COUNTERS
    lines = [
        "",
        "=" * 70,
        f"LOADTEST SUMMARY (run {RUN_ID}, {reason}) - this process only",
        "=" * 70,
        f"Stripe confirm cap: {STRIPE_MAX_CONFIRMS_PER_SEC:g}/s per process; "
        f"{c.throttle_waits} confirms were delayed by it "
        f"({c.throttle_wait_s:.1f} s waiting in total). The wait is excluded "
        "from 'stripe confirm' timings.",
        f"Payment starts accepted by the site (order rows created): {c.intents_started}",
        f"Successful Stripe confirms (status=succeeded, livemode=false): {c.confirms_ok}",
        f"Failed Stripe confirms: {c.confirms_failed} (of which HTTP 429: {c.stripe_429})",
        f"Orders read back as paid (Shopper-type users only): {c.orders_seen_paid}",
        f"Orders still unpaid after {POLL_TIMEOUT_S} s polling: {c.orders_not_paid}",
        "Units per product (productId: requested / confirmed / seen paid):",
    ]
    for pid in sorted(set(c.units_requested) | set(c.units_confirmed) | set(c.units_seen_paid)):
        label = c.product_labels.get(pid, "")
        lines.append(
            f"  {pid} {label}: {c.units_requested[pid]} / "
            f"{c.units_confirmed[pid]} / {c.units_seen_paid[pid]}"
        )
    for hook in SUMMARY_HOOKS:
        try:
            lines.extend(hook())
        except Exception as exc:  # reporting must not crash the exit
            lines.append(f"(summary hook failed: {exc})")
    lines += [
        "",
        "Compare these with the database and Stripe (see loadtest/README.md):",
        "  confirms succeeded here == succeeded payments in the Stripe sandbox == paid LT- orders",
        "  'units confirmed' per product == units in paid test orders (SQL in GUIDE.md)",
        "With several worker processes, add up the numbers from every process.",
        "=" * 70,
    ]
    print("\n".join(lines))
    _write_files()


_written = False


def _write_files():
    global _written
    if _written:
        return
    _written = True
    try:
        os.makedirs(RESULTS_DIR, exist_ok=True)
        stamp = f"{RUN_ID}-{os.getpid()}"
        with open(os.path.join(RESULTS_DIR, f"orders-{stamp}.csv"), "w") as fh:
            fh.write("order_id,payment_intent_id,confirmed\n")
            for oid, pid, ok in COUNTERS.orders:
                fh.write(f"{oid},{pid},{int(ok)}\n")
        c = COUNTERS
        with open(os.path.join(RESULTS_DIR, f"counts-{stamp}.json"), "w") as fh:
            json.dump(
                {
                    "run_id": RUN_ID,
                    "intents_started": c.intents_started,
                    "confirms_ok": c.confirms_ok,
                    "confirms_failed": c.confirms_failed,
                    "stripe_429": c.stripe_429,
                    "orders_seen_paid": c.orders_seen_paid,
                    "orders_not_paid": c.orders_not_paid,
                    "units_requested": c.units_requested,
                    "units_confirmed": c.units_confirmed,
                    "units_seen_paid": c.units_seen_paid,
                },
                fh,
                indent=2,
            )
    except OSError as exc:
        print(f"(could not write result files: {exc})")


@events.quitting.add_listener
def _summary_at_quit(environment, **_):
    print_summary()


@events.test_start.add_listener
def _reset_counters(environment, **_):
    global _written
    COUNTERS.reset()
    _written = False


# --------------------------------------------------------------------------
# Fake people
# --------------------------------------------------------------------------

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
            "state": fake.state_abbr(include_territories=False),
            "postalCode": fake.postcode(),
            "country": "US",
            "phone": fake.phone_number(),
            "email": email,
        },
    }


def new_order_id():
    return f"LT-{uuid.uuid4().hex[:16]}".upper()


# --------------------------------------------------------------------------
# Stripe pacing
# --------------------------------------------------------------------------

class Pacer:
    """Hands out confirm slots no closer than 1/rate seconds apart."""

    def __init__(self, rate):
        self.gap = 1.0 / rate if rate > 0 else 0.0
        self.next_slot = 0.0

    def wait(self):
        if not self.gap:
            return
        now = time.monotonic()
        slot = max(now, self.next_slot)
        self.next_slot = slot + self.gap
        delay = slot - now
        if delay > 0.001:
            COUNTERS.throttle_waits += 1
            COUNTERS.throttle_wait_s += delay
            gevent.sleep(delay)


PACER = Pacer(STRIPE_MAX_CONFIRMS_PER_SEC)


def _json(response):
    try:
        return response.json()
    except ValueError:
        return None


# --------------------------------------------------------------------------
# Base class with the shared steps
# --------------------------------------------------------------------------

class SiteUser(HttpUser):
    """Common behaviour. Not run itself."""

    abstract = True
    confirms_payments = False

    # ---- lifecycle -------------------------------------------------------
    def on_start(self):
        # Belt and braces: the init/test_start guards already ran.
        problem = check_host(self.host) or check_env_for([type(self)])
        if problem:
            abort(problem)
        self.client.headers.update(
            {
                "CF-Access-Client-Id": os.environ["CF_ACCESS_CLIENT_ID"],
                "CF-Access-Client-Secret": os.environ["CF_ACCESS_CLIENT_SECRET"],
                "User-Agent": "locust-staging-loadtest",
                "X-Loadtest-Run": RUN_ID,
            }
        )
        # Separate session: the Access token must never be sent to Stripe.
        self.stripe = requests.Session()
        self.person = new_person()
        self.products = []
        self.categories = []
        self.auth = None  # {"Authorization": "Bearer ..."} once signed in

    # ---- checked requests -----------------------------------------------
    def get_json(self, path, name, field, status=200, **kw):
        """GET, require status and a body field. Returns parsed body or None."""
        with self.client.get(path, name=name, catch_response=True, **kw) as r:
            return self._check(r, name, status, field)

    def send_json(self, method, path, name, field, status=200, **kw):
        with self.client.request(method, path, name=name, catch_response=True, **kw) as r:
            return self._check(r, name, status, field)

    @staticmethod
    def _check(r, name, status, field):
        if r.status_code != status:
            r.failure(f"{name}: HTTP {r.status_code} (want {status}): {r.text[:160]}")
            return None
        body = _json(r)
        if body is None or (field and (not isinstance(body, dict) or field not in body)):
            r.failure(f"{name}: body has no {field!r}: {r.text[:160]}")
            return None
        r.success()
        return body

    def get_page(self, path, name):
        with self.client.get(path, name=name, catch_response=True) as r:
            if r.status_code != 200:
                r.failure(f"{name}: HTTP {r.status_code}")
            elif "<html" not in r.text[:2000].lower():
                r.failure(f"{name}: not an HTML page")
            else:
                r.success()

    # ---- catalogue -------------------------------------------------------
    def load_products(self, per_page=24, page=1):
        body = self.get_json(
            f"/api/v1/products?perPage={per_page}&page={page}&inStock=true",
            "product list", "items",
        )
        if body and body["items"]:
            self.products = body["items"]
        return self.products

    def load_categories(self):
        body = self.get_json("/api/v1/categories", "categories", "items")
        if body:
            slugs = []

            def walk(nodes):
                for n in nodes:
                    slugs.append(n["slug"])
                    walk(n.get("children") or [])

            walk(body["items"])
            self.categories = slugs
        return self.categories

    # ---- account ---------------------------------------------------------
    def sign_up(self):
        p = self.person
        body = self.send_json(
            "POST", "/api/v1/auth/register", "sign up", "token", status=201,
            json={"name": p["name"], "email": p["email"], "password": p["password"]},
        )
        if not body:
            return False
        self.auth = {"Authorization": f"Bearer {body['token']}"}
        return True

    # ---- checkout steps --------------------------------------------------
    @staticmethod
    def cart_lines(products, quantity=1):
        return [{"productId": p["id"], "quantity": quantity} for p in products]

    def quote_shipping(self, items):
        body = self.send_json(
            "POST", "/api/v1/shipping/rates", "shipping quote", "rates",
            json={"items": items, "shippingAddress": self.person["address"]},
        )
        if body and body.get("success") and body["rates"]:
            return body["rates"][0].get("service")
        return None

    def quote_tax(self, products, items):
        by_id = {p["id"]: p for p in products}
        lines = [
            {
                "productId": i["productId"],
                "price": float(by_id[i["productId"]]["price"]),
                "quantity": i["quantity"],
                "category": (by_id[i["productId"]].get("category") or {}).get("slug", "accessories"),
            }
            for i in items
        ]
        return self.send_json(
            "POST", "/api/v1/tax/calculate", "tax quote", "totalTax",
            json={"items": lines, "shippingAddress": self.person["address"]},
        )

    def start_payment(self, products, items, shipping_service=None, auth=True):
        """Returns (order_id, intent_id) or None. Sends no amount/tax/shipping."""
        order_id = new_order_id()
        payload = {
            "orderId": order_id,
            "items": items,
            "shippingAddress": self.person["address"],
            "customerEmail": self.person["email"],
        }
        if shipping_service:
            payload["shippingService"] = shipping_service
        headers = self.auth if (auth and self.auth) else None
        with self.client.post(
            "/api/v1/checkout/payment-intent", name="start payment",
            json=payload, headers=headers, catch_response=True,
        ) as r:
            body = _json(r) if r.status_code == 200 else None
            if (
                r.status_code != 200
                or not isinstance(body, dict)
                or "paymentIntentId" not in body
                or "clientSecret" not in body
            ):
                # The handler turns bad input into 500; read the text first.
                r.failure(f"start payment HTTP {r.status_code}: {r.text[:200]}")
                return None
            intent_id = body["paymentIntentId"]
            if not _INTENT_RE.match(str(intent_id)) or not str(body["clientSecret"]).startswith(
                f"{intent_id}_secret_"
            ):
                r.failure("start payment: intent id / client secret look wrong")
                return None
            r.success()
        by_id = {p["id"]: p for p in products}
        COUNTERS.intents_started += 1
        for line in items:
            COUNTERS.units_requested[line["productId"]] += line["quantity"]
            COUNTERS.product_labels.setdefault(
                line["productId"], by_id.get(line["productId"], {}).get("slug", "")
            )
        return order_id, intent_id

    def confirm_with_stripe(self, intent_id, order_id, items):
        """Stands in for Stripe.js. Reported as its own row: 'stripe confirm'."""
        PACER.wait()
        started = time.perf_counter()
        response, error, live = None, None, False
        try:
            response = self.stripe.post(
                f"{STRIPE_API}/v1/payment_intents/{intent_id}/confirm",
                auth=(os.environ["STRIPE_TEST_SECRET_KEY"], ""),
                timeout=30,
                headers={"Idempotency-Key": f"lt-{RUN_ID}-{intent_id}"},
                data={
                    "payment_method": "pm_card_visa",
                    "return_url": f"{STAGING_URL}/checkout/success",
                },
            )
            body = _json(response)
            body = body if isinstance(body, dict) else {}
            err = body.get("error") if isinstance(body.get("error"), dict) else {}
            if response.status_code == 200 and body.get("livemode") is not False:
                live = True  # true, or missing: treat as unsafe
            elif err.get("code") == "resource_missing":
                # A sk_test_ key cannot see live objects, so a live-mode intent
                # looks exactly like this. Stop rather than guess.
                live = True
            elif response.status_code == 429:
                COUNTERS.stripe_429 += 1
                error = Exception("stripe 429 rate limited")
            elif response.status_code != 200 or body.get("status") != "succeeded":
                error = Exception(
                    f"stripe {response.status_code}: "
                    f"{err.get('code') or body.get('status')}: {str(err.get('message', ''))[:120]}"
                )
        except requests.RequestException as exc:
            error = exc
        elapsed_ms = (time.perf_counter() - started) * 1000
        if live:
            self.environment.events.request.fire(
                request_type="POST", name="stripe confirm", response_time=elapsed_ms,
                response_length=0, response=response, context={},
                exception=Exception("LIVE MODE OR UNKNOWN MODE"),
            )
            abort(
                "Stripe answered with livemode=true, or an intent the sandbox key "
                "cannot see. Staging may be using LIVE Stripe keys. Run stopped. "
                "Check the Stripe dashboard for live-mode objects and tell the owner."
            )
        self.environment.events.request.fire(
            request_type="POST", name="stripe confirm", response_time=elapsed_ms,
            response_length=len(response.content) if response is not None else 0,
            response=response, context={}, exception=error,
        )
        ok = error is None
        if ok:
            COUNTERS.confirms_ok += 1
            for line in items:
                COUNTERS.units_confirmed[line["productId"]] += line["quantity"]
        else:
            COUNTERS.confirms_failed += 1
        COUNTERS.orders.append((order_id, intent_id, ok))
        return ok

    def wait_for_paid(self, order_id, items, timeout=None):
        """Poll until the webhook has marked the order paid, bounded."""
        if not self.auth:
            return False
        timeout = timeout or POLL_TIMEOUT_S
        for attempt in range(timeout):
            paid = False
            with self.client.get(
                f"/api/v1/orders/{order_id}", name="order status (poll)",
                headers=self.auth, catch_response=True,
            ) as r:
                body = _json(r) if r.status_code == 200 else None
                if r.status_code != 200 or not isinstance(body, dict) or "paymentStatus" not in body:
                    r.failure(f"order poll HTTP {r.status_code}: {r.text[:120]}")
                else:
                    paid = body["paymentStatus"] == "paid"
                    if paid or attempt < timeout - 1:
                        r.success()
                    else:
                        r.failure(
                            f"order {order_id} not paid after {timeout} s: "
                            "webhook late or lost"
                        )
            if paid:
                COUNTERS.orders_seen_paid += 1
                for line in items:
                    COUNTERS.units_seen_paid[line["productId"]] += line["quantity"]
                return True
            gevent.sleep(1)
        COUNTERS.orders_not_paid += 1
        return False

    def checkout(self, products, items, authed, poll):
        """Quote, start payment, pay, optionally wait. True if Stripe confirmed."""
        service = self.quote_shipping(items)
        self.quote_tax(products, items)
        started = self.start_payment(products, items, service, auth=authed)
        if not started:
            return False
        order_id, intent_id = started
        if not self.confirm_with_stripe(intent_id, order_id, items):
            return False
        if poll:
            self.wait_for_paid(order_id, items)
        return True


__all__ = [
    "SiteUser", "StopUser", "COUNTERS", "SUMMARY_HOOKS", "RUN_ID", "fake",
    "new_person", "print_summary", "abort", "POLL_TIMEOUT_S",
]
