import { beforeEach, describe, expect, it, vi } from 'vitest';

const reads = vi.hoisted(() => ({
  products: vi.fn(),
  categories: vi.fn(),
  connection: vi.fn(async () => {}),
}));

vi.mock('next/server', () => ({ connection: reads.connection }));
vi.mock('@/lib/catalog-cache', () => ({
  getSitemapProductsCached: reads.products,
  getCategoryTreeCached: reads.categories,
}));

import sitemap from '@/app/sitemap';

beforeEach(() => {
  reads.products.mockReset();
  reads.categories.mockReset();
  reads.connection.mockClear();
  reads.products.mockResolvedValue([
    { slug: 'gold-ring', updatedAt: '2026-10-01T00:00:00.000Z' },
  ]);
  reads.categories.mockResolvedValue([
    { slug: 'jewellery', children: [{ slug: 'rings', children: [] }] },
  ]);
});

describe('sitemap', () => {
  it('lists products with their lastmod, and nested categories', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => new URL(e.url).pathname);

    expect(urls).toEqual(
      expect.arrayContaining(['/', '/shop', '/product/gold-ring', '/shop/jewellery', '/shop/rings'])
    );
    const product = entries.find((e) => e.url.endsWith('/product/gold-ring'));
    expect(product?.lastModified).toBe('2026-10-01T00:00:00.000Z');
  });

  it('excludes private paths', async () => {
    const urls = (await sitemap()).map((e) => new URL(e.url).pathname);
    for (const path of urls) {
      expect(path).not.toMatch(/^\/(account|auth|admin|api|checkout|cart)(\/|$)/);
    }
  });

  it('waits for a request, so the build needs no database and no stale list is frozen', async () => {
    await sitemap();
    expect(reads.connection).toHaveBeenCalledBefore(reads.products);
  });

  it('fails rather than publishing a sitemap with no products', async () => {
    reads.products.mockRejectedValue(new Error('database asleep'));
    await expect(sitemap()).rejects.toThrow('database asleep');
  });
});
