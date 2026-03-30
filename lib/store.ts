import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CartItem, User } from '@/types';
import { saveCartAction, fetchUserCart } from '@/lib/actions/cart.actions';

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  isSyncing: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, color?: string, size?: string) => void;
  updateQuantity: (productId: string, quantity: number, color?: string, size?: string) => void;
  clearCart: () => void;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  syncWithServer: (userId: string) => Promise<void>;
  loadFromServer: (userId: string) => Promise<void>;
  getItemCount: () => number;
  getSubtotal: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      isSyncing: false,

      addItem: (item) => {
        set((state) => {
          const existingIndex = state.items.findIndex(
            (i) =>
              i.productId === item.productId &&
              i.color === item.color &&
              i.size === item.size
          );

          let newItems: CartItem[];
          if (existingIndex > -1) {
            newItems = [...state.items];
            newItems[existingIndex].quantity += item.quantity;
          } else {
            newItems = [...state.items, item];
          }

          // Sync with server if user is logged in
          const authUser = useAuthStore.getState().user;
          if (authUser?.id) {
            saveCartAction(newItems).catch(console.error);
          }

          return { items: newItems };
        });
      },

      removeItem: (productId, color, size) => {
        set((state) => {
          const newItems = state.items.filter(
            (i) =>
              !(
                i.productId === productId &&
                i.color === color &&
                i.size === size
              )
          );

          // Sync with server if user is logged in
          const authUser = useAuthStore.getState().user;
          if (authUser?.id) {
            saveCartAction(newItems).catch(console.error);
          }

          return { items: newItems };
        });
      },

      updateQuantity: (productId, quantity, color, size) => {
        if (quantity <= 0) {
          get().removeItem(productId, color, size);
          return;
        }

        set((state) => {
          const newItems = state.items.map((i) =>
            i.productId === productId && i.color === color && i.size === size
              ? { ...i, quantity }
              : i
          );

          // Sync with server if user is logged in
          const authUser = useAuthStore.getState().user;
          if (authUser?.id) {
            saveCartAction(newItems).catch(console.error);
          }

          return { items: newItems };
        });
      },

      clearCart: () => {
        // Sync with server if user is logged in
        const authUser = useAuthStore.getState().user;
        if (authUser?.id) {
          saveCartAction([]).catch(console.error);
        }

        set({ items: [] });
      },

      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      syncWithServer: async (userId) => {
        set({ isSyncing: true });
        try {
          const items = get().items;
          if (items.length > 0) {
            await saveCartAction(items);
          }
        } catch (error) {
          console.error('Error syncing cart with server:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      loadFromServer: async (userId) => {
        set({ isSyncing: true });
        try {
          const cart = await fetchUserCart();
          if (cart && cart.items) {
            const items = typeof cart.items === 'string' 
              ? JSON.parse(cart.items) 
              : cart.items;
            
            // Merge server cart with local cart
            const localItems = get().items;
            const mergedItems = [...items];
            
            // Add any local items that aren't in server cart
            localItems.forEach(localItem => {
              const exists = mergedItems.some(
                i => i.productId === localItem.productId &&
                     i.color === localItem.color &&
                     i.size === localItem.size
              );
              if (!exists) {
                mergedItems.push(localItem);
              }
            });

            set({ items: mergedItems });

            // Sync merged cart back to server
            if (mergedItems.length > 0) {
              await saveCartAction(mergedItems);
            }
          }
        } catch (error) {
          console.error('Error loading cart from server:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getSubtotal: () => {
        return get().items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
      },
    }),
    {
      name: 'modest-ummah-cart',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Auth Store
interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  initAuth: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  setUser: (user) => {
    set({ user, isLoading: false });
    
    // Sync cart when user logs in
    if (user?.id) {
      const cartStore = useCartStore.getState();
      cartStore.loadFromServer(user.id);
    }
  },
  setLoading: (isLoading) => set({ isLoading }),
  initAuth: () => {
    // This is explicitly left as a NOOP because AuthProvider now relies
    // completely on Next.js Server Sessions for exact initial state injection.
  },
}));

// UI Store
interface UIState {
  isMobileMenuOpen: boolean;
  isSearchOpen: boolean;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  toggleSearch: () => void;
  closeSearch: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isMobileMenuOpen: false,
  isSearchOpen: false,
  toggleMobileMenu: () =>
    set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),
  closeMobileMenu: () => set({ isMobileMenuOpen: false }),
  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
  closeSearch: () => set({ isSearchOpen: false }),
}));

// Wishlist Store
interface WishlistState {
  items: string[]; // Product IDs
  addToWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      
      addToWishlist: (productId) => {
        set((state) => {
          if (state.items.includes(productId)) return state;
          return { items: [...state.items, productId] };
        });
      },

      removeFromWishlist: (productId) => {
        set((state) => ({
          items: state.items.filter(id => id !== productId),
        }));
      },

      isInWishlist: (productId) => {
        return get().items.includes(productId);
      },

      clearWishlist: () => set({ items: [] }),
    }),
    {
      name: 'modest-ummah-wishlist',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
