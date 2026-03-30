/**
 * Push schema to Neon via raw HTTP — zero dependencies required.
 * Uses Neon's HTTP query API endpoint directly.
 */

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

// Parse the connection string to get the host
const parsed = new URL(DATABASE_URL.replace('postgresql://', 'http://'));
const host = parsed.hostname.replace('-pooler.', '.');  // Use non-pooler for DDL

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
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

const steps = [
  // Clean slate
  ['Drop carts', 'DROP TABLE IF EXISTS carts CASCADE'],
  ['Drop orders', 'DROP TABLE IF EXISTS orders CASCADE'],
  ['Drop products', 'DROP TABLE IF EXISTS products CASCADE'],
  ['Drop admins', 'DROP TABLE IF EXISTS admins CASCADE'],
  ['Drop users', 'DROP TABLE IF EXISTS users CASCADE'],
  ['Drop category enum', 'DROP TYPE IF EXISTS category CASCADE'],
  ['Drop order_status enum', 'DROP TYPE IF EXISTS order_status CASCADE'],
  ['Drop payment_status enum', 'DROP TYPE IF EXISTS payment_status CASCADE'],
  
  // Enums
  ['Create category', "CREATE TYPE category AS ENUM ('men', 'women', 'accessories')"],
  ['Create order_status', "CREATE TYPE order_status AS ENUM ('pending', 'pending_payment', 'processing', 'shipped', 'delivered', 'cancelled')"],
  ['Create payment_status', "CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded', 'partial')"],
  
  // Tables
  ['Create users', "CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL UNIQUE, name TEXT DEFAULT '', password_hash TEXT NOT NULL, avatar TEXT, verified BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT now() NOT NULL, updated_at TIMESTAMP DEFAULT now() NOT NULL)"],
  ['Create admins', "CREATE TABLE admins (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL UNIQUE, name TEXT DEFAULT 'Admin', password_hash TEXT NOT NULL, created_at TIMESTAMP DEFAULT now() NOT NULL, updated_at TIMESTAMP DEFAULT now() NOT NULL)"],
  ['Create products', "CREATE TABLE products (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', short_description TEXT NOT NULL DEFAULT '', price DECIMAL(10,2) NOT NULL DEFAULT 0, compare_at_price DECIMAL(10,2), category category NOT NULL DEFAULT 'men', subcategory TEXT NOT NULL DEFAULT '', images JSONB DEFAULT '[]', colors JSONB DEFAULT '[]', sizes JSONB DEFAULT '[]', tags JSONB DEFAULT '[]', featured BOOLEAN DEFAULT false, in_stock BOOLEAN DEFAULT true, stock_quantity INTEGER DEFAULT 0, sku TEXT NOT NULL DEFAULT '', weight DECIMAL(8,2), dimensions TEXT, similar_products JSONB DEFAULT '[]', created_at TIMESTAMP DEFAULT now() NOT NULL, updated_at TIMESTAMP DEFAULT now() NOT NULL)"],
  ['Create orders', "CREATE TABLE orders (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id TEXT NOT NULL UNIQUE, user_id UUID REFERENCES users(id) ON DELETE SET NULL, email TEXT NOT NULL, items JSONB NOT NULL DEFAULT '[]', subtotal DECIMAL(10,2) NOT NULL DEFAULT 0, shipping DECIMAL(10,2) NOT NULL DEFAULT 0, tax DECIMAL(10,2) NOT NULL DEFAULT 0, total DECIMAL(10,2) NOT NULL DEFAULT 0, status order_status NOT NULL DEFAULT 'pending', payment_status payment_status NOT NULL DEFAULT 'pending', payment_intent_id TEXT, shipping_address JSONB NOT NULL DEFAULT '{}', billing_address JSONB, notes TEXT, shipping_service TEXT, created_at TIMESTAMP DEFAULT now() NOT NULL, updated_at TIMESTAMP DEFAULT now() NOT NULL)"],
  ['Create carts', "CREATE TABLE carts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, items JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMP DEFAULT now() NOT NULL, updated_at TIMESTAMP DEFAULT now() NOT NULL)"],
  
  // Indexes
  ['Index products.category', 'CREATE INDEX idx_products_category ON products (category)'],
  ['Index products.featured', 'CREATE INDEX idx_products_featured ON products (featured)'],
  ['Index products.sku', 'CREATE INDEX idx_products_sku ON products (sku)'],
  ['Index orders.user_id', 'CREATE INDEX idx_orders_user_id ON orders (user_id)'],
  ['Index orders.status', 'CREATE INDEX idx_orders_status ON orders (status)'],
  ['Index orders.payment', 'CREATE INDEX idx_orders_payment_status ON orders (payment_status)'],
  ['Index orders.created_at', 'CREATE INDEX idx_orders_created_at ON orders (created_at)'],
  
  // Seed admin (hash for "ModestAdmin2026")
  ['Seed admin', "INSERT INTO admins (email, name, password_hash) VALUES ('admin@modestummah.com', 'Admin', '$2a$12$LK8W.j/DcTgEwBqGLhLsR.qKHdCT9UvR8l8Lx5jBv.fYwv5qZkKOy') ON CONFLICT (email) DO NOTHING"],
];

async function main() {
  console.log('🗄️  Pushing schema to Neon...');
  console.log(`   Host: ${host}`);
  console.log('');
  
  let ok = 0, fail = 0;
  for (const [name, sql] of steps) {
    try {
      await query(sql);
      console.log(`  ✅ ${name}`);
      ok++;
    } catch (e) {
      console.error(`  ❌ ${name}: ${e.message.substring(0, 100)}`);
      fail++;
    }
  }
  
  console.log('');
  console.log(`📊 ${ok} succeeded, ${fail} failed`);
  
  // Verify
  console.log('');
  console.log('🔍 Verifying tables...');
  try {
    const result = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    const tables = result.rows?.map(r => r[0]) || [];
    console.log(`  Tables: ${tables.join(', ')}`);
  } catch (e) {
    console.log('  Could not verify:', e.message.substring(0, 80));
  }
  
  console.log('');
  console.log('🎉 Done!');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
