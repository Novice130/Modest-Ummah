/**
 * Data Access Layer — Drizzle/Neon Backend
 * 
 * This file replaces the original PocketBase SDK-based implementation.
 * It exports the SAME function signatures so all consumer files continue working.
 * 
 * Server-side functions use Drizzle directly.
 * Client-side auth uses a custom AuthStore backed by localStorage + API calls.
 */

import { getDb } from './db';
import {
  users,
  admins,
  products,
  orders,
  carts,
  type UserSelect,
  type ProductSelect,
  type OrderSelect,
  type CartSelect,
  type OrderItem,
  type ShippingAddressDB,
  type CartItemDB,
} from './schema';
import { eq, like, or, desc, and, sql, count } from 'drizzle-orm';
import type { Product, User, Order, Cart, CartItem, Admin } from '@/types';

// ─── Client-Side Auth Store ─────────────────────────────
// Mimics PocketBase's authStore interface for client-side compatibility

class ClientAuthStore {
  private _token: string | null = null;
  private _model: any = null;
  private _listeners: Set<() => void> = new Set();
  private _storageKey: string;

  constructor(storageKey = 'mu_auth') {
    this._storageKey = storageKey;
    if (typeof window !== 'undefined') {
      this._loadFromStorage();
    }
  }

  private _loadFromStorage() {
    try {
      const stored = localStorage.getItem(this._storageKey);
      if (stored) {
        const { token, model } = JSON.parse(stored);
        this._token = token;
        this._model = model;
      }
    } catch (e) {
      console.error('Auth store load error:', e);
    }
  }

  private _saveToStorage() {
    try {
      if (this._token && this._model) {
        localStorage.setItem(
          this._storageKey,
          JSON.stringify({ token: this._token, model: this._model })
        );
      } else {
        localStorage.removeItem(this._storageKey);
      }
    } catch (e) {
      console.error('Auth store save error:', e);
    }
  }

  get isValid(): boolean {
    return !!this._token;
  }

  get model(): any {
    return this._model;
  }

  get token(): string | null {
    return this._token;
  }

  save(token: string, model: any) {
    this._token = token;
    this._model = model;
    this._saveToStorage();
    this._notify();
  }

  clear() {
    this._token = null;
    this._model = null;
    this._saveToStorage();
    this._notify();
  }

  onChange(callback: () => void) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  private _notify() {
    this._listeners.forEach((cb) => cb());
  }

  exportToCookie(options?: any): string {
    if (this._token) {
      return `auth_token=${this._token}; path=/; max-age=604800${
        typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; secure' : ''
      }`;
    }
    return 'auth_token=; path=/; max-age=0';
  }
}

// ─── Singletons ─────────────────────────────────────────

let _userAuthStore: ClientAuthStore | null = null;
let _adminAuthStore: ClientAuthStore | null = null;

function getUserAuthStore(): ClientAuthStore {
  if (typeof window === 'undefined') {
    // Server-side: return a no-op store
    return new ClientAuthStore('mu_auth_server');
  }
  if (!_userAuthStore) {
    _userAuthStore = new ClientAuthStore('mu_auth');
  }
  return _userAuthStore;
}

function getAdminAuthStore(): ClientAuthStore {
  if (typeof window === 'undefined') {
    return new ClientAuthStore('mu_admin_auth_server');
  }
  if (!_adminAuthStore) {
    _adminAuthStore = new ClientAuthStore('mu_admin_auth');
  }
  return _adminAuthStore;
}

// ─── Client-like Interface ──────────────────────────────
// getPocketBase() and getAdminPocketBase() return objects with .authStore

interface PBLikeClient {
  authStore: ClientAuthStore;
  collection: (name: string) => any;
  admins: {
    authWithPassword: (email: string, password: string) => Promise<any>;
  };
}

export function getPocketBase(): PBLikeClient {
  const store = getUserAuthStore();
  return {
    authStore: store,
    collection: (name: string) => createCollectionProxy(name, store),
    admins: {
      authWithPassword: async () => {
        throw new Error('Use getAdminPocketBase() for admin auth');
      },
    },
  };
}

