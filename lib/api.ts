// lib/api.ts
// Client-callable wrappers around server actions.
// Keeps component imports stable while the underlying implementation
// uses Drizzle/Neon instead of the old PocketBase client.

import {
  fetchProducts,
  createProductAction,
  updateProductAction,
  deleteProductAction,
} from '@/lib/actions/product.actions';

import {
  adminSignInAction,
} from '@/lib/actions/auth.actions';

import {
  fetchAllOrdersAdmin,
} from '@/lib/actions/order.actions';

// ─── Products ───────────────────────────────────────────

export async function getAllProducts(
  page = 1,
  limit = 50,
  _filter = ''
) {
  return fetchProducts({ page, limit });
}

export async function createProduct(data: FormData) {
  const plain: Record<string, any> = {};
  data.forEach((value, key) => {
    if (typeof value === 'string') {
      plain[key] = value;
    }
    // File uploads are handled separately via a storage solution
  });
  return createProductAction(plain);
}

export async function updateProduct(id: string, data: FormData) {
  const plain: Record<string, any> = {};
  data.forEach((value, key) => {
    if (typeof value === 'string') {
      plain[key] = value;
    }
  });
  return updateProductAction(id, plain);
}

export async function deleteProduct(id: string) {
  return deleteProductAction(id);
}

// ─── Auth ────────────────────────────────────────────────

/**
 * Google OAuth sign-in.
 * Redirects to the Google OAuth flow via the Next.js auth route.
 */
export async function signInWithGoogle(): Promise<{ record: { id: string; email: string; name: string } }> {
  window.location.href = '/api/auth/google';
  return new Promise(() => {});
}

/**
 * Admin sign-in via email + password.
 */
export async function adminSignIn(email: string, password: string) {
  return adminSignInAction(email, password);
}

/**
 * Legacy PocketBase compatibility stub.
 * The admin login page dynamically imports this to call authStore.clear()
 * before signing in. No-op in the Drizzle/cookie-based implementation.
 */
export function getAdminPocketBase() {
  return {
    authStore: {
      clear: () => {},
    },
  };
}

/**
 * Legacy PocketBase compatibility stub for user-facing pages.
 */
export function getPocketBase() {
  return {
    authStore: {
      clear: () => {},
      isValid: false,
      model: null,
    },
  };
}

// ─── Orders ──────────────────────────────────────────────

export async function getAllOrders(page = 1, limit = 100, filter = '') {
  return fetchAllOrdersAdmin({ page, limit, filter });
}
