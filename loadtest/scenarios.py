"""Bulk order scenarios from loadtest/GUIDE.md ("Order scenarios").

Pick ONE scenario by naming its class on the command line, for example:

  locust -f loadtest/scenarios.py --host https://staging.modestummah.com \
      --headless -u 1000 -r 10 -t 15m OneOrderGuest

  OneOrderGuest / OneOrderShopper   many users, one order each
  BigOrder                          a few users, very large orders
  ScarceProduct / ScarceProductShopper   many users, one scarce product

Settings come from the environment (see loadtest/README.md):
  LOADTEST_TARGET_ORDERS   stop the run when this many users have finished
  BIG_ORDER_LINES (50), BIG_ORDER_QTY (99), BIG_ORDERS_PER_USER (1)
  SCARCE_SLUG, SCARCE_STOCK, SCARCE_QTY (1)
"""

import os
import random

import gevent
from locust import between, task

from common import (
    COUNTERS, SUMMARY_HOOKS, SiteUser, StopUser, abort, events,
)

TARGET_ORDERS = int(os.environ.get("LOADTEST_TARGET_ORDERS", "0"))
BIG_LINES = int(os.environ.get("BIG_ORDER_LINES", "50"))
BIG_QTY = max(1, min(99, int(os.environ.get("BIG_ORDER_QTY", "99"))))
BIG_PER_USER = int(os.environ.get("BIG_ORDERS_PER_USER", "1"))
SCARCE_SLUG = os.environ.get("SCARCE_SLUG", "")
SCARCE_STOCK = os.environ.get("SCARCE_STOCK", "")
SCARCE_QTY = max(1, min(99, int(os.environ.get("SCARCE_QTY", "1"))))

# The guide says 50 lines is the most the shipping quote accepts and to ask the
# owner before going past it. Going past needs an explicit, deliberate switch.
if BIG_LINES > 50 and os.environ.get("LOADTEST_ALLOW_OVER_50_LINES") != "yes":
    raise SystemExit(
        "BIG_ORDER_LINES above 50 needs the owner's go-ahead. "
        "If you have it, also set LOADTEST_ALLOW_OVER_50_LINES=yes."
    )

_finished = 0


def _user_finished(user):
    """Count a finished one-shot user; end the run when the target is reached."""
    global _finished
    _finished += 1
    if TARGET_ORDERS and _finished >= TARGET_ORDERS:
        runner = user.environment.runner
        if runner:
            gevent.spawn(runner.quit)


@events.test_start.add_listener
def _reset(environment, **_):
    global _finished
    _finished = 0


# --------------------------------------------------------------------------
# 1. Many users, one order each
# --------------------------------------------------------------------------

class _OneOrder(SiteUser):
    abstract = True
    confirms_payments = True
    signs_up = False
    wait_time = between(0, 1)

    def on_start(self):
        super().on_start()
        if self.signs_up and not self.sign_up():
            _user_finished(self)
            raise StopUser()

    @task
    def one_order(self):
        try:
            if self.load_products():
                picks = random.sample(self.products, k=min(random.randint(1, 3), len(self.products)))
                items = [{"productId": p["id"], "quantity": random.randint(1, 2)} for p in picks]
                self.checkout(picks, items, authed=self.signs_up, poll=self.signs_up)
        finally:
            _user_finished(self)
        raise StopUser()


class OneOrderGuest(_OneOrder):
    """Checkout alone. No account, so 'paid' is checked in the database."""


class OneOrderShopper(_OneOrder):
    """Sign-up included, and the order is read back until paid."""

    signs_up = True


# --------------------------------------------------------------------------
# 2. A few users, very large orders
# --------------------------------------------------------------------------

class BigOrder(SiteUser):
    """Signed-in user placing orders of BIG_ORDER_LINES lines x BIG_ORDER_QTY.

    Stripe refuses amounts above 999,999.99 USD. If a start payment fails for
    that reason the failure row says so; lower BIG_ORDER_LINES or BIG_ORDER_QTY.
    """

    confirms_payments = True
    wait_time = between(5, 10)

    def on_start(self):
        super().on_start()
        if not self.sign_up():
            raise StopUser()
        self.placed = 0

    def _pool(self):
        seen, pool = set(), []
        for page in (1, 2, 3):
            self.load_products(per_page=60, page=page)
            for p in self.products:
                if p["id"] not in seen:
                    seen.add(p["id"])
                    pool.append(p)
            if len(pool) >= BIG_LINES:
                break
        return pool

    @task
    def big_order(self):
        pool = self._pool()
        if not pool:
            raise StopUser()
        picks = [pool[i % len(pool)] for i in range(BIG_LINES)]
        if len(pool) < BIG_LINES:
            print(f"[loadtest] only {len(pool)} products found; lines repeat to reach {BIG_LINES}")
        items = [{"productId": p["id"], "quantity": BIG_QTY} for p in picks]
        service = self.quote_shipping(items) if len(items) <= 50 else None  # quote rejects >50
        self.quote_tax(picks, items)
        started = self.start_payment(picks, items, service, auth=True)
        if started and self.confirm_with_stripe(started[1], started[0], items):
            # Big orders take the webhook longer (two database calls per
            # line), so the poll is longer than the usual 15 s.
            self.wait_for_paid(started[0], items, timeout=90)
        self.placed += 1
        if self.placed >= BIG_PER_USER:
            raise StopUser()


# --------------------------------------------------------------------------
# 3. Many users, one scarce product
# --------------------------------------------------------------------------

class ScarceProduct(SiteUser):
    """Every user buys SCARCE_QTY of SCARCE_SLUG as a guest, once."""

    confirms_payments = True
    signs_up = False
    wait_time = between(0, 1)
    scarce_id = None

    def on_start(self):
        super().on_start()
        if not SCARCE_SLUG or not SCARCE_STOCK.isdigit():
            abort("set SCARCE_SLUG and SCARCE_STOCK (the product's current stock_quantity)")
        if self.signs_up and not self.sign_up():
            _user_finished(self)
            raise StopUser()

    @task
    def buy_it(self):
        try:
            product = self.get_json(f"/api/v1/products/{SCARCE_SLUG}", "scarce product", "id")
            if product:
                ScarceProduct.scarce_id = product["id"]
                items = [{"productId": product["id"], "quantity": SCARCE_QTY}]
                self.checkout([product], items, authed=self.signs_up, poll=self.signs_up)
        finally:
            _user_finished(self)
        raise StopUser()


class ScarceProductShopper(ScarceProduct):
    """Same, but signed in so each order can be read back as paid."""

    signs_up = True


def _scarce_lines():
    pid = ScarceProduct.scarce_id
    if not pid or not SCARCE_STOCK.isdigit():
        return []
    stock = int(SCARCE_STOCK)
    sold = COUNTERS.units_confirmed[pid]
    return [
        "",
        f"Scarce product {SCARCE_SLUG} ({pid}), stock before the run: {stock}",
        f"  units requested (orders created): {COUNTERS.units_requested[pid]}",
        f"  units confirmed in Stripe:        {sold}",
        f"  units seen paid by Locust:        {COUNTERS.units_seen_paid[pid]}",
        f"  stock the arithmetic predicts:    {max(0, stock - sold)}  "
        "(compare with products.stock_quantity: a higher number means lost updates)",
        f"  units sold beyond stock:          {max(0, sold - stock)}  "
        "(the site does not check stock at checkout, so overselling is expected)",
    ]


SUMMARY_HOOKS.append(_scarce_lines)
