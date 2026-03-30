// lib/api.ts
// Client-callable wrappers around server actions.

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

export async function signInWithGoogle(): Promise<{ record: { id: string; email: string; name: string } }> {
  window.location.href = '/api/auth/google';
  return new Promise(() => {});
}

export async function adminSignIn(email: string, password: string) {
  return adminSignInAction(email, password);
}

// ─── Orders ──────────────────────────────────────────────

export async function getAllOrders(page = 1, limit = 100, filter = '') {
  return fetchAllOrdersAdmin({ page, limit, filter });
}
