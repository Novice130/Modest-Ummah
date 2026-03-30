import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Create a Neon HTTP client — works in both Node.js and edge environments
function createDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Please set it in your .env file.\n' +
      'Get your connection string from: https://console.neon.tech'
    );
  }
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

// Singleton for serverless environments
let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export type Database = ReturnType<typeof getDb>;

// Re-export schema for convenience
export { schema };
