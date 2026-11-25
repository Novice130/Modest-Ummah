import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb, userRow, whereSql } from './fake-db';

const fake = makeFakeDb();
vi.mock('@/lib/db', () => ({ getDb: () => fake.db }));
vi.mock('next/cache', () => ({ cacheTag: () => {}, cacheLife: () => {} }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));

import * as authActions from '@/lib/actions/auth.actions';
import { getProductsCached, getSearchCached, getSitemapProductsCached } from '@/lib/catalog-cache';
import robots from '@/app/robots';

beforeEach(() => {
  fake.reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('auth actions', () => {
  it('signUpAction refuses a short password before touching the database', async () => {
    const result = await authActions.signUpAction('new@example.com', 'short', 'Name');
    expect(result).toEqual({ error: 'Password must be at least 8 characters' });
    expect(fake.calls).toEqual([]);
  });

  it('signUpAction still creates an account with a long enough password', async () => {
    fake.queue.push([], [userRow()]);
    const result = await authActions.signUpAction('new@example.com', 'long-enough-1', 'Name');
    expect(result).toHaveProperty('id');
  });

  it('setSession is not exposed as a server action', () => {
    expect((authActions as Record<string, unknown>).setSession).toBeUndefined();
  });
});

describe('catalogue search', () => {
  it('getSearchCached matches case-insensitively', async () => {
    fake.queue.push([]);
    await getSearchCached('RING');
    const sql = whereSql(fake.calls[0]);
    expect(sql).toContain('ilike');
    expect(sql).not.toMatch(/\slike\s/);
  });

  it('getProductsCached matches case-insensitively', async () => {
    fake.queue.push([{ count: 0 }], []);
    await getProductsCached({ search: 'RING' } as any);
    const sql = whereSql(fake.calls[0]);
    expect(sql).toContain('ilike');
    expect(sql).not.toMatch(/\slike\s/);
  });
});

describe('sitemap reader', () => {
  it('reads only live, publicly listed products', async () => {
    fake.queue.push([
      { slug: 'gold-ring', updatedAt: new Date('2026-10-01T00:00:00Z') },
    ]);
    const rows = await getSitemapProductsCached();

    expect(rows).toEqual([{ slug: 'gold-ring', updatedAt: '2026-10-01T00:00:00.000Z' }]);
    const sql = whereSql(fake.calls[0]);
    expect(sql).toContain('"status"');
    expect(sql).toContain('"visibility"');
  });
});

describe('robots', () => {
  it('blocks private paths and names the real sitemap', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules.disallow).toEqual(
      expect.arrayContaining(['/admin', '/api', '/checkout', '/account', '/auth', '/cart'])
    );
    expect(String(result.sitemap)).toMatch(/\/sitemap\.xml$/);
    expect(JSON.stringify(result)).not.toContain('trycloudflare');
  });
});

describe('wishlist page', () => {
  it('asks the API with the parameter it actually reads', () => {
    const source = readFileSync('app/account/wishlist/page.tsx', 'utf8');
    expect(source).not.toContain('limit=100');
    expect(source).toContain('perPage=');
  });
});
