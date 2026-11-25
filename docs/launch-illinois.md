# Launch: Illinois business setup and go-live blockers

Written 2026-11-26. Not legal or tax advice: confirm the tax points with the
Illinois Department of Revenue (IDOR) or an accountant before launch.

## The business

- The owner (the client) lives in **Romeoville, Illinois** (Will County, ZIP 60446)
  and ships orders from there.
- No company is registered yet. The plan is to start as a **sole proprietor**
  and form an LLC once customers arrive. That is legal in Illinois.
- Payments: Stripe is configured (currently in test/sandbox mode). A Stripe
  account can be opened as "Individual / sole proprietorship" with the owner's
  SSN; business details and EIN can be updated after an LLC is formed (Stripe
  may re-verify).

## What the owner must do before taking real orders

| # | Item | Why | Where |
|---|------|-----|-------|
| 1 | Register for sales tax (Retailers' Occupation Tax) | Required before selling goods and collecting tax in Illinois | MyTax Illinois, "Register a New Business (Form REG-1)", about 1-2 business days online |
| 2 | ~~Look up the exact tax rate~~ Done 2026-11-26: IDOR Tax Rate Finder, ship-from address, location code 09900251R00: general merchandise **8.750%**, so `SALES_TAX_RATES=IL:0.0875` | Romeoville's combined rate is reported between 8.5% and 9.5% depending on special/business districts; only the address lookup is authoritative | IDOR Tax Rate Finder (MyTax Illinois), then set `SALES_TAX_RATES=IL:<rate>` |
| 3 | Assumed business name (DBA) for "Modest Ummah" | Trading under a name other than his legal name; Illinois requires filing with the county clerk and a newspaper notice | Will County Clerk |
| 4 | Village of Romeoville home occupation / business license | Chapter 113 requires a business license per location; home occupations are licensed by the Zoning Administrator | Romeoville Planning & Zoning, 815-886-7200 |
| 5 | Operator details in legal pages | Privacy policy, terms and emails must name a real operator and contact; marketing email needs a postal address (a PO box or virtual mailbox avoids publishing the home address) | Site legal pages, Brevo |
| 6 | Stripe live activation as sole proprietor | Needs legal name, SSN, bank account, business name/URL | Stripe dashboard |

## How Illinois affects the code

- **Origin sourcing.** An Illinois retailer shipping from an Illinois location
  to Illinois customers charges the rate of its own location (origin), not the
  customer's. The 2025 destination-sourcing change only affects sales shipped
  from outside Illinois. So one rate covers every Illinois order.
- **Clothing is taxed** at the full general merchandise rate in Illinois.
- **Other states: no tax** until the store passes that state's economic nexus
  threshold (usually $100,000 of sales into the state) and registers there.
  Collecting tax in a state where the store is not registered is wrong.
- **Implemented** (`lib/taxcloud.ts`, branch `feat/launch-finish-2026-11-25`):
  - `SALES_TAX_RATES` (e.g. `IL:0.0875`) lists the states where tax is charged
    and the rate. Every other state gets $0 and TaxCloud is not called.
  - Unset means no tax anywhere (logged warning). A malformed value fails
    checkout loudly. Previously the fallback charged an estimated rate in all
    50 states (default 7%).
  - TaxCloud is optional. Without `TAXCLOUD_API_LOGIN_ID`/`TAXCLOUD_API_KEY`,
    the configured rate is charged. If TaxCloud keys are set,
    `TAXCLOUD_ORIGIN_ADDRESS1/CITY/STATE/ZIP5` are also required.
- **Shipping charges** are not taxed by the code. Illinois treatment of
  delivery charges depends on how they are sold; confirm with IDOR or an
  accountant.
- **Watch other states' totals** (admin order export by shipping state) and
  add a state to `SALES_TAX_RATES` only after registering there.

## Go-live blockers (technical)

Each server/cloud step is shown with its exact commands and waits for "go".

1. **Admin password.** `scripts/push-schema.mjs:61` (in git) seeds
   `admin@modestummah.com` with the old password in plain text. Change it on
   prod; use a long random password from the password manager. Also remove the
   plain-text comment from the script.
2. **Admin 2FA.** Implemented as authenticator-app TOTP (`ADMIN_2FA_REQUIRED`,
   `ADMIN_TOTP_ENC_KEY`, table `admin_totp`, runbook `docs/admin-2fa.md`).
   Email codes are not implemented.
3. **Migrations on prod Neon** (`purple-sound-11979988`): `password_reset_tokens`
   (required) and `admin_totp` (for 2FA). Branch/backup first, staging first.
   `drizzle/0001_*.sql` has no `IF NOT EXISTS`; check what exists and pick one
   path (see `docs/database-migrations.md`).
4. **Delete test data in prod**: test user
   `test_ios_runner_1793647068042@modestummah.com` and its orders/PaymentIntent.
5. **Env on server** (`/opt/sites/modestummah/web.env`): `SALES_TAX_RATES`,
   `NEXT_PUBLIC_APP_URL`, `BREVO_API_KEY`, live Stripe keys + webhook secret
   when switching to live, `ADMIN_TOTP_ENC_KEY`.
6. **Build and deploy.** Prod runs the old image `0000000` (vulnerable Next.js).
   Push branch to GitHub, build image (needs `DATABASE_URL` at build), push to
   GHCR, fix the server's GHCR login, deploy to GMKtec staging, test, then
   `bin/prod deploy modestummah <sha>`.
7. **Staging test**: Stripe test payment, webhook, refund, emails, password
   reset, Google/Apple sign-in, 3DS, Illinois vs non-Illinois tax.
8. **Backups**: R2 bucket + token for server backups; scheduled encrypted
   `pg_dump` of prod Neon.
9. **Soon after**: Cloudflare Authenticated Origin Pulls (infra branch
   `fix/security-audit-2026-11-25`, order in runbook 4a), confirm port 22 is
   closed, guard `mobile/integration_test/capture_flow.dart`.

## Fulfillment (decided 2026-11-26)

The WooCommerce connector (`/wp-json`, `/wc-auth`, `lib/woo`) is removed.
Pirate Ship gets orders by spreadsheet: Admin > Orders > select > Export
(Pirate Ship format, paid and unshipped only), import the file in Pirate Ship
(map columns once), buy labels, then enter each tracking number on the order
page, which emails the customer. Migration `drizzle/0002_drop_woo_connector.sql`
drops `api_keys`, `woo_oauth_nonces` and `integration_events`; apply it only
after the new image is live, because the old image still has the connector.

## Sources

- [IDOR: Registering your business (Pub-113)](https://tax.illinois.gov/research/publications/pubs/retailers-overview-of-sales-and-use-tax/registering-your-business.html)
- [IDOR: Business registration](https://tax.illinois.gov/businesses/registration.html)
- [IDOR: Bulletin FY 2025-10, sourcing changes](https://tax.illinois.gov/research/publications/bulletins/fy-2025-10.html)
- [IDOR: Destination-based sales tax assistance](https://tax.illinois.gov/research/taxinformation/sales/destination-based-sales-tax-assistance.html)
- [Avalara: Illinois sourcing rule changes](https://www.avalara.com/us/en/blog/2025/01/illinois-sales-tax-sourcing-rule-changes)
- [Sales Tax Handbook: Romeoville rates](https://www.salestaxhandbook.com/illinois/rates/romeoville)
- [Avalara: Romeoville rate](https://www.avalara.com/us/en/taxrates/state-rates/illinois/cities/romeoville.html)
- [Nolo: Sole proprietorship in Illinois](https://www.nolo.com/legal-encyclopedia/how-establish-sole-proprietorship-illinois.html)
- [Romeoville code library](https://codelibrary.amlegal.com/codes/romeoville/latest/romeoville_il/0-0-0-18442)
