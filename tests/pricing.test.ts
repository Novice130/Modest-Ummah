import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fake: null as any }));
vi.mock('drizzle-orm', async (orig) => {
  const actual = await orig<typeof import('drizzle-orm')>();
  const { predicates } = await import('./helpers/fake-predicates');
  return { ...actual, ...predicates };
});
vi.mock('@/lib/db', () => ({ getDb: () => h.fake.db }));
vi.mock('@/lib/taxcloud', () => ({ calculateTax: async () => ({ totalTax: 0 }) }));

import { resolveCheckoutOrder } from '@/lib/pricing';
import { getFreeShippingInfo, getShippingRates } from '@/lib/shipping';
import { products, productVariants } from '@/lib/schema';
import { createFakeDb } from './helpers/fake-db';

const DAY = 86400000;
const address = (country = 'US') => ({
  firstName: 'S', lastName: 'K', address1: '1 Main St', city: 'X', state: 'CA', postalCode: '90001', country,
});
const product = (over: Record<string, any> = {}) => ({
  id: 'p1', name: 'Abaya', price: '50.00', compareAtPrice: null, sku: 'S', weight: '8', categoryId: null,
  status: 'published', isLive: true, productType: 'simple', inStock: true, backorderPolicy: 'no',
  images: ['/uploads/real.jpg'], colors: [{ name: 'Black', value: '#000' }], sizes: ['M'],
  saleStartsAt: null, saleEndsAt: null, ...over,
});
const resolve = (over: Record<string, any> = {}, item: Record<string, any> = {}) =>
  resolveCheckoutOrder({
    items: [{ productId: 'p1', quantity: 1, ...item } as any],
    shippingAddress: address(),
    ...over,
  });

beforeEach(() => {
  h.fake = createFakeDb();
  vi.stubEnv('PIRATESHIP_API_KEY', '');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('sale window', () => {
  const sale = { price: '40.00', compareAtPrice: '60.00' };

  it('charges the sale price inside the window', async () => {
    h.fake.seed(products, [product({
      ...sale, saleStartsAt: new Date(Date.now() - DAY), saleEndsAt: new Date(Date.now() + DAY),
    })]);
    expect((await resolve()).subtotal).toBe(40);
  });

  it('charges the sale price when no window is set', async () => {
    h.fake.seed(products, [product(sale)]);
    expect((await resolve()).subtotal).toBe(40);
  });

  it('charges the regular price after the sale ended', async () => {
    h.fake.seed(products, [product({ ...sale, saleEndsAt: new Date(Date.now() - DAY) })]);
    expect((await resolve()).subtotal).toBe(60);
  });

  it('charges the regular price before the sale starts', async () => {
    h.fake.seed(products, [product({ ...sale, saleStartsAt: new Date(Date.now() + DAY) })]);
    expect((await resolve()).subtotal).toBe(60);
  });

  it('applies the window to a variant with its own price', async () => {
    h.fake.seed(products, [product({ saleEndsAt: new Date(Date.now() - DAY) })]);
    h.fake.seed(productVariants, [{
      id: 'v1', productId: 'p1', price: '30.00', compareAtPrice: '45.00', sku: 'V', attributes: {},
    }]);
    expect((await resolve({}, { variantId: 'v1' })).subtotal).toBe(45);
  });
});

describe('client-supplied options', () => {
  it('ignores a client image', async () => {
    h.fake.seed(products, [product()]);
    const { items } = await resolve({}, { image: 'https://evil.example/x.png' });
    expect(items[0].image).toBe('/uploads/real.jpg');
  });

  it('rejects an unknown colour or size', async () => {
    h.fake.seed(products, [product()]);
    await expect(resolve({}, { color: '<b>Pink</b>' })).rejects.toThrow(/color/i);
    await expect(resolve({}, { size: 'XXXXL' })).rejects.toThrow(/size/i);
  });

  it('keeps valid options, including a value from the chosen variant', async () => {
    h.fake.seed(products, [product()]);
    h.fake.seed(productVariants, [{
      id: 'v1', productId: 'p1', price: null, sku: 'V', attributes: { Color: 'Olive', Size: 'L' },
    }]);
    const a = await resolve({}, { color: 'Black', size: 'M' });
    expect(a.items[0]).toMatchObject({ color: 'Black', size: 'M' });
    const b = await resolve({}, { variantId: 'v1', color: 'Olive', size: 'L' });
    expect(b.items[0]).toMatchObject({ color: 'Olive', size: 'L' });
  });
});

describe('shipping policy (app/shipping/page.tsx)', () => {
  const big = () => h.fake.seed(products, [product({ price: '100.00' })]);

  it('US standard is $9.99 and express $14.99', async () => {
    h.fake.seed(products, [product()]);
    expect((await resolve()).shipping).toBe(9.99);
    expect((await resolve({ shippingService: 'usps_priority' })).shipping).toBe(14.99);
  });

  it('US standard is free over the threshold, express is not', async () => {
    big();
    expect((await resolve()).shipping).toBe(0);
    expect((await resolve({ shippingService: 'usps_priority' })).shipping).toBe(14.99);
  });

  it('refuses a foreign order instead of quoting a US rate', async () => {
    big();
    await expect(resolve({ shippingAddress: address('GB') })).rejects.toThrow(/United States/);
  });

  it('free shipping info is US only', () => {
    expect(getFreeShippingInfo(100).eligible).toBe(true);
    expect(getFreeShippingInfo(100, 'us').eligible).toBe(true);
    expect(getFreeShippingInfo(100, 'CA').eligible).toBe(false);
    expect(getFreeShippingInfo(0).threshold).toBe(75);
  });

  it('getShippingRates returns no rate and a reason abroad', async () => {
    const r = await getShippingRates({
      destination: { name: 'S', street1: '1', city: 'L', state: 'LDN', zip: 'E1', country: 'GB' },
      package: { length: 1, width: 1, height: 1, weight: 8 },
    });
    expect(r.rates).toEqual([]);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/United States/);
  });

  it('a missing country stays US, as lib/address.ts defaults it', async () => {
    h.fake.seed(products, [product()]);
    const { country: _country, ...noCountry } = address();
    expect((await resolve({ shippingAddress: noCountry })).shipping).toBe(9.99);
  });
});
