import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_SZvMx9f6AucU@ep-soft-truth-a840okl3-pooler.eastus2.azure.neon.tech/neondb?sslmode=require';

const sql = neon(DATABASE_URL);

async function seedAdmin() {
  const email = 'admin@modestummah.com';
  const password = 'ModestAdmin';
  const name = 'Admin';

  // Check if admin already exists
  const existing = await sql`SELECT id, email FROM admins WHERE email = ${email}`;

  if (existing.length > 0) {
    console.log(`Admin already exists: ${existing[0].email} (id: ${existing[0].id})`);

    // Update password anyway to ensure it matches
    const hash = await bcrypt.hash(password, 12);
    await sql`UPDATE admins SET password_hash = ${hash}, updated_at = NOW() WHERE email = ${email}`;
    console.log('Password updated to "ModestAdmin"');
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