import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fake: null as any }));
vi.mock('drizzle-orm', async (orig) => {
  const actual = await orig<typeof import('drizzle-orm')>();
  const { predicates } = await import('./helpers/fake-predicates');
  return { ...actual, ...predicates };
});
vi.mock('@/lib/db', () => ({ getDb: () => h.fake.db }));

import { decrementStock, restock } from '@/lib/inventory';
import { products, productVariants } from '@/lib/schema';
import { createFakeDb } from './helpers/fake-db';

const line = { productId: 'p1', name: 'A', price: 1, quantity: 1 };

beforeEach(() => {
  h.fake = createFakeDb();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.fake.seed(products, [{ id: 'p1', manageStock: true, productType: 'simple', stockQuantity: 5 }]);
});

describe('stock changes report DB failures', () => {
  it('decrementStock throws when the write failed, so the webhook can retry', async () => {
    h.fake.failNext('products', 'update');
    await expect(decrementStock([line])).rejects.toThrow(/stock/i);
  });

  it('restock throws when the write failed', async () => {
    h.fake.failNext('products', 'update');
    await expect(restock([line])).rejects.toThrow(/stock/i);
  });

  it('an oversell is not a failure', async () => {
    await expect(decrementStock([{ ...line, quantity: 50 }])).resolves.toBeUndefined();
  });

  it('a failed parent refresh after the variant write does not invite a double decrement', async () => {
    h.fake.seed(productVariants, [{ id: 'v1', productId: 'p1', stockQuantity: 3 }]);
    h.fake.failNext('products', 'update');
    await expect(decrementStock([{ ...line, variantId: 'v1' }])).resolves.toBeUndefined();
  });
});
