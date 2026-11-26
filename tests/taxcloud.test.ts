import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fake: null as any }));
vi.mock('drizzle-orm', async (orig) => {
  const actual = await orig<typeof import('drizzle-orm')>();
  const { predicates } = await import('./helpers/fake-predicates');
  return { ...actual, ...predicates };
});
vi.mock('@/lib/db', () => ({ getDb: () => h.fake.db }));
vi.mock('@/lib/email', () => ({
  sendShippingNotification: vi.fn(async () => ({ success: true })),
}));

import { calculateTax, getTaxCloudOriginAddress } from '@/lib/taxcloud';
import { createFakeDb } from './helpers/fake-db';

beforeEach(() => {
  h.fake = createFakeDb();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TaxCloud origin requirement', () => {
  const taxInput = {
    items: [{ id: 'p1', price: 25, quantity: 2, category: 'abayas' }],
    shippingAddress: {
      address1: '1 Main St',
      city: 'Chicago',
      state: 'IL',
      postalCode: '60601',
    },
  };

  it('charges the configured nexus rate without requiring origin when TaxCloud keys are unset', async () => {
    vi.stubEnv('SALES_TAX_RATES', 'IL:0.0875');
    vi.stubEnv('TAXCLOUD_API_LOGIN_ID', '');
    vi.stubEnv('TAXCLOUD_API_KEY', '');
    const res = await calculateTax(taxInput);
    expect(res.success).toBe(true);
    expect(res.totalTax).toBe(4.38);
  });

  it('charges nothing and never calls TaxCloud outside nexus states', async () => {
    vi.stubEnv('SALES_TAX_RATES', 'IL:0.0875');
    vi.stubEnv('TAXCLOUD_API_LOGIN_ID', 'login');
    vi.stubEnv('TAXCLOUD_API_KEY', 'key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await calculateTax({ ...taxInput, shippingAddress: { ...taxInput.shippingAddress, state: 'CA' } });
    expect(res.totalTax).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('charges nothing when SALES_TAX_RATES is unset, and rejects a malformed value', async () => {
    vi.stubEnv('SALES_TAX_RATES', '');
    vi.stubEnv('TAXCLOUD_API_LOGIN_ID', '');
    vi.stubEnv('TAXCLOUD_API_KEY', '');
    expect((await calculateTax(taxInput)).totalTax).toBe(0);
    vi.stubEnv('SALES_TAX_RATES', 'IL:8.75');
    await expect(calculateTax(taxInput)).rejects.toThrow(/SALES_TAX_RATES/);
  });

  it('fails loudly instead of sending 123 Business St when TaxCloud keys are set without origin', async () => {
    vi.stubEnv('TAXCLOUD_API_LOGIN_ID', 'login');
    vi.stubEnv('TAXCLOUD_API_KEY', 'key');
    vi.stubEnv('TAXCLOUD_ORIGIN_ADDRESS1', '');
    vi.stubEnv('TAXCLOUD_ORIGIN_CITY', '');
    vi.stubEnv('TAXCLOUD_ORIGIN_STATE', '');
    vi.stubEnv('TAXCLOUD_ORIGIN_ZIP5', '');
    vi.stubEnv('SALES_TAX_RATES', 'IL:0.0875');

    expect(() => getTaxCloudOriginAddress()).toThrow(/TaxCloud origin is not configured/);
    await expect(calculateTax(taxInput)).rejects.toThrow(/TAXCLOUD_ORIGIN_ADDRESS1/);
  });

  it('sends the configured origin address when all origin fields are present', async () => {
    vi.stubEnv('TAXCLOUD_API_LOGIN_ID', 'login');
    vi.stubEnv('TAXCLOUD_API_KEY', 'key');
    vi.stubEnv('TAXCLOUD_ORIGIN_ADDRESS1', '500 Real St');
    vi.stubEnv('TAXCLOUD_ORIGIN_CITY', 'Austin');
    vi.stubEnv('TAXCLOUD_ORIGIN_STATE', 'TX');
    vi.stubEnv('TAXCLOUD_ORIGIN_ZIP5', '78701');
    vi.stubEnv('SALES_TAX_RATES', 'IL:0.0875');

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ResponseType: 3, CartItemsResponse: [{ CartItemIndex: 0, TaxAmount: 4.13 }], Messages: [] }))
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await calculateTax(taxInput);
    expect(res.success).toBe(true);
    expect(res.totalTax).toBe(4.13);
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.origin.address1).toBe('500 Real St');
    expect(body.origin.city).toBe('Austin');
  });
});
