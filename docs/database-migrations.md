# Database migrations

Written 2026-11-03. `lib/schema.ts` is the source of truth. `drizzle/` holds the
migrations and is tracked in git. Nothing in this document has been run against
a database yet, and `scripts/compare-schema.mjs` has only been tested offline.

## Why this changed

`drizzle/` used to be gitignored, so the repo had no migration history. The
production schema came from a mix of `db:push`, `scripts/push-schema.mjs`, the
`scripts/apply-*.mjs` files and two local migrations, so nobody can say from the
repo what production contains.

These stop being used:

- `npm run db:push` (now prints a refusal and exits 1). `drizzle-kit push`
  changes the database directly with no reviewable file and no record, and it
  can offer to drop columns. Do not run `npx drizzle-kit push` either.
- `scripts/push-schema.mjs`. **Never run it.** It starts with `DROP TABLE` on
  users, orders, products, admins and carts, and would destroy the store.
- `scripts/apply-*.mjs`. They worked, but each is a separate record of schema
  that `lib/schema.ts` does not know about. They stay in the repo as history
  until the baseline is marked applied.

## The baseline

`drizzle/0000_baseline.sql` creates the whole `lib/schema.ts` schema from empty.

**Never execute it on the existing production database.** Its `CREATE TABLE`
statements have no `IF NOT EXISTS`, so it would fail on production. It exists to
build new databases and to give later migrations a starting snapshot.

A migration is skipped when `drizzle.__drizzle_migrations` already has a row
with a `created_at` at or after that migration's `when` in
`drizzle/meta/_journal.json`. The migrator looks only at the newest row's
`created_at`; the hash is recorded but not compared.

Marking the baseline as applied, per database (staging first):

1. Compare, and resolve every difference (see the next section). Marking a
   database that does not match hides the mismatch permanently.

   ```sh
   DATABASE_URL='<url from the password manager>' node scripts/compare-schema.mjs
   ```

   Put a space before the command, or use your shell's equivalent, to keep the
   URL out of history. It also reports whether the migrations table exists.
2. If it does exist, look at it first. A run of the two old local migrations
   would have left rows there, dated August 2026. Those rows do not count as the
   baseline, because they are older than its `when`.

   ```sql
   SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;
   ```

3. Take a Neon branch or dump, then record the baseline as applied. This writes
   only to the `drizzle` schema and leaves application tables alone:

   ```sql
   CREATE SCHEMA IF NOT EXISTS drizzle;
   CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
     id SERIAL PRIMARY KEY,
     hash text NOT NULL,
     created_at bigint
   );
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   VALUES ('5a41b53bfa028c9734fd39557d153ed270932ac145ae9d3a2a84b643afbacc6e', 1793647106790);
   ```

   The hash is `shasum -a 256 drizzle/0000_baseline.sql` and the number is the
   baseline's `when` in the journal. Do not edit the baseline after this.
4. Check with `npx drizzle-kit migrate` on **staging** (explicit `DATABASE_URL`):
   it must apply nothing and change nothing. Only then mark production.

A brand-new empty database does not need marking: `npx drizzle-kit migrate` runs
the baseline for real. Seed the first admin afterwards with
`scripts/seed-admin.mjs`, not `push-schema.mjs`.

### Local folder in the main checkout

The main checkout has an old, ignored `drizzle/` with `0000_lowly_fantastic_four`
and `0001_harsh_yellowjacket`. Once `drizzle/` is tracked, git will refuse to
check out or merge over those files. Move that folder out of the repo first, and
keep the copy: it is the only record of those two migrations.

## Future schema changes

1. Edit `lib/schema.ts`.
2. Generate, with a dummy URL because generate never connects:

   ```sh
   DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy \
     npm run db:generate -- --name <what_changed>
   ```

3. Review the SQL as part of the pull request. Check for `DROP`, for renames that
   were generated as drop plus add, for `NOT NULL` without a default on a
   populated table, and for locks on large tables. Commit the `.sql` file and the
   `meta/` changes together. Never edit a migration that has been applied.
4. Staging: `DATABASE_URL=<staging> npx drizzle-kit migrate`, deploy the matching
   image there, test, then run `compare-schema.mjs` against staging.
5. Production: take a Neon branch or dump, then migrate with the production URL.
   Add columns before deploying code that needs them. Remove columns only after
   no deployed image reads them. Migrating wakes the Neon compute once, which is
   fine; nothing may do so on a timer (see the project notes on the free plan).
6. Run `compare-schema.mjs` against production. It should report no differences.

## What the hand scripts contain that lib/schema.ts lacks

From reading the scripts and generating the baseline on 2026-11-03. No script,
in `scripts/`, `lib/` or `app/`, creates a trigger, function, extension, view,
policy, role or grant, and every index name in the scripts is in the baseline.
These are the differences. Which ones apply to production is unknown until
`compare-schema.mjs` has run.

| Item | Source | In lib/schema.ts | What to do |
| :--- | :--- | :--- | :--- |
| `products.category`, `products.subcategory`, `products.tags`, `coupons.category`, type `category` | `push-schema.mjs`, old local migrations. Removed only by `apply-catalogue-schema.mjs --drop` | Absent, replaced by `category_id` and `product_tags` | If still present: confirm the data moved, then remove them in a generated migration |
| `products_slug_key`, `users_email_key`, `admins_email_key`, `orders_order_id_key`, `carts_user_id_key` (unique constraints from inline `UNIQUE`) | `push-schema.mjs` | Unique indexes `idx_*_slug`, `idx_*_email`, and so on | A database built by this script may have the constraint, the index, or both. Not checked by `compare-schema.mjs`; use the index query below |
| `users.password_hash NOT NULL` | `push-schema.mjs` and the old local `0000` | Nullable (social sign-in) | Reported by `compare-schema.mjs`. If `NOT NULL`, Google and Apple sign-up cannot insert |
| `orders.shipping_address DEFAULT '{}'` | `push-schema.mjs` | No default | Reported by `compare-schema.mjs`. Harmless; align it in a migration |
| FK names `woo_oauth_nonces_key_id_fkey`, `order_notes_order_id_fkey` (Postgres default names) | `apply-connector-schema.mjs` | `..._api_keys_id_fk`, `..._orders_id_fk` | Same behaviour, but a later migration that drops one by name would fail. Check names before writing one |
| `admins` row with a known password hash | `push-schema.mjs` seed step, whose comment also states the password | Data, not schema | Confirm production's admin password is not that value; rotate if unsure |
| Data work: `seed-admin`, `seed-catalogue`, `import-photos`, `reset-admin-password` | `scripts/` | Not schema | Still used when needed. A new database has the tables but no rows |

The other direction also matters: `users.auth_provider` and `users.provider_id`
are in `lib/schema.ts`, but no tracked script or local migration creates them. If
they exist on production, an untracked `db:push` added them. If not, social
sign-in fails there. `compare-schema.mjs` reports either case.

## Checks compare-schema.mjs does not cover

It uses `information_schema` only, so it sees no indexes, and it does not compare
foreign keys, enum labels or default expressions. For indexes, read-only, compare
by hand with `drizzle/0000_baseline.sql`:

```sql
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' ORDER BY tablename, indexname;
```

`information_schema` also lists only what the connecting role can access. Use a
role with `SELECT` on all tables, or the report shows them as missing.
