/**
 * Add users.token_version to Neon.
 *
 * A JWT is stateless: one issued before an account was deleted, or before its
 * password was rotated, stayed cryptographically valid until it expired (7d).
 * The counter in this column is stamped into the token as a `ver` claim and
 * checked on every authenticated request, so bumping it retires every token
 * issued before the bump.
 *
 * Additive and idempotent — ADD COLUMN IF NOT EXISTS, safe to re-run.
 *
 * Neon's HTTP /sql endpoint runs ONE statement per request — never put two
 * semicolon-separated statements in a single step, it fails with 42601.
 *
 * Usage:  node --env-file=.env scripts/apply-token-version.mjs
 *         node --env-file=.env scripts/apply-token-version.mjs --dry-run
 */

const DRY_RUN = process.argv.includes('--dry-run');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Load your .env first.');
  process.exit(1);
}

const parsed = new URL(DATABASE_URL.replace('postgresql://', 'http://'));
const host = parsed.hostname.replace('-pooler.', '.'); // non-pooler for DDL

async function query(sql) {
  const res = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': DATABASE_URL.split('&channel_binding')[0],
    },
    body: JSON.stringify({ query: sql, params: [] }),
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const steps = [
  [
    'users.token_version',
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0`,
  ],
];

async function main() {
  console.log(`\nToken revocation column → ${host}${DRY_RUN ? '  (dry run)' : ''}\n`);

  for (const [label, sql] of steps) {
    if (DRY_RUN) {
      console.log(`  would apply: ${label}`);
      continue;
    }
    try {
      await query(sql);
      console.log(`  ok   ${label}`);
    } catch (error) {
      console.error(`  FAIL ${label}: ${error.message}`);
      process.exit(1);
    }
  }

  if (!DRY_RUN) {
    const { rows } = await query(
      `SELECT count(*)::int AS users, count(*) FILTER (WHERE token_version <> 0)::int AS bumped FROM users`
    );
    console.log(`\n  ${rows[0].users} users, ${rows[0].bumped} with a bumped token_version`);
  }

  console.log(DRY_RUN ? '\nDry run complete. Nothing was changed.\n' : '\nSchema applied.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
