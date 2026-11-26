import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const data = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  return { data, fetchUserCart: vi.fn(), saveCartAction: vi.fn() };
});

vi.mock('@/lib/actions/cart.actions', () => ({
  fetchUserCart: h.fetchUserCart,
  saveCartAction: h.saveCartAction,
}));

import { useCartStore } from '@/lib/store';

const item = { productId: 'p1', name: 'A', price: 10, quantity: 1 } as any;
const flush = () => new Promise((r) => setTimeout(r, 0));
const persisted = () => JSON.parse(h.data.get('modest-ummah-cart')!).state;

beforeEach(() => {
  vi.clearAllMocks();
  h.saveCartAction.mockResolvedValue({});
  useCartStore.setState({ items: [item], lastPurchaseRef: null, pendingServerClear: false });
});

describe('completePurchase', () => {
  it('empties the persisted local cart too', async () => {
    useCartStore.getState().completePurchase('pi_1');
    await flush();
    expect(useCartStore.getState().items).toEqual([]);
    expect(persisted().items).toEqual([]);
    expect(h.saveCartAction).toHaveBeenCalledWith([]);
  });

  it('reloading the page later does not wipe a new cart', async () => {
    useCartStore.getState().completePurchase('pi_1');
    await flush();
    useCartStore.setState({ items: [item] });
    useCartStore.getState().completePurchase('pi_1');
    expect(useCartStore.getState().items).toEqual([item]);
  });

  it('a server cart load already in flight cannot merge the old items back', async () => {
    let resolveFetch: (v: any) => void = () => {};
    h.fetchUserCart.mockReturnValue(new Promise((r) => (resolveFetch = r)));
    const load = useCartStore.getState().loadFromServer('u1');
    useCartStore.getState().completePurchase('pi_1');
    await flush();
    resolveFetch({ items: JSON.stringify([item]) });
    await load;
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('a stale server cart is not merged back after the server clear failed', async () => {
    h.saveCartAction.mockRejectedValueOnce(new Error('offline'));
    useCartStore.getState().completePurchase('pi_1');
    await flush();
    expect(persisted().pendingServerClear).toBe(true);

    h.fetchUserCart.mockResolvedValue({ items: JSON.stringify([item]) });
    await useCartStore.getState().loadFromServer('u1');
    expect(useCartStore.getState().items).toEqual([]);
    expect(h.saveCartAction).toHaveBeenLastCalledWith([]);
    expect(useCartStore.getState().pendingServerClear).toBe(false);
  });

  it('normal login still merges the server cart', async () => {
    const other = { ...item, productId: 'p2' };
    h.fetchUserCart.mockResolvedValue({ items: JSON.stringify([other]) });
    await useCartStore.getState().loadFromServer('u1');
    expect(useCartStore.getState().items).toHaveLength(2);
  });
});
