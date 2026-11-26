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

## Status (2026-11-26)

| # | Blocker | Status |
|---|---------|--------|
| 1 | Admin password | Done: rotated on prod, owner holds it |
| 2 | Admin 2FA | Code and `ADMIN_TOTP_ENC_KEY` live; **enrolment and `ADMIN_2FA_REQUIRED=true` left** (step C) |
| 3 | Migrations | Done: `0001`, `0002` on staging and prod, recorded in `drizzle.__drizzle_migrations` |
| 4 | Prod test data | Done: prod has 0 users/orders/carts, one admin |
| 5 | Server env | Done (incl. `SALES_TAX_RATES=IL:0.0875`) |
| 6 | Build and deploy | Done: image `prod-d48811c` on staging and prod (loaded with `docker save/load`, not in GHCR); rollback tag `0000000` kept |
| 7 | End-to-end test | **Left** (step B) |
| 8 | Backups | **Left** (step D) |
| - | Payments live | **Left**: Stripe still in test mode (step E) |
| - | Owner registrations | **Left** (step A) |

Every server, cloud or GitHub step below is shown with its exact commands
and waits for the owner's "go". Keys the owner hands over live only in a
mode-600 scratchpad file and are deleted afterwards.

## Remaining work, step by step

Order: A runs in parallel with everything else (owner). B, then C, then D,
then E. F and G can follow after launch.

### A. Owner: business registrations (before the first real order)

1. **Sales tax registration**: MyTax Illinois > "Register a New Business
   (Form REG-1)" as a sole proprietor, Retailers' Occupation Tax, location =
   the ship-from address. Note the IBT account number and the filing
   frequency IDOR assigns (monthly/quarterly/annual returns on Form ST-1).
2. **DBA**: file "Modest Ummah" as an assumed business name with the Will
   County Clerk; publish the newspaper notice the clerk requires (3 weeks).
3. **Village of Romeoville**: ask Planning & Zoning (815-886-7200) for the
   home occupation business license; pay the one-time filing fee.
4. **Stripe live activation**: Stripe dashboard > Activate account > business
   type "Individual / sole proprietor", legal name, SSN, home address,
   personal bank account, statement descriptor "MODEST UMMAH", website
   `https://modestummah.com`.
5. **Legal pages**: give the operator name to show ("<legal name> d/b/a
   Modest Ummah") and a contact postal address (a PO box or virtual mailbox
   keeps the home address private). Then update privacy, terms and email
   footers (`docs/privacy-policy-proposed-changes.md` has the analytics part).
6. **Accountant question**: are delivery charges taxable the way the store
   sells them (flat $9.99/$14.99 shown separately)? The code does not tax
   shipping today.
7. **Records**: keep monthly totals of sales by shipping state (Admin > Orders
   export). Add a state to `SALES_TAX_RATES` only after registering there.

### B. End-to-end test on staging (blocker 7)

Staging: GMKtec VM `debian@192.168.0.107`, container `stg-modestummah-web-1`,
`127.0.0.1:3100`, Neon `modest-ummah-staging`, Stripe **test** keys.
Stripe cannot reach a LAN address, so forward webhooks with the Stripe CLI
on the VM or the Mac: `stripe listen --forward-to http://127.0.0.1:3100/api/webhooks/stripe`
and put the `whsec_...` it prints into staging `web.env` for the test.

| # | Test | Expected |
|---|------|----------|
| 1 | Register, sign out, sign in (email/password) | Works; 11th wrong password in 15 min is rate limited |
| 2 | Forgot password, open link from Brevo email, set new password | Email arrives from `orders@modestummah.com`; old sessions are signed out |
| 3 | Google sign-in (web and iOS app), Apple sign-in (iOS app) | Account created or linked |
| 4 | Checkout to an Illinois address with card `4242 4242 4242 4242` | Tax = 8.75% of items; order goes to processing after the webhook; confirmation email and admin alert arrive; stock goes down |
| 5 | Checkout to a California address | Tax $0 |
| 6 | Card `4000 0025 0000 3155` (3D Secure) | Challenge shown; order paid after approval |
| 7 | Card `4000 0000 0000 9995` (declined) | Error shown; order stays unpaid; no stock change |
| 8 | Coupon with usage limit 1, used twice | Second use refused |
| 9 | Admin: refund the paid order in full | Status refunded/cancelled, stock back once, coupon use released |
| 10 | Admin: export Pirate Ship CSV, import into Pirate Ship | Columns map; no `=` formulas run |
| 11 | Admin: add tracking number | Customer gets the shipped email with a working tracking link |
| 12 | Mobile app checkout (test key build) | Same as 4; 409 errors shown as messages |

Record results in this file. Any failure is fixed on the branch, rebuilt and
redeployed to staging before going on.

### C. Admin 2FA (blocker 2)

Follow `docs/admin-2fa.md`:

1. Install an authenticator app on the owner's phone (and a second admin's
   phone, if any).
2. Sign in at `https://modestummah.com/admin`, open
   `/admin/settings/security`, scan the QR code, enter a code, and save the
   recovery codes in the password manager.