export function getAdminPocketBase(): PBLikeClient {
  const store = getAdminAuthStore();
  return {
    authStore: store,
    collection: (name: string) => createCollectionProxy(name, store),
    admins: {
      authWithPassword: async (email: string, password: string) => {
        return adminSignIn(email, password);
      },
    },
  };
}

function createCollectionProxy(name: string, authStore: ClientAuthStore) {
  const baseUrl = '/api';
  const headers = () => ({
    'Content-Type': 'application/json',
    ...(authStore.token
      ? { Authorization: `Bearer ${authStore.token}` }
      : {}),
  });

  return {
    // Used in customer page
    async getList<T>(page = 1, perPage = 50, options?: any): Promise<{ items: T[]; totalItems: number; totalPages: number; page: number; perPage: number }> {
      const params = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
        collection: name,
      });
      if (options?.filter) params.set('filter', options.filter);
      if (options?.sort) params.set('sort', options.sort);

      const res = await fetch(`${baseUrl}/data?${params}`, {
        headers: headers(),
      });
      if (!res.ok) throw new Error(`Failed to fetch ${name}`);
      return res.json();
    },

    async authWithPassword(email: string, password: string) {
      return signIn(email, password);
    },

    async authWithOAuth2(opts: { provider: string }) {
      return signInWithGoogle();
    },
  };
}

// ─── Conversion Helpers ─────────────────────────────────

function dbProductToProduct(p: ProductSelect): Product {
  return {
    id: p.id,
    collectionId: 'products',
    collectionName: 'products',
    created: p.createdAt.toISOString(),
    updated: p.updatedAt.toISOString(),
    name: p.name,
    slug: p.slug,
    description: p.description,
    shortDescription: p.shortDescription,
    price: parseFloat(p.price as string),
    compareAtPrice: p.compareAtPrice ? parseFloat(p.compareAtPrice as string) : undefined,
    category: p.category as 'men' | 'women' | 'accessories',
    subcategory: p.subcategory,
    images: (p.images || []) as string[],
    colors: (p.colors || []) as any[],
    sizes: (p.sizes || []) as string[],
    tags: (p.tags || []) as string[],
    featured: p.featured ?? false,
    inStock: p.inStock ?? true,
    stockQuantity: p.stockQuantity ?? 0,
    sku: p.sku,
    weight: p.weight ? parseFloat(p.weight as string) : undefined,
    dimensions: p.dimensions || undefined,
    similarProducts: (p.similarProducts || []) as string[],
  };
}

function dbOrderToOrder(o: OrderSelect): Order {
  return {
    id: o.id,
    collectionId: 'orders',
    collectionName: 'orders',
    created: o.createdAt.toISOString(),
    updated: o.updatedAt.toISOString(),
    orderId: o.orderId,
    user: o.userId || undefined,
    email: o.email,
    items: JSON.stringify(o.items || []),
    subtotal: parseFloat(o.subtotal as string),
    shipping: parseFloat(o.shipping as string),
    tax: parseFloat(o.tax as string),
    total: parseFloat(o.total as string),
    status: o.status as any,
    paymentStatus: o.paymentStatus as any,
    paymentIntentId: o.paymentIntentId || undefined,
    shippingAddress: (o.shippingAddress || {}) as any,
    billingAddress: o.billingAddress as any,
    notes: o.notes || undefined,
  };
}

function dbUserToUser(u: UserSelect): User {
  return {
    id: u.id,
    collectionId: 'users',
    collectionName: 'users',
    created: u.createdAt.toISOString(),
    updated: u.updatedAt.toISOString(),
    email: u.email,
    name: u.name || '',
    avatar: u.avatar || undefined,
    verified: u.verified ?? false,
  };
}

// ─── Products ───────────────────────────────────────────

export async function getProducts(options?: {
  page?: number;
  perPage?: number;
  filter?: string;
  sort?: string;
  expand?: string;
}) {
  const db = getDb();
  const page = options?.page || 1;
  const perPage = options?.perPage || 12;
  const offset = (page - 1) * perPage;

  const conditions: any[] = [];
  if (options?.filter) {
    // Parse simple PocketBase-style filters
    const filter = options.filter;
    if (filter.includes('category=')) {
      const match = filter.match(/category="([^"]+)"/);
      if (match) conditions.push(eq(products.category, match[1] as any));
    }
    if (filter.includes('featured=true')) {
      conditions.push(eq(products.featured, true));
    }
    if (filter.includes('inStock=true')) {
      conditions.push(eq(products.inStock, true));
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: count() })
    .from(products)
    .where(where);

  const items = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(desc(products.createdAt))
    .limit(perPage)
    .offset(offset);

  const totalItems = countResult?.count || 0;

  return {
    page,
    perPage,
    totalPages: Math.ceil(totalItems / perPage),
    totalItems,
    items: items.map(dbProductToProduct),
  };
}

