import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb, renderSql, userRow, whereParams, whereSql } from './fake-db';

const fake = makeFakeDb();
vi.mock('@/lib/db', () => ({ getDb: () => fake.db }));

const sendPasswordResetEmail = vi.hoisted(() => vi.fn());
vi.mock('@/lib/email', () => ({ sendPasswordResetEmail }));

import { verifyPassword } from '@/lib/auth';
import { confirmPasswordReset, requestPasswordReset } from '@/lib/password-reset';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

const RAW_TOKEN = 'a'.repeat(43);

beforeEach(() => {
  fake.reset();
  sendPasswordResetEmail.mockReset();
  sendPasswordResetEmail.mockResolvedValue({ success: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('requestPasswordReset', () => {
  it('sends nothing and writes no token for an unknown address', async () => {
    fake.queue.push([]);
    await requestPasswordReset('nobody@example.com');
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('normalises the address before looking it up', async () => {
    fake.queue.push([]);
    await requestPasswordReset('  Nobody@Example.COM ');
    expect(whereParams(fake.calls[0])).toContain('nobody@example.com');
  });

  it('stores only a hash of a random token, and mails the raw one', async () => {
    fake.queue.push([userRow()], [], [], []);
    const before = Date.now();
    await requestPasswordReset('customer@example.com');

    const insert = fake.calls.find((c) => c.op === 'insert')!;
    const { resetLink, email } = sendPasswordResetEmail.mock.calls[0][0];
    const raw = new URL(resetLink).searchParams.get('token')!;

    expect(email).toBe('customer@example.com');
    expect(new URL(resetLink).pathname).toBe('/auth/reset-password');
    expect(raw.length).toBeGreaterThanOrEqual(43); // 32 random bytes, base64url
    expect(insert.values.tokenHash).toBe(sha256(raw));
    expect(JSON.stringify(insert.values)).not.toContain(raw);

    // The email template promises one hour; it must not outlive that.
    const ttl = insert.values.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(59 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000 + 1000);
  });

  it('issues a different token each time', async () => {
    fake.queue.push([userRow()], [], [], []);
    await requestPasswordReset('customer@example.com');
    fake.queue.push([userRow()], [], [], []);
    await requestPasswordReset('customer@example.com');
    const [first, second] = sendPasswordResetEmail.mock.calls.map((c) => c[0].resetLink);
    expect(first).not.toBe(second);
  });

  it('retires the earlier tokens of the account when issuing a new one', async () => {
    fake.queue.push([userRow()], [], [], []);
    await requestPasswordReset('customer@example.com');
    const del = fake.calls.find((c) => c.op === 'delete')!;
    expect(whereSql(del)).toContain('user_id');
  });

  it('does not send a second email while a recent one is outstanding', async () => {
    fake.queue.push([userRow()], [{ id: 'recent' }]);
    await requestPasswordReset('customer@example.com');
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.op === 'insert')).toBe(false);
  });
});

describe('confirmPasswordReset', () => {
  const validRow = { id: 'token-1', userId: 'user-1' };

  it('rejects a short password before touching the database', async () => {
    const result = await confirmPasswordReset(RAW_TOKEN, 'short');
    expect(result).toEqual({ ok: false, reason: 'weak_password' });
    expect(fake.calls).toEqual([]);
  });

  it.each(['', 'not a token', 'x'.repeat(5000)])('rejects a malformed token %#', async (token) => {
    expect(await confirmPasswordReset(token, 'long-enough-1')).toEqual({
      ok: false,
      reason: 'invalid_token',
    });
    expect(fake.calls).toEqual([]);
  });

  it('looks up by hash, requiring unused and unexpired', async () => {
    fake.queue.push([]);
    const result = await confirmPasswordReset(RAW_TOKEN, 'long-enough-1');

    expect(result).toEqual({ ok: false, reason: 'invalid_token' });
    const sql = whereSql(fake.calls[0]);
    expect(sql).toContain('token_hash');
    expect(sql).toContain('used_at');
    expect(sql).toContain('expires_at');
    expect(whereParams(fake.calls[0])).toContain(sha256(RAW_TOKEN));
    expect(whereParams(fake.calls[0])).not.toContain(RAW_TOKEN);
  });

  it('sets the password, bumps token_version and marks the email verified', async () => {
    fake.queue.push([validRow], [{ id: 'token-1' }], [{ id: 'user-1' }], []);
    const result = await confirmPasswordReset(RAW_TOKEN, 'long-enough-1');
    expect(result).toEqual({ ok: true });

    const userUpdate = fake.calls.filter((c) => c.op === 'update')[1];
    expect(await verifyPassword('long-enough-1', userUpdate.set.passwordHash)).toBe(true);
    expect(userUpdate.set.verified).toBe(true);
    expect(renderSql(userUpdate.set.tokenVersion)).toContain('"token_version" + 1');
  });

  it('claims the token atomically, so a second use loses the race', async () => {
    fake.queue.push([validRow], []); // the row was valid, then someone else claimed it
    const result = await confirmPasswordReset(RAW_TOKEN, 'long-enough-1');

    expect(result).toEqual({ ok: false, reason: 'invalid_token' });
    const claim = fake.calls.find((c) => c.op === 'update')!;
    expect(claim.set.usedAt).toBeInstanceOf(Date);
    expect(whereSql(claim)).toContain('used_at');
    // No write to users after a lost claim.
    expect(fake.calls.filter((c) => c.op === 'update')).toHaveLength(1);
  });

  it('removes the remaining tokens of the account afterwards', async () => {
    fake.queue.push([validRow], [{ id: 'token-1' }], [{ id: 'user-1' }], []);
    await confirmPasswordReset(RAW_TOKEN, 'long-enough-1');
    const del = fake.calls.find((c) => c.op === 'delete')!;
    expect(whereSql(del)).toContain('user_id');
  });
});
