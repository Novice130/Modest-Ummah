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
  // Trigger the Google OAuth redirect
  window.location.href = '/api/auth/google';
  // Return a promise that never resolves (navigation happens)
  return new Promise(() => {});
}