export async function getProduct(idOrSlug: string): Promise<Product> {
  const db = getDb();

  // Try by ID first, then by slug
  let [result] = await db
    .select()
    .from(products)
    .where(eq(products.id, idOrSlug))
    .limit(1);

  if (!result) {
    [result] = await db
      .select()
      .from(products)
      .where(eq(products.slug, idOrSlug))
      .limit(1);
  }

  if (!result) throw new Error('Product not found');
  return dbProductToProduct(result);
}

export async function getFeaturedProducts(category?: string) {
  const db = getDb();
  const conditions = [eq(products.featured, true)];
  if (category) {
    conditions.push(eq(products.category, category as any));
  }

  const items = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt))
    .limit(8);

  return {
    page: 1,
    perPage: 8,
    totalPages: 1,
    totalItems: items.length,
    items: items.map(dbProductToProduct),
  };
}

export async function getRelatedProducts(product: Product, limit = 4) {
  const db = getDb();
  const items = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.category, product.category as any),
        sql`${products.id} != ${product.id}`
      )
    )
    .orderBy(desc(products.createdAt))
    .limit(limit);

  return {
    page: 1,
    perPage: limit,
    totalPages: 1,
    totalItems: items.length,
    items: items.map(dbProductToProduct),
  };
}

export async function searchProducts(query: string) {
  const db = getDb();
  const searchPattern = `%${query}%`;
  const items = await db
    .select()
    .from(products)
    .where(
      or(
        like(products.name, searchPattern),
        like(products.description, searchPattern)
      )
    )
    .orderBy(desc(products.createdAt))
    .limit(20);

  return {
    page: 1,
    perPage: 20,
    totalPages: 1,
    totalItems: items.length,
    items: items.map(dbProductToProduct),
  };
}

// ─── Auth ───────────────────────────────────────────────

export async function signUp(email: string, password: string, name: string) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to create account.');
  }

  const data = await res.json();
  const store = getUserAuthStore();
  store.save(data.token, data.record);
  return data.record;
}

export async function signIn(email: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json();
    if (res.status === 0) throw new Error('Cannot connect to server.');
    if (res.status === 401) throw new Error('Invalid email or password.');
    throw new Error(data.error || 'Something went wrong.');
  }

  const data = await res.json();
  const store = getUserAuthStore();
  store.save(data.token, data.record);
  return data;
}

export async function signInWithGoogle() {
  // Google OAuth would require a full OAuth flow with NextAuth or custom implementation
  // For now, throw a friendly error
  throw new Error('Google sign-in is being reconfigured. Please use email/password.');
}

export async function signOut() {
  const store = getUserAuthStore();
  store.clear();
  // Also clear the cookie
  document.cookie = 'auth_token=; path=/; max-age=0';
}

export function getCurrentUser(): User | null {
  const store = getUserAuthStore();
  if (!store.isValid) return null;
  return store.model as User;
}

export function isAuthenticated(): boolean {
  const store = getUserAuthStore();
  return store.isValid;
}

// ─── Cart ───────────────────────────────────────────────

export async function getCart(userId?: string): Promise<Cart | null> {
  if (!userId) return null;

  const db = getDb();
  const [result] = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);

  if (!result) return null;

  return {
    id: result.id,
    collectionId: 'carts',
    collectionName: 'carts',
    created: result.createdAt.toISOString(),
    updated: result.updatedAt.toISOString(),
    user: result.userId,
    items: JSON.stringify(result.items || []),
  };
}

