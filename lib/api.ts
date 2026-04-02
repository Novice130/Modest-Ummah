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
  // Upload image files first if any
  const imageFiles: File[] = [];
  const plain: Record<string, any> = {};

  data.forEach((value, key) => {
    if (key === 'images' && value instanceof File) {
      imageFiles.push(value);
    } else if (typeof value === 'string') {
      plain[key] = value;
    }
  });

  if (imageFiles.length > 0) {
    const uploadForm = new FormData();
    imageFiles.forEach(f => uploadForm.append('files', f));
    const res = await fetch('/api/upload', { method: 'POST', body: uploadForm });
    if (res.ok) {
      const { urls } = await res.json();
      // Merge with any existing image URLs
      const existing = plain.images ? JSON.parse(plain.images) : [];
      plain.images = JSON.stringify([...existing, ...urls]);
    }
  }

  return createProductAction(plain);
}

export async function updateProduct(id: string, data: FormData) {
  const imageFiles: File[] = [];
  const plain: Record<string, any> = {};

  data.forEach((value, key) => {
    if (key === 'images' && value instanceof File) {
      imageFiles.push(value);
    } else if (typeof value === 'string') {
      plain[key] = value;
    }
  });

  if (imageFiles.length > 0) {
    const uploadForm = new FormData();
    imageFiles.forEach(f => uploadForm.append('files', f));
    const res = await fetch('/api/upload', { method: 'POST', body: uploadForm });
    if (res.ok) {
      const { urls } = await res.json();
      const existing = plain.images ? JSON.parse(plain.images) : [];
      plain.images = JSON.stringify([...existing, ...urls]);
    }
  }

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

export async function adminSignIn(email: string, password: string): Promise<{ id: string; email: string; name: string } | { error: string }> {
  return adminSignInAction(email, password);
}

// ─── Orders ──────────────────────────────────────────────

export async function getAllOrders(page = 1, limit = 100, filter = '') {
  return fetchAllOrdersAdmin({ page, limit, filter });
}
