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
export const productTypeEnum = pgEnum('product_type', ['simple', 'variable']);
export const productStatusEnum = pgEnum('product_status', [
  'draft',
  'pending',
  'scheduled',
  'published',
]);
export const productVisibilityEnum = pgEnum('product_visibility', [
  'public',
  'hidden',
  'search_only',
]);
export const backorderPolicyEnum = pgEnum('backorder_policy', ['no', 'notify', 'yes']);

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
    newArrivalPinned: boolean('new_arrival_pinned').default(false),
    excludeFromNewArrivals: boolean('exclude_from_new_arrivals').default(false),
    inStock: boolean('in_stock').default(true),
    stockQuantity: integer('stock_quantity').default(0),
    sku: text('sku').notNull().default(''),
    weight: decimal('weight', { precision: 8, scale: 2 }),
    dimensions: text('dimensions'),
    similarProducts: jsonb('similar_products').$type<string[]>().default([]),
    // ─── WooCommerce parity columns ─────────────────────
    // Defaults to 'published' so pre-migration rows stay live without a
    // backfill UPDATE. The builder writes 'draft' explicitly for new
    // drafts. published_at is set at the transition INTO 'published'.
    productType: productTypeEnum('product_type').notNull().default('simple'),
    status: productStatusEnum('status').notNull().default('published'),
    visibility: productVisibilityEnum('visibility').notNull().default('public'),
    publishedAt: timestamp('published_at'),
    saleStartsAt: timestamp('sale_starts_at'),
    saleEndsAt: timestamp('sale_ends_at'),
    manageStock: boolean('manage_stock').default(true),
    backorderPolicy: backorderPolicyEnum('backorder_policy').default('no'),
    lowStockThreshold: integer('low_stock_threshold').default(5),
    shippingClass: text('shipping_class'),
    lengthIn: decimal('length_in', { precision: 8, scale: 2 }),
    widthIn: decimal('width_in', { precision: 8, scale: 2 }),
    heightIn: decimal('height_in', { precision: 8, scale: 2 }),
    taxClass: text('tax_class'),
    metaTitle: text('meta_title'),
    metaDescription: text('meta_description'),
    ogImage: text('og_image'),
    upsellIds: jsonb('upsell_ids').$type<string[]>().default([]),
    crossSellIds: jsonb('cross_sell_ids').$type<string[]>().default([]),
    imageAlts: jsonb('image_alts').$type<Record<string, string>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_products_slug').on(table.slug),
    index('idx_products_category').on(table.category),
    index('idx_products_featured').on(table.featured),
    index('idx_products_sku').on(table.sku),
    // New Arrivals: published rows ordered by the moment they went live.
    // Pinned rows float to the top; excluded rows never appear.
    index('idx_products_new_arrivals')
      .on(table.excludeFromNewArrivals, table.newArrivalPinned, table.status, table.publishedAt),
    index('idx_products_status_published').on(table.status, table.publishedAt),
    index('idx_products_featured_published').on(table.featured, table.publishedAt),
  ]
);

// ─── Product variants ───────────────────────────────────
export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    attributes: jsonb('attributes').$type<Record<string, string>>().notNull(),
    price: decimal('price', { precision: 10, scale: 2 }),
    compareAtPrice: decimal('compare_at_price', { precision: 10, scale: 2 }),
    stockQuantity: integer('stock_quantity').default(0),
    inStock: boolean('in_stock').default(true),
    image: text('image'),
    weight: decimal('weight', { precision: 8, scale: 2 }),
    position: integer('position').default(0),
  },
  (table) => [
    uniqueIndex('idx_variants_sku').on(table.sku),
    index('idx_variants_product').on(table.productId),
  ]
);

// ─── Categories (replaces the hardcoded 3-value enum) ────
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    parentId: uuid('parent_id').references((): any => categories.id, { onDelete: 'cascade' }),
    description: text('description').default(''),
    image: text('image'),
    position: integer('position').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_categories_slug').on(table.slug),
    index('idx_categories_parent').on(table.parentId),
  ]
);

// ─── Product attributes ─────────────────────────────────
export const productAttributes = pgTable(
  'product_attributes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    terms: jsonb('terms').$type<string[]>().notNull().default([]),
    usedForVariations: boolean('used_for_variations').default(false),
    position: integer('position').default(0),
  },
  (table) => [
    index('idx_attributes_product').on(table.productId),
  ]
);

// ─── Settings (single-row key/value) ────────────────────
export const settings = pgTable(
  'settings',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  }
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
  variantId?: string;
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
  variantId?: string;
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
export type ProductVariantSelect = typeof productVariants.$inferSelect;
export type ProductVariantInsert = typeof productVariants.$inferInsert;
export type CategorySelect = typeof categories.$inferSelect;
export type CategoryInsert = typeof categories.$inferInsert;
export type ProductAttributeSelect = typeof productAttributes.$inferSelect;
export type ProductAttributeInsert = typeof productAttributes.$inferInsert;
export type SettingSelect = typeof settings.$inferSelect;
export type SettingInsert = typeof settings.$inferInsert;
