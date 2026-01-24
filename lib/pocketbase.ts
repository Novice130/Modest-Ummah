import PocketBase, { type RecordSubscription } from 'pocketbase';
import type { TypedPocketBase, CartsResponse } from '@/types/pocketbase-types';
import type { Product, User, Order, Cart, CartItem, Admin } from '@/types';

// Singleton PocketBase instance
let pb: TypedPocketBase | null = null;

export function getPocketBase(): TypedPocketBase {
  if (typeof window === 'undefined') {
    // Server-side: create new instance each time
    return new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090') as TypedPocketBase;
  }

    // Client-side: use singleton
  if (!pb) {
    pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090') as TypedPocketBase;
    
    // Allow default localStorage persistence (more reliable for client-side)
    // We only sync to cookie for potential future SSR, but don't force load from it on client init
    // to avoid overwriting valid localStorage data with empty cookies.
    
    // Save auth changes to cookie (optional, keeps them in sync)
    pb.authStore.onChange(() => {
      document.cookie = pb!.authStore.exportToCookie({ httpOnly: false });
    });
  }

  return pb;
}

// Singleton PocketBase instance for Admin Panel (Separate Store)
let pbAdmin: TypedPocketBase | null = null;
export function getAdminPocketBase(): TypedPocketBase {
  if (typeof window === 'undefined') {
    return new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090') as TypedPocketBase;
  }

  if (!pbAdmin) {
    const adminUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090';
    pbAdmin = new PocketBase(adminUrl) as TypedPocketBase;
    try {
       // @ts-ignore
       if (pbAdmin.authStore && typeof window !== 'undefined') {
          const originalSave = pbAdmin.authStore.save.bind(pbAdmin.authStore);
          const originalClear = pbAdmin.authStore.clear.bind(pbAdmin.authStore);
          const KEY = 'pocketbase_admin_auth';
          
          pbAdmin.authStore.save = (token, model) => {
             originalSave(token, model);
             localStorage.setItem(KEY, JSON.stringify({ token, model }));
          };
          
          pbAdmin.authStore.clear = () => {
             originalClear();
             localStorage.removeItem(KEY);
          };
          
          const stored = localStorage.getItem(KEY);
          if (stored) {
             const { token, model } = JSON.parse(stored);
             pbAdmin.authStore.save(token, model);
          }
       }
    } catch (e) { console.error('Admin Auth init error', e); }
  }

  return pbAdmin;
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
  const client = getAdminPocketBase();
  // Fallback to user client if admin not auth? No, explicit is better.
  // If admin client is not auth, it will fail, which is correct for admin panel.
  // If we need user update later, we'll create userUpdateOrder.
  return await client.collection('orders').update<Order>(orderId, data);
}

// Admin-only: Fetch all products (including non-public if needed)
export async function getAllProducts(page = 1, perPage = 50, filter = '') {
  const client = getAdminPocketBase();
  console.log('📦 [getAllProducts] PocketBase URL:', process.env.NEXT_PUBLIC_POCKETBASE_URL);
  console.log('📦 [getAllProducts] Auth valid:', client.authStore.isValid);
  try {
    const options: any = {
      requestKey: null, // Disable auto-cancellation
    };
    // Only add filter if it's non-empty
    if (filter && filter.trim()) {
      options.filter = filter;
    }
    const result = await client.collection('products').getList<Product>(page, perPage, options);
    console.log('📦 [getAllProducts] Success:', result.totalItems, 'items');
    return result;
  } catch (e: any) {
    console.error('📦 [getAllProducts] Error:', e);
    console.error('📦 [getAllProducts] Error status:', e?.status);
    console.error('📦 [getAllProducts] Error message:', e?.message);
    console.error('📦 [getAllProducts] Error data:', e?.data);
    throw e;
  }
}

// Admin-only: Fetch all orders
export async function getAllOrders(page = 1, perPage = 50, filter = '') {
  const client = getAdminPocketBase();
  return await client.collection('orders').getList<Order>(page, perPage, {
    filter,
    sort: '-created',
  });
}

// Admin
export async function adminSignIn(email: string, password: string) {
  const client = getAdminPocketBase();
  return await client.admins.authWithPassword(email, password);
}

export function isAdmin(): boolean {
  const client = getAdminPocketBase();
  // Check if the current auth store has a valid admin model
  return client.authStore.isValid;
}

export async function createProduct(data: FormData) {
  const client = getAdminPocketBase();
  
  // Log the data being sent
  console.log('📦 [createProduct] Creating product...');
  console.log('📦 [createProduct] Auth valid:', client.authStore.isValid);
  
  // Log FormData contents for debugging
  const formDataObj: Record<string, any> = {};
  data.forEach((value, key) => {
    formDataObj[key] = value instanceof File ? `File: ${value.name}` : value;
  });
  console.log('📦 [createProduct] Data:', formDataObj);
  
  try {
    const result = await client.collection('products').create<Product>(data);
    console.log('📦 [createProduct] Success:', result.id);
    return result;
  } catch (e: any) {
    console.error('📦 [createProduct] Error:', e);
    console.error('📦 [createProduct] Error data:', e?.data);
    console.error('📦 [createProduct] Error response:', e?.response);
    throw e;
  }
}

export async function updateProduct(id: string, data: FormData) {
  const client = getAdminPocketBase();
  return await client.collection('products').update<Product>(id, data);
}

export async function deleteProduct(id: string) {
  const client = getAdminPocketBase();
  return await client.collection('products').delete(id);
}

// Realtime subscriptions
export function subscribeToCart(userId: string, callback: (data: Cart) => void) {
  const client = getPocketBase();
  return client.collection('carts').subscribe('*', (e: RecordSubscription<CartsResponse>) => {
    if (e.record.user === userId) {
      callback(e.record as unknown as Cart);
    }
  });
}

export function unsubscribeFromCart() {
  const client = getPocketBase();
  client.collection('carts').unsubscribe('*');
}
