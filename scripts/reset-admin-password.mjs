/**
 * Reset an admin password.
 *
 * The password is taken as an argument and hashed locally with bcrypt at the
 * same cost factor as lib/auth.ts (12). Only the hash is sent to the database —
 * the plaintext never leaves this process.
 *
 * Also clears any recorded failed login attempts for the account, since
 * lib/admin-login-guard.ts locks out after 5 failures in 15 minutes and a
 * forgotten password usually means that limit is already hit.
 *
 * Usage:
 *   node scripts/reset-admin-password.mjs admin@modestummah.com 'new-password'
 *
 * Tip: put a leading space before the command so it stays out of your shell
 * history, and use single quotes so the shell does not expand anything.
 */

import bcrypt from 'bcryptjs';

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error(
    "Usage: node scripts/reset-admin-password.mjs <email> '<new-password>'"
  );
  process.exit(1);
}

if (password.length < 12) {
  console.error('Password must be at least 12 characters.');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Load your .env first.');
  process.exit(1);
}

const parsed = new URL(DATABASE_URL.replace('postgresql://', 'http://'));
const host = parsed.hostname.replace('-pooler.', '.');

async function query(sql, params = []) {
  const res = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': DATABASE_URL.split('&channel_binding')[0],
    },
    body: JSON.stringify({ query: sql, params }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

const hash = await bcrypt.hash(password, 12);

const updated = await query(
  'UPDATE admins SET password_hash = $1, updated_at = now() WHERE email = $2 RETURNING email',
  [hash, email]
);

if (updated.rows.length === 0) {
  console.error(`No admin found with email ${email}.`);
  const all = await query('SELECT email FROM admins', []);
  console.error('Existing admins:', all.rows.map((r) => r.email).join(', ') || '(none)');
  process.exit(1);
}

const cleared = await query(
  'DELETE FROM admin_login_attempts WHERE email = $1 RETURNING id',
  [email]
);

console.log(`Password reset for ${email}.`);
console.log(`Cleared ${cleared.rows.length} failed login attempt(s) / lockout.`);
console.log('\nSign in at /admin/login with that email and your new password.');
