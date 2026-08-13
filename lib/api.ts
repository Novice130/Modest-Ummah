// lib/api.ts
// Client-callable wrappers around server actions.
//
// The PocketBase-era product/order wrappers were removed in Stage 6 — all
// callers now invoke the server actions directly (products/orders/customers
// pages) or the dedicated settings actions (settings page).

import {
  adminSignInAction,
} from '@/lib/actions/auth.actions';

export async function signInWithGoogle(): Promise<{ record: { id: string; email: string; name: string } }> {
  window.location.href = '/api/auth/google';
  return new Promise(() => {});
}

export async function adminSignIn(email: string, password: string): Promise<{ id: string; email: string; name: string } | { error: string }> {
  return adminSignInAction(email, password);
}