3. On the server, set `ADMIN_2FA_REQUIRED=true` in
   `/opt/sites/modestummah/web.env` (back the file up first) and recreate the
   web container with the same tag (`bin/prod deploy modestummah d48811c`, or
   the `--pull never` form in CLAUDE.md while GHCR is not set up).
4. Check: sign out, sign in again; a code is asked for. Keep
   `ADMIN_TOTP_ENC_KEY` in the password manager: losing it disables every
   enrolment.

### D. Backups (blocker 8)

Server files and images (infra runbook section 8, `hetzner/backup/README.md`):

1. Cloudflare dashboard > R2: create bucket (e.g. `phet-backups`). Create an
   R2 API token limited to that bucket, Object Read & Write.
2. Add a bucket lock rule on `hetzner-prod/` shorter than `RETENTION_DAYS`
   (e.g. 14 days), so a compromised server cannot delete recent backups.
3. On the server: fill `/etc/infra-backup-rclone.conf` (from
   `rclone.conf.example`) and `RCLONE_REMOTE` in the backup env file;
   `AGE_RECIPIENT` is already set.
4. Run `systemctl start infra-backup.service`, then
   `journalctl -u infra-backup.service -n 50` and list the bucket to see the
   `.age` file. Test one restore with `restore.sh` into a scratch directory.
5. Confirm `infra-backup.timer` is enabled (`systemctl list-timers`).

Database (prod Neon `purple-sound-11979988`):

6. Neon's free plan keeps only a short restore window, so add a nightly
   `pg_dump` (Postgres 17 client, e.g. `docker run --rm postgres:17 pg_dump`)
   of the prod `DATABASE_URL`, encrypted with the same `AGE_RECIPIENT`, to the
   same R2 bucket. One dump a night wakes compute for a few minutes, well
   inside 100 CU-hours a month; never run it more often.
7. Encrypt or delete the loose unencrypted copies: the staging dump on the
   GMKtec VM (`~/backups/neon/*.dump`) and the CSVs in
   `Phet/backups/neon/woo-tables-2026-11-26/` (`age -r <recipient>`).

### E. Switch payments to live (after A4, B and D)

The publishable key is compiled into the image (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
build arg), so going live needs a new build, not only new env values.

1. Stripe dashboard (live mode) > Developers > Webhooks > Add endpoint
   `https://modestummah.com/api/webhooks/stripe`, events
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `charge.refunded`. Copy its signing secret.
2. Build the image with the live `pk_live_...` publishable key (same build
   path as `prod-d48811c`), load it on the server.
3. Back up `web.env`, then set `STRIPE_SECRET_KEY=sk_live_...` and
   `STRIPE_WEBHOOK_SECRET=whsec_...` (live). Deploy the new tag.
4. Real test: buy the cheapest item with a real card to an Illinois address,
   check tax, webhook (Stripe dashboard shows 200), emails; refund it in the
   admin panel; check the refund in Stripe.
5. Mobile: build release apps with `--dart-define=STRIPE_PUBLISHABLE_KEY=pk_live_...`.
6. Rollback: restore the backed-up `web.env` and the previous tag.

### F. Code, GitHub and deploy path (after launch is fine)

1. Push the local commits (`3eb50a8`, `d48811c` and later) to PR #1; merge to
   `main` once B passes.
2. CI `Build` needs a `DATABASE_URL` repository secret (build-time
   `generateStaticParams`); use the staging URL, not prod.
3. Decide the image path: build in GitHub Actions and push to
   `ghcr.io/novice130/modest-ummah`, then renew the server's GHCR login so
   `bin/prod deploy` works without `docker save/load`.
4. Commit the infra branch `fix/security-audit-2026-11-25`; review
   `docs/runbook.md`, which mixes the owner's edits with the audit's.

### G. Security and housekeeping follow-ups

1. **Cloudflare Authenticated Origin Pulls**, in this order: put Cloudflare's
   origin-pull CA at `/opt/caddy/certs/cf-origin-pull-ca.pem` (check
   fingerprint) > enable AOP for attayyibun.com, modestummah.com,
   novicetutor.com, learnnovice.com > copy the new Caddyfile and restart Caddy
   > check each site; a direct `--resolve` to the server must fail. Restarting
   Caddy before enabling AOP takes every site down.
2. **Port 22**: check the Hetzner Cloud Firewall and `ufw status`; public 22
   must be closed (SSH only via Tailscale). Fix the runbook either way.
3. **CSP**: read the report-only violations for a week, then switch
   `Content-Security-Policy-Report-Only` to enforcing in `next.config.js`.
4. **ISR cache EACCES** (`/app/.next/server/app/...` not writable by
   `nextjs`): fix ownership in the Dockerfile.
5. **Mobile**: guard `mobile/integration_test/capture_flow.dart` with
   `liveTestRefusal()`; Android release keystore + `key.properties`; new
   personal Google Play accounts need a closed test (12 testers, 14 days)
   before production.
6. **Staging data**: the staging DB still holds real customer data from
   October; anonymise or wipe it.
7. **Leftover code items**: move `getSession`/`clearSession` out of the
   `'use server'` file; reserve coupon uses at order creation; expire unpaid
   orders.
8. **Revoke** every short-lived key handed over during setup (Neon API keys,
   Cloudflare tokens) once each step is done.

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
