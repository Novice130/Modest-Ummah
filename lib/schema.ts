import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
  uuid,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ─── Enums ──────────────────────────────────────────────
export const categoryEnum = pgEnum('category', ['men', 'women', 'accessories']);
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'pending_payment',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
]);
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'paid',
  'failed',
  'refunded',
  'partial',
]);

// ─── Users ──────────────────────────────────────────────
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    name: text('name').default(''),
    passwordHash: text('password_hash').notNull(),
    avatar: text('avatar'),
    verified: boolean('verified').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_users_email').on(table.email),
  ]
);

// ─── Admins ─────────────────────────────────────────────
export const admins = pgTable(
  'admins',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    name: text('name').default('Admin'),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_admins_email').on(table.email),
  ]
);

// ─── Products ───────────────────────────────────────────
export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    shortDescription: text('short_description').notNull().default(''),
    price: decimal('price', { precision: 10, scale: 2 }).notNull().default('0'),
    compareAtPrice: decimal('compare_at_price', { precision: 10, scale: 2 }),
    category: categoryEnum('category').notNull().default('men'),
    subcategory: text('subcategory').notNull().default(''),
    images: jsonb('images').$type<string[]>().default([]),
    colors: jsonb('colors').$type<{ name: string; value: string; image?: string }[]>().default([]),
    sizes: jsonb('sizes').$type<string[]>().default([]),
    tags: jsonb('tags').$type<string[]>().default([]),
    featured: boolean('featured').default(false),
    inStock: boolean('in_stock').default(true),
    stockQuantity: integer('stock_quantity').default(0),
    sku: text('sku').notNull().default(''),
    weight: decimal('weight', { precision: 8, scale: 2 }),
    dimensions: text('dimensions'),
    similarProducts: jsonb('similar_products').$type<string[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_products_slug').on(table.slug),
    index('idx_products_category').on(table.category),
    index('idx_products_featured').on(table.featured),
    index('idx_products_sku').on(table.sku),
  ]
);

// ─── Orders ─────────────────────────────────────────────
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: text('order_id').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    items: jsonb('items').$type<OrderItem[]>().notNull().default([]),
    subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull().default('0'),
    shipping: decimal('shipping', { precision: 10, scale: 2 }).notNull().default('0'),
    tax: decimal('tax', { precision: 10, scale: 2 }).notNull().default('0'),
    total: decimal('total', { precision: 10, scale: 2 }).notNull().default('0'),
    status: orderStatusEnum('status').notNull().default('pending'),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
    paymentIntentId: text('payment_intent_id'),
    shippingAddress: jsonb('shipping_address').$type<ShippingAddressDB>().notNull(),
    billingAddress: jsonb('billing_address').$type<ShippingAddressDB>(),
    notes: text('notes'),
    shippingService: text('shipping_service'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_orders_order_id').on(table.orderId),
    index('idx_orders_user_id').on(table.userId),
    index('idx_orders_status').on(table.status),
    index('idx_orders_payment_status').on(table.paymentStatus),
    index('idx_orders_created_at').on(table.createdAt),
  ]
);

// ─── Carts ──────────────────────────────────────────────
export const carts = pgTable(
  'carts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    items: jsonb('items').$type<CartItemDB[]>().notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_carts_user_id').on(table.userId),
  ]
);

// ─── Stripe webhook idempotency ─────────────────────────
export const stripeEvents = pgTable(
  'stripe_events',
  {
    eventId: text('event_id').primaryKey(),
    type: text('type').notNull(),
    processedAt: timestamp('processed_at').defaultNow().notNull(),
  }
);

// ─── Admin login rate limiting ──────────────────────────
export const adminLoginAttempts = pgTable(
  'admin_login_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    ip: text('ip').notNull(),
    attemptedAt: timestamp('attempted_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_admin_attempts_email_time').on(table.email, table.attemptedAt),
    index('idx_admin_attempts_ip_time').on(table.ip, table.attemptedAt),
  ]
);

// ─── TypeScript types for JSON columns ──────────────────

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  color?: string;
  size?: string;
  image?: string;
  sku?: string;
}

export interface ShippingAddressDB {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface CartItemDB {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  color?: string;
  size?: string;
  image?: string;
}

// ─── Inferred types ─────────────────────────────────────
export type UserSelect = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type AdminSelect = typeof admins.$inferSelect;
export type AdminInsert = typeof admins.$inferInsert;
export type ProductSelect = typeof products.$inferSelect;
export type ProductInsert = typeof products.$inferInsert;
export type OrderSelect = typeof orders.$inferSelect;
export type OrderInsert = typeof orders.$inferInsert;
export type CartSelect = typeof carts.$inferSelect;
export type CartInsert = typeof carts.$inferInsert;
