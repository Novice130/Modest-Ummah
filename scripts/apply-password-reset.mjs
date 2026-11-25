/**
 * NOT APPLIED. Add the password_reset_tokens table to Neon.
 *
 * Until this runs, a reset request logs a database error and sends no email,
 * and the customer still sees the generic "check your email" reply.
 *
 * Additive and idempotent: CREATE ... IF NOT EXISTS, safe to re-run.
 *
 * Neon's HTTP /sql endpoint runs ONE statement per request, so each step below
 * is a single statement.
 *
 * Usage:  node --env-file=.env scripts/apply-password-reset.mjs --dry-run
 *         node --env-file=.env scripts/apply-password-reset.mjs
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
    'password_reset_tokens',
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL,
      expires_at timestamp NOT NULL,
      used_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    )`,
  ],
  [
    'idx_password_reset_tokens_hash',
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash)`,
  ],
  [
    'idx_password_reset_tokens_user',
    `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id)`,
  ],
];

async function main() {
  console.log(`\nPassword reset table → ${host}${DRY_RUN ? '  (dry run)' : ''}\n`);

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

  console.log(DRY_RUN ? '\nDry run complete. Nothing was changed.\n' : '\nSchema applied.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
