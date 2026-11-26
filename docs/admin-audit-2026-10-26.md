# Admin panel audit (2026-10-26)

Branch `fix/admin-panel-audit`, commits `3b7f117` (audit) and `f68dec4`
(review fixes). Not merged, not deployed, never run against a database.
Verified only by `npx tsc --noEmit -p .` (clean) and `next build` compile
(clean; page-data collection needs a live DB and was not run).
No schema changes and no migrations.

## Done

**Products** (`components/admin/product-builder/**`, `lib/actions/product.actions.ts`,
`lib/product-builder-schema.ts`, `lib/inventory.ts`, `lib/catalog-cache.ts`)
- Autosave no longer unpublishes live products. It only runs for new
  products and drafts. The server rejects an autosave of a non-draft.
- Edit form loads its category and tags, so a save no longer wipes the tags.
- `in_stock` is written on save. Variable products store the sum of their
  variants' stock.
- `sizes`/`colors` columns (used by the storefront picker) are set from the
  Size/Color options.
- Weight is labelled in ounces (shipping reads oz).
- Variants are upserted by id, not deleted and re-inserted. SKU conflicts are
  checked before any write. `publishedAt` is set only when a product first
  becomes published.
- Validation: slug and SKU uniqueness on the server, variant rules, sale
  dates. Field errors are returned to the form.
- List page: filters (stock, category), sorting, bulk-delete confirm, price
  ranges, stock badges.
- CSV import/export: template fixed, variant rows grouped, dry run first.
- Scheduled publish works without the cron. `liveCondition()` in
  `lib/catalog-cache.ts` treats due scheduled products as live, so they
  appear within about 15 minutes (the cache revalidate time). The admin
  product list flips due rows to published.
- Visibility (public / hidden / search_only) and the SEO meta fields now
  take effect on the storefront.
- Inventory:
  - Untracked stock is never decremented.
  - Backorders are respected.
  - Decrements are atomic.
  - A web sale without a `variantId` is matched to its variant by Size/Color.

**Orders** (`app/admin/orders/**`, `lib/actions/order.actions.ts`,
`lib/order-status.ts`, `lib/order-filters.ts`, export route)
- Detail page no longer crashes. It has totals with the discount, a
  fulfilment card (carrier, tracking, mark shipped, email the customer),
  a packing slip, a timeline built on `order_notes`, and Hold, Release and
  Delivered actions.
- Status rules are in `allowedStatusTransitions`:
  - Nothing ships unless it is paid.
  - Paid orders are refunded, not cancelled.
  - Cancelled and delivered orders are final.
- List: server-side filters, search, pagination. An "Awaiting payment" tab
  keeps abandoned checkouts separate.
- The Pirate Ship CSV uses real parcel weights. A bookkeeping CSV was added.
- `createOrderAction` was removed (a public action with no auth check).
- Stripe webhook:
  - A failed payment keeps the order awaiting payment, so a retry works.
  - Refunds write to the timeline instead of overwriting notes.
  - Shipped orders keep their status on refund and are not restocked.
  - A coupon use is released once on a full refund.
- Checkout saves `paymentIntentId` on the order when it is created.

**Coupons, categories, tags**
- Coupon category restriction is now saved (it was silently dropped).
- Coupon codes are matched exactly on `upper(code)`. Before, `%` matched
  any coupon.
- Category coupons cover sub-categories.
- Coupons get a product picker, date and time with time zone, and validation.
- Deleting a category disables its coupons instead of making them storewide,
  and the delete dialog shows the full impact.
- Name and slug duplicate checks for tags and categories. Category up/down
  ordering, image upload, tag bulk delete and merge.

**Dashboard, customers, settings, shell**
- Revenue counts paid orders and excludes cancelled ones. Abandoned
  checkouts are counted separately. Cards compare 30 days against the
  previous 30 days. Low stock is checked per variant.
- Customers: pagination, sorting, spend counted from paid orders only, and
  a detail page with addresses. New Subscribers and Messages tabs (newsletter
  and contact form, previously not visible in admin).
- Settings shows only the field something reads (contact email), plus a
  read-only "Store Configuration" card. Saving merges over the stored
  settings.
- Nav reordered, with a View Store link. Sign-out does a full page reload.
- Admin login returns to the requested page. Redirects are limited to
  `/admin` paths.
- `app/api/data/route.ts` deleted (unused, wrong spend figures).

## To do

**Needs the owner's decision or go**
1. Product weights: `scripts/seed-catalogue.mjs` lists pounds (e.g. abaya
   1.20), but shipping reads ounces. Check real products. If they are in
   pounds, run a one-off `UPDATE products SET weight = weight*16` (and the
   same for `product_variants`).
2. Test on staging (GMKtec VM 201, Neon `modest-ummah-staging`) before any
   production deploy. Click through: create, edit and publish a product
   (simple and variable), schedule a product, place a test order, mark it
   shipped, refund, apply a coupon.
3. Nov 1 deploy: image `0000000` does not contain this branch. Once the cron
   is removed, scheduled products will not go live until this branch is
   built and deployed.

**Code follow-ups (not done)**
- Storefront variant picker: `product-info.tsx` adds to cart without a
  `variantId`, so the web shop ignores per-variant price and stock. Match
  the chosen Size/Color to a variant and send its id and price.
- `product-info.tsx`: use `product.lowStockThreshold` instead of the
  hard-coded 5, and `whitespace-pre-line` for descriptions.
- `lib/pricing.ts`: checkout does not check product status (a draft can be
  bought by id through the API).
- `app/account/orders/page.tsx`: "View Details" links to a page that does
  not exist (404). Customers also cannot see tracking.
- Coupon usage-limit race: reserve the use when the order is created
  (`create-payment-intent`), not on payment.
- Stripe `payment_intent.succeeded` has no guard against reopening an order
  that was refunded from the Stripe dashboard.
- `lib/woo/serialize.ts` should use the same live rule for due scheduled
  products. `lib/woo/writeback.ts` should normalise tracking numbers.
- Header and footer banner text, the support email and the email sender are
  hard-coded. Make them editable through settings if wanted.
- `lib/taxcloud.ts` falls back to a fake origin address. It should fail
  instead.
- No ESLint config for ESLint 9 (`eslint.config.*` missing).

**Schema ideas (need migrations)**
- `cost_price`, `barcode`, unique `products.sku`, an archived status.
- `orders.refunded_amount`, a payment method (for manual payments).
- Unique index on `upper(coupons.code)`, a per-customer coupon limit, a
  free-shipping coupon type.
- Tables for contact messages, newsletter sign-ups and saved addresses.
- A store time zone setting. `published_at` as `timestamptz`.
- The `drizzle/` migrations are behind `lib/schema.ts`. The real schema came
  from `scripts/apply-catalogue-schema.mjs`.
