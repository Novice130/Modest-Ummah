import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const h = vi.hoisted(() => ({ where: [] as any[], rows: [] as any[], returned: [] as any[] }));

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: (w: any) => {
          h.where.push(w);
          return { limit: async () => h.rows };
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: (w: any) => {
          h.where.push(w);
          return { returning: async () => h.returned };
        },
      }),
    }),
  }),
}));

import { evaluateCoupon, recordCouponUsage } from '@/lib/coupons';

const lastQuery = () => new PgDialect().sqlToQuery(h.where[h.where.length - 1]);

beforeEach(() => {
  vi.clearAllMocks();
  h.where.length = 0;
  h.rows = [];
  h.returned = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('coupon lookups are exact', () => {
  it.each(['%', '_____', 'SA%'])('%s is a literal value, not a pattern', async (code) => {
    const r = await evaluateCoupon(code, 100, []);
    expect(r.ok).toBe(false);
    const q = lastQuery();
    expect(q.sql).toBe('upper("coupons"."code") = $1');
    expect(q.params).toEqual([code]);
  });

  it('recording usage also matches exactly and checks the usage limit atomically', async () => {
    await recordCouponUsage('sa%');
    const q = lastQuery();
    expect(q.sql).toContain('upper("coupons"."code") = $1');
    expect(q.sql).toContain('"coupons"."usage_limit" is null');
    expect(q.sql).toContain('"coupons"."usage_count" < "coupons"."usage_limit"');
    expect(q.params).toEqual(['SA%']);
  });
});

describe('atomic usage limit guard', () => {
  it('returns true when a row was incremented', async () => {
    h.returned = [{ id: 'c1' }];
    expect(await recordCouponUsage('SAVE')).toBe(true);
  });

  it('returns false when the coupon was already at its limit', async () => {
    h.returned = [];
    expect(await recordCouponUsage('SAVE')).toBe(false);
  });
});
