import PocketBase from 'pocketbase';
import type { Product, User, Order, Cart, CartItem, Admin } from '@/types';

// Singleton PocketBase instance
let pb: PocketBase | null = null;

export function getPocketBase(): PocketBase {
  if (typeof window === 'undefined') {
    // Server-side: create new instance each time
    return new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090');
  }

  // Client-side: use singleton
  if (!pb) {
    pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090');
    
    // Load auth from localStorage
    pb.authStore.loadFromCookie(document.cookie);
    
    // Save auth changes to cookie
    pb.authStore.onChange(() => {
      document.cookie = pb!.authStore.exportToCookie({ httpOnly: false });
    });
  }

  return pb;
}

// Products
export async function getProducts(options?: {
  page?: number;
  perPage?: number;
  filter?: string;
  sort?: string;
  expand?: string;
}) {
  const client = getPocketBase();
  return await client.collection('products').getList<Product>(
    options?.page || 1,
    options?.perPage || 12,
    {
      filter: options?.filter || '',
      sort: options?.sort || '-created',
      expand: options?.expand || '',
    }
  );
}

export async function getProduct(idOrSlug: string) {
  const client = getPocketBase();
  try {
    // Try by ID first
    return await client.collection('products').getOne<Product>(idOrSlug);
  } catch {
    // Try by slug
    return await client
      .collection('products')
      .getFirstListItem<Product>(`slug="${idOrSlug}"`);
  }
}

export async function getFeaturedProducts(category?: string) {
  const client = getPocketBase();
  let filter = 'featured=true';
  if (category) {
    filter += ` && category="${category}"`;
  }
  return await client.collection('products').getList<Product>(1, 8, {
    filter,
    sort: '-created',
  });
}

export async function getRelatedProducts(product: Product, limit: number = 4) {
  const client = getPocketBase();
  const tags = product.tags || [];
  
  if (tags.length === 0) {
    // Fallback to same category
    return await client.collection('products').getList<Product>(1, limit, {
      filter: `category="${product.category}" && id!="${product.id}"`,
      sort: '-created',
    });
  }

  // Get products with matching tags
  const tagFilters = tags.map(tag => `tags~"${tag}"`).join(' || ');
  return await client.collection('products').getList<Product>(1, limit, {
    filter: `(${tagFilters}) && id!="${product.id}"`,
    sort: '-created',
  });
}

export async function searchProducts(query: string) {
  const client = getPocketBase();
  return await client.collection('products').getList<Product>(1, 20, {
    filter: `name~"${query}" || description~"${query}" || tags~"${query}"`,
    sort: '-created',
  });
}

// Auth
export async function signUp(email: string, password: string, name: string) {
  const client = getPocketBase();
  const user = await client.collection('users').create<User>({
    email,
    password,
    passwordConfirm: password,
    name,
  });
  
  // Auto login after signup
  await client.collection('users').authWithPassword(email, password);
  
  return user;
}

export async function signIn(email: string, password: string) {
  const client = getPocketBase();
  return await client.collection('users').authWithPassword(email, password);
}

export async function signInWithGoogle() {
  const client = getPocketBase();
  return await client.collection('users').authWithOAuth2({ provider: 'google' });
}

export async function signOut() {
  const client = getPocketBase();
  client.authStore.clear();
}

export function getCurrentUser(): User | null {
  const client = getPocketBase();
  if (!client.authStore.isValid) return null;
  return client.authStore.model as User;
}

export function isAuthenticated(): boolean {
  const client = getPocketBase();
  return client.authStore.isValid;
}

// Cart
export async function getCart(userId?: string): Promise<Cart | null> {
  const client = getPocketBase();
  
  if (!userId) {
    // Return null for guest users - cart handled in Zustand
    return null;
  }

  try {
    return await client
      .collection('carts')
      .getFirstListItem<Cart>(`user="${userId}"`);
  } catch {
    return null;
  }
}

export async function createOrUpdateCart(userId: string, items: CartItem[]) {
  const client = getPocketBase();
  
  const existingCart = await getCart(userId);
  
  const cartData = {
    user: userId,
    items: JSON.stringify(items),
    updated: new Date().toISOString(),
  };

  if (existingCart) {
    return await client.collection('carts').update<Cart>(existingCart.id, cartData);
  } else {
    return await client.collection('carts').create<Cart>(cartData);
  }
}

// Orders
export async function createOrder(orderData: Partial<Order>) {
  const client = getPocketBase();
  return await client.collection('orders').create<Order>(orderData);
}

export async function getOrders(userId: string) {
  const client = getPocketBase();
  return await client.collection('orders').getList<Order>(1, 50, {
    filter: `user="${userId}"`,
    sort: '-created',
  });
}

export async function getOrder(orderId: string) {
  const client = getPocketBase();
  return await client.collection('orders').getOne<Order>(orderId);
}

export async function updateOrder(orderId: string, data: Partial<Order>) {
  const client = getPocketBase();
  return await client.collection('orders').update<Order>(orderId, data);
}

// Admin
export async function adminSignIn(email: string, password: string) {
  const client = getPocketBase();
  return await client.collection('admins').authWithPassword(email, password);
}

export function isAdmin(): boolean {
  const client = getPocketBase();
  if (!client.authStore.isValid) return false;
  return client.authStore.model?.collectionName === 'admins';
}

export async function createProduct(data: FormData) {
  const client = getPocketBase();
  return await client.collection('products').create<Product>(data);
}

export async function updateProduct(id: string, data: FormData) {
  const client = getPocketBase();
  return await client.collection('products').update<Product>(id, data);
}

export async function deleteProduct(id: string) {
  const client = getPocketBase();
  return await client.collection('products').delete(id);
}

// Realtime subscriptions
export function subscribeToCart(userId: string, callback: (data: Cart) => void) {
  const client = getPocketBase();
  return client.collection('carts').subscribe<Cart>('*', (e) => {
    if (e.record.user === userId) {
      callback(e.record);
    }
  });
}

export function unsubscribeFromCart() {
  const client = getPocketBase();
  client.collection('carts').unsubscribe('*');
}
