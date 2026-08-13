import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run with: DATABASE_URL=... node scripts/seed-admin.mjs');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@modestummah.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error('ADMIN_PASSWORD is not set. Run with: ADMIN_PASSWORD=... node scripts/seed-admin.mjs');
  process.exit(1);
}

async function seedAdmin() {
  const email = ADMIN_EMAIL;
  const password = ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';

  // Check if admin already exists
  const existing = await sql`SELECT id, email FROM admins WHERE email = ${email}`;

  if (existing.length > 0) {
    console.log(`Admin already exists: ${existing[0].email} (id: ${existing[0].id})`);

    // Only reset the password when explicitly asked, so a routine re-run
    // cannot silently change the live admin credential.
    if (process.env.RESET_PASSWORD === 'true') {
      const hash = await bcrypt.hash(password, 12);
      await sql`UPDATE admins SET password_hash = ${hash}, updated_at = NOW() WHERE email = ${email}`;
      console.log('Password reset for existing admin.');
    } else {
      console.log('Password left unchanged. Re-run with RESET_PASSWORD=true to reset it.');
    }
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await sql`
    INSERT INTO admins (email, name, password_hash, created_at, updated_at)
    VALUES (${email}, ${name}, ${hash}, NOW(), NOW())
    RETURNING id, email
  `;

  console.log(`Admin created: ${result[0].email} (id: ${result[0].id})`);
}

seedAdmin().catch(console.error);