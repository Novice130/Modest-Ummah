"""Modest Ummah staging load test: the three everyday journeys.

Run only against https://staging.modestummah.com (the guard in common.py
refuses anything else). See loadtest/README.md for commands.

  Browser     anonymous visitor, no payments
  Shopper     signs up, browses, buys, pays, waits for the order to turn paid
  GuestBuyer  no account: quote, start payment, pay (checked in the database)
"""

import random

from locust import between, task
from locust.exception import StopUser

from common import SiteUser


class Browser(SiteUser):
    """Anonymous. Pages and the /api/v1 catalogue calls behind them."""

    weight = 7
    wait_time = between(1, 4)

    @task(4)
    def home_and_shop(self):
        self.get_page("/", "home")
        self.get_page("/shop", "shop")

    @task(3)
    def category(self):
        if not self.categories:
            self.load_categories()
        if self.categories:
            slug = random.choice(self.categories)
            self.get_page(f"/shop/{slug}", "category page")
            self.get_json(
                f"/api/v1/products?category={slug}&perPage=24&sort=newest",
                "product list (category)", "items",
            )

    @task(5)
    def product(self):
        if not self.load_products():
            return
        p = random.choice(self.products)
        self.get_page(f"/product/{p['slug']}", "product page")
        self.get_json(f"/api/v1/products/{p['slug']}", "product json", "id")
        self.get_json(f"/api/v1/products/{p['slug']}/related", "related", "items")

    @task(2)
    def featured(self):
        self.get_json("/api/v1/products/featured", "featured", "items")
        self.get_json("/api/v1/products/new-arrivals", "new arrivals", "items")

    @task(1)
    def search(self):
        self.get_json("/api/v1/products?q=scarf", "search", "items")


class Shopper(SiteUser):
    """Signs up, browses, saves a bag, buys, pays, waits for 'paid'."""

    weight = 2
    wait_time = between(1, 4)
    confirms_payments = True

    def on_start(self):
        super().on_start()
        if not self.sign_up():
            raise StopUser()  # no token, nothing else would work

    @task(5)
    def browse(self):
        self.get_page("/", "home")
        if self.load_products():
            p = random.choice(self.products)
            self.get_page(f"/product/{p['slug']}", "product page")
            self.get_json(f"/api/v1/products/{p['slug']}", "product json", "id")

    @task(1)
    def buy(self):
        if not self.products and not self.load_products():
            return
        picks = random.sample(self.products, k=min(2, len(self.products)))
        items = self.cart_lines(picks)
        self.send_json("PUT", "/api/v1/cart", "save bag", "items",
                       headers=self.auth, json={"items": items})
        self.get_json("/api/v1/cart", "read bag", "items", headers=self.auth)
        if self.checkout(picks, items, authed=True, poll=True):
            self.get_json("/api/v1/orders", "order list", "items", headers=self.auth)

    @task(1)
    def account(self):
        self.get_json("/api/v1/me", "profile", "email", headers=self.auth)

    @task(1)
    def sign_in(self):
        # bcrypt cost 12 runs on the one Node thread: judge this row on its own.
        p = self.person
        self.send_json("POST", "/api/v1/auth/login", "sign in", "token",
                       json={"email": p["email"], "password": p["password"]})


class GuestBuyer(SiteUser):
    """No account. There is no order endpoint for guests, so no polling here."""

    weight = 1
    wait_time = between(1, 4)
    confirms_payments = True

    @task
    def buy(self):
        if not self.products and not self.load_products():
            return
        picks = random.sample(self.products, k=min(2, len(self.products)))
        self.checkout(picks, self.cart_lines(picks), authed=False, poll=False)