export async function createOrUpdateCart(userId: string, items: CartItem[]) {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(carts)
      .set({
        items: items as CartItemDB[],
        updatedAt: new Date(),
      })
      .where(eq(carts.id, existing.id))
      .returning();

    return {
      id: updated.id,
      collectionId: 'carts',
      collectionName: 'carts',
      created: updated.createdAt.toISOString(),
      updated: updated.updatedAt.toISOString(),
      user: updated.userId,
      items: JSON.stringify(updated.items || []),
    };
  }

  const [created] = await db
    .insert(carts)
    .values({
      userId,
      items: items as CartItemDB[],
    })
    .returning();

  return {
    id: created.id,
    collectionId: 'carts',
    collectionName: 'carts',
    created: created.createdAt.toISOString(),
    updated: created.updatedAt.toISOString(),
    user: created.userId,
    items: JSON.stringify(created.items || []),
  };
}

// ─── Orders ─────────────────────────────────────────────

export async function createOrder(orderData: Partial<Order>) {
  const db = getDb();

  const [created] = await db
    .insert(orders)
    .values({
      orderId: orderData.orderId!,
      userId: orderData.user || null,
      email: orderData.email!,
      items: typeof orderData.items === 'string'
        ? JSON.parse(orderData.items)
        : orderData.items || [],
      subtotal: String(orderData.subtotal || 0),
      shipping: String(orderData.shipping || 0),
      tax: String(orderData.tax || 0),
      total: String(orderData.total || 0),
      status: (orderData.status as any) || 'pending',
      paymentStatus: (orderData.paymentStatus as any) || 'pending',
      paymentIntentId: orderData.paymentIntentId,
      shippingAddress: (typeof orderData.shippingAddress === 'string'
        ? JSON.parse(orderData.shippingAddress)
        : orderData.shippingAddress) as ShippingAddressDB,
      billingAddress: orderData.billingAddress
        ? (typeof orderData.billingAddress === 'string'
          ? JSON.parse(orderData.billingAddress)
          : orderData.billingAddress) as ShippingAddressDB
        : null,
      notes: orderData.notes,
    })
    .returning();

  return dbOrderToOrder(created);
}

export async function getOrders(userId: string) {
  const db = getDb();
  const items = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  return {
    page: 1,
    perPage: 50,
    totalPages: 1,
    totalItems: items.length,
    items: items.map(dbOrderToOrder),
  };
}

export async function getOrder(orderId: string): Promise<Order> {
  const db = getDb();

  // Try by UUID first, then by orderId string
  let [result] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!result) {
    [result] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderId, orderId))
      .limit(1);
  }

  if (!result) throw new Error('Order not found');
  return dbOrderToOrder(result);
}

export async function updateOrder(orderId: string, data: Partial<Order>) {
  const db = getDb();

  const updateData: any = { updatedAt: new Date() };
  if (data.status) updateData.status = data.status;
  if (data.paymentStatus) updateData.paymentStatus = data.paymentStatus;
  if (data.paymentIntentId) updateData.paymentIntentId = data.paymentIntentId;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const [updated] = await db
    .update(orders)
    .set(updateData)
    .where(eq(orders.id, orderId))
    .returning();

  if (!updated) throw new Error('Order not found');
  return dbOrderToOrder(updated);
}

// ─── Admin-Only Functions ───────────────────────────────

export async function getAllProducts(page = 1, perPage = 50, filter = '') {
  const db = getDb();
  const offset = (page - 1) * perPage;

  let where: any = undefined;
  if (filter && filter.trim()) {
    const nameMatch = filter.match(/name~"([^"]+)"/);
    if (nameMatch) {
      where = like(products.name, `%${nameMatch[1]}%`);
    }
  }

  const [countResult] = await db
    .select({ count: count() })
    .from(products)
    .where(where);

  const items = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(desc(products.createdAt))
    .limit(perPage)
    .offset(offset);

  return {
    page,
    perPage,
    totalPages: Math.ceil((countResult?.count || 0) / perPage),
    totalItems: countResult?.count || 0,
    items: items.map(dbProductToProduct),
  };
}

