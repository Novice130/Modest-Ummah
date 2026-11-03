/**
 * Remove an admin's two-factor enrolment, for a lost phone with no recovery
 * codes left. The next sign-in asks for the password and then goes through setup
 * again. Also clears failed sign-in attempts for the account.
 *
 * Usage (needs the production DATABASE_URL, see docs/admin-2fa.md):
 *   node scripts/reset-admin-2fa.mjs admin@modestummah.com
 */

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error('Usage: node scripts/reset-admin-2fa.mjs <email>');
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

const removed = await query(
  `DELETE FROM admin_totp
   USING admins
   WHERE admin_totp.admin_id = admins.id AND admins.email = $1
   RETURNING admin_totp.admin_id`,
  [email]
);

await query('DELETE FROM admin_login_attempts WHERE email = $1', [email]);

if (removed.rows.length === 0) {
  console.log(`No two-factor enrolment found for ${email}. Failed attempts cleared.`);
} else {
  console.log(`Two-factor removed for ${email}. Failed attempts cleared.`);
}
console.log('Sign in at /admin/login with the password, then set up a new authenticator.');
