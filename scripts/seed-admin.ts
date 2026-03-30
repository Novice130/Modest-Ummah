/**
 * Database Seed Script
 * 
 * Run this ONCE after setting up the database to create the initial admin account.
 * 
 * Usage: 
 *   1. Set your DATABASE_URL in .env
 *   2. Run: npx tsx scripts/seed-admin.ts
 *   
 * This will create an admin user with the credentials below.
 * ⚠️ CHANGE THE PASSWORD after first login in production!
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { admins } from '../lib/schema';
import bcrypt from 'bcryptjs';

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set. Please set it in your .env file.');
    process.exit(1);
  }

  console.log('🌱 Seeding database...');
  const sql = neon(databaseUrl);
  const db = drizzle(sql);

  // Create initial admin
  const adminEmail = 'admin@modestummah.com';
  const adminPassword = 'ModestAdmin2026';

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  try {
    await db.insert(admins).values({
      email: adminEmail,
      name: 'Admin',
      passwordHash,
    });
    console.log(`✅ Admin created: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log('   ⚠️ CHANGE THIS PASSWORD after first login!');
  } catch (error: any) {
    if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
      console.log(`ℹ️ Admin already exists: ${adminEmail}`);
    } else {
      console.error('❌ Error creating admin:', error);
    }
  }

  console.log('🌱 Seeding complete!');
}

seed().catch(console.error);