export async function getAllOrders(page = 1, perPage = 50, filter = '') {
  const db = getDb();
  const offset = (page - 1) * perPage;

  let where: any = undefined;
  if (filter && filter.trim()) {
    const emailMatch = filter.match(/email~"([^"]+)"/);
    const orderIdMatch = filter.match(/orderId~"([^"]+)"/);
    const conditions = [];
    if (emailMatch) conditions.push(like(orders.email, `%${emailMatch[1]}%`));
    if (orderIdMatch) conditions.push(like(orders.orderId, `%${orderIdMatch[1]}%`));
    if (conditions.length > 0) where = or(...conditions);
  }

  const [countResult] = await db
    .select({ count: count() })
    .from(orders)
    .where(where);

  const items = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(perPage)
    .offset(offset);

  return {
    page,
    perPage,
    totalPages: Math.ceil((countResult?.count || 0) / perPage),
    totalItems: countResult?.count || 0,
    items: items.map(dbOrderToOrder),
  };
}

export async function adminSignIn(email: string, password: string) {
  const res = await fetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Invalid admin credentials');
  }

  const data = await res.json();
  const store = getAdminAuthStore();
  store.save(data.token, data.admin);
  return data;
}

export function isAdmin(): boolean {
  const store = getAdminAuthStore();
  return store.isValid;
}

export async function createProduct(data: FormData) {
  const db = getDb();

  // Extract product data from FormData
  const productData: any = {};
  const imageUrls: string[] = [];

  data.forEach((value, key) => {
    if (key === 'images' && value instanceof File) {
      // For now, store file names. Real implementation would upload to S3/CDN.
      imageUrls.push(`/uploads/${value.name}`);
    } else if (key === 'colors' || key === 'sizes' || key === 'tags' || key === 'similarProducts') {
      try {
        productData[key] = JSON.parse(value as string);
      } catch {
        productData[key] = [];
      }
    } else {
      productData[key] = value;
    }
  });

  const [created] = await db
    .insert(products)
    .values({
      name: productData.name || '',
      slug: productData.slug || '',
      description: productData.description || '',
      shortDescription: productData.shortDescription || '',
      price: String(productData.price || 0),
      compareAtPrice: productData.compareAtPrice ? String(productData.compareAtPrice) : null,
      category: productData.category || 'men',
      subcategory: productData.subcategory || '',
      images: imageUrls.length > 0 ? imageUrls : (productData.images || []),
      colors: productData.colors || [],
      sizes: productData.sizes || [],
      tags: productData.tags || [],
      featured: productData.featured === 'true' || productData.featured === true,
      inStock: productData.inStock !== 'false',
      stockQuantity: parseInt(productData.stockQuantity || '0', 10),
      sku: productData.sku || '',
      weight: productData.weight ? String(productData.weight) : null,
      dimensions: productData.dimensions || null,
      similarProducts: productData.similarProducts || [],
    })
    .returning();

  return dbProductToProduct(created);
}

export async function updateProduct(id: string, data: FormData) {
  const db = getDb();

  const updateData: any = { updatedAt: new Date() };
  const imageUrls: string[] = [];

  data.forEach((value, key) => {
    if (key === 'images' && value instanceof File) {
      imageUrls.push(`/uploads/${value.name}`);
    } else if (key === 'colors' || key === 'sizes' || key === 'tags' || key === 'similarProducts') {
      try {
        updateData[key] = JSON.parse(value as string);
      } catch {
        updateData[key] = [];
      }
    } else if (key === 'price' || key === 'compareAtPrice' || key === 'weight') {
      updateData[key] = value ? String(value) : null;
    } else if (key === 'featured' || key === 'inStock') {
      updateData[key] = value === 'true' || value === true;
    } else if (key === 'stockQuantity') {
      updateData[key] = parseInt(value as string, 10);
    } else {
      updateData[key] = value;
    }
  });

  if (imageUrls.length > 0) updateData.images = imageUrls;

  const [updated] = await db
    .update(products)
    .set(updateData)
    .where(eq(products.id, id))
    .returning();

  if (!updated) throw new Error('Product not found');
  return dbProductToProduct(updated);
}

export async function deleteProduct(id: string) {
  const db = getDb();
  await db.delete(products).where(eq(products.id, id));
}

// ─── Realtime Subscriptions (Polling Fallback) ──────────
// PocketBase had built-in realtime. We use polling or skip for now.

export function subscribeToCart(userId: string, callback: (data: Cart) => void) {
  // No-op — realtime not available with Neon HTTP driver
  // Could implement with polling or WebSockets in the future
  return Promise.resolve();
}

export function unsubscribeFromCart() {
  // No-op
}
