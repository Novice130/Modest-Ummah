import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb, userRow, whereSql } from './fake-db';

const fake = makeFakeDb();
vi.mock('@/lib/db', () => ({ getDb: () => fake.db }));
vi.mock('@/lib/rate-limit-guards', () => ({ rateLimitRoute: () => null }));

// Apple's signature check is replaced: these tests start from a token Apple has
// already vouched for, and only decide what the claims may then unlock.
const appleVerify = vi.hoisted(() => vi.fn());
vi.mock('jose', async (original) => ({
  ...(await original<typeof import('jose')>()),
  createRemoteJWKSet: () => () => undefined,
  jwtVerify: async (token: string, key: unknown, options: any) => {
    if (typeof key === 'function') return appleVerify(token, key, options);
    const actual = await original<typeof import('jose')>();
    return actual.jwtVerify(token, key as Uint8Array, options);
  },
}));

import { createToken, getAuthFromRequest, hashPassword, verifyToken } from '@/lib/auth';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as google } from '@/app/api/auth/google/route';
import { POST as apple } from '@/app/api/auth/apple/route';

const WEB_CLIENT = '488492087162-3gtbu198aonl52qckg9cdnk7s52l6c0a.apps.googleusercontent.com';

function post(body: unknown) {
  return new Request('http://test.local/api', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as any;
}

function mockGoogle(claims: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ aud: WEB_CLIENT, sub: 'google-sub', ...claims }), { status: 200 })
    )
  );
}

function mockApple(claims: Record<string, unknown>) {
  appleVerify.mockResolvedValue({ payload: { sub: 'apple-sub', ...claims } });
}

beforeEach(() => {
  fake.reset();
  appleVerify.mockReset();
  vi.unstubAllGlobals();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('token ver claim', () => {
  it('login stamps the real token_version', async () => {
    const passwordHash = await hashPassword('correct-horse');
    fake.queue.push([userRow({ passwordHash })]);
    const res = await login(post({ email: 'customer@example.com', password: 'correct-horse' }));
    const { token } = await res.json();
    expect((await verifyToken(token))?.ver).toBe(3);
  });

  it('register stamps the real token_version', async () => {
    fake.queue.push([], [userRow({ tokenVersion: 7 })]);
    const res = await register(post({ email: 'new@example.com', password: 'longenough', name: 'N' }));
    const { token } = await res.json();
    expect((await verifyToken(token))?.ver).toBe(7);
  });

  it('google stamps the real token_version', async () => {
    mockGoogle({ email: 'customer@example.com', email_verified: 'true' });
    fake.queue.push([], [userRow()], [userRow()]);
    const res = await google(post({ idToken: 'x' }));
    const { token } = await res.json();
    expect((await verifyToken(token))?.ver).toBe(3);
  });

  it('apple stamps the real token_version', async () => {
    mockApple({ email: 'customer@example.com', email_verified: 'true' });
    fake.queue.push([], [userRow()], [userRow()]);
    const res = await apple(post({ identityToken: 'x' }));
    const { token } = await res.json();
    expect((await verifyToken(token))?.ver).toBe(3);
  });

  it('a stale ver is refused and a current one accepted', async () => {
    const token = await createToken({ sub: 'u', email: 'e', type: 'user', ver: 3 });
    const request = new Request('http://test.local', {
      headers: { authorization: `Bearer ${token}` },
    });

    fake.queue.push([{ tokenVersion: 3 }]);
    expect(await getAuthFromRequest(request)).not.toBeNull();

    fake.queue.push([{ tokenVersion: 4 }]);
    expect(await getAuthFromRequest(request)).toBeNull();
  });
});

describe('google account linking', () => {
  it('refuses an unverified email, without touching the database', async () => {
    mockGoogle({ email: 'customer@example.com', email_verified: 'false' });
    const res = await google(post({ idToken: 'x' }));

    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(fake.calls).toEqual([]);
  });

  it('treats a missing email_verified claim as unverified', async () => {
    mockGoogle({ email: 'customer@example.com' });
    expect((await google(post({ idToken: 'x' }))).status).toBe(403);
    expect(fake.calls).toEqual([]);
  });

  it.each([true, 'true'])('links on a verified email (claim %s)', async (email_verified) => {
    mockGoogle({ email: 'customer@example.com', email_verified });
    fake.queue.push([], [userRow()], [userRow()]);
    expect((await google(post({ idToken: 'x' }))).status).toBe(200);
  });

  it('resets squatted password and retires stale tokens on takeover of an unverified account', async () => {
    mockGoogle({ email: 'customer@example.com', email_verified: 'true' });
    const unverifiedSquatted = userRow({ verified: false, passwordHash: 'squatter-hash' });
    fake.queue.push([], [unverifiedSquatted], [userRow({ verified: true, tokenVersion: 4 })]);
    const res = await google(post({ idToken: 'x' }));
    expect(res.status).toBe(200);
    const upd = fake.calls.find((c) => c.op === 'update');
    expect(upd?.set.passwordHash).toBeNull();
    expect(upd?.set.verified).toBe(true);
    expect(upd?.set.tokenVersion).toBeDefined();
  });

  it('only ever issues a customer token, even for an admin address', async () => {
    mockGoogle({ email: 'admin@example.com', email_verified: 'true' });
    fake.queue.push([], [userRow({ email: 'admin@example.com' })], [userRow({ email: 'admin@example.com' })]);
    const { token } = await (await google(post({ idToken: 'x' }))).json();
    expect((await verifyToken(token))?.type).toBe('user');
  });
});

describe('apple account linking', () => {
  it('never looks up or links by an unverified email, isolating as private-relay', async () => {
    mockApple({ email: 'customer@example.com', email_verified: 'false' });
    fake.queue.push([], [userRow({ email: 'apple-sub@privaterelay.appleid.com', providerId: 'apple-sub' })]);
    const res = await apple(post({ identityToken: 'x' }));

    expect(res.status).toBe(200);
    expect(fake.calls.filter((c) => c.op === 'select')).toHaveLength(1);
    expect(whereSql(fake.calls[0])).not.toContain('"email"');
    const insert = fake.calls.find((c) => c.op === 'insert');
    expect(insert?.values.email).toBe('apple-sub@privaterelay.appleid.com');
  });

  it.each([true, 'true'])('links on a verified email (claim %s)', async (email_verified) => {
    mockApple({ email: 'customer@example.com', email_verified });
    fake.queue.push([], [userRow()], [userRow()]);
    expect((await apple(post({ identityToken: 'x' }))).status).toBe(200);
  });

  it('finds a linked account by sub before considering the email', async () => {
    mockApple({ email: 'other@example.com', email_verified: 'true' });
    fake.queue.push([userRow({ id: 'linked', providerId: 'apple-sub' })], [userRow({ id: 'linked' })]);
    const { token } = await (await apple(post({ identityToken: 'x' }))).json();
    expect((await verifyToken(token))?.sub).toBe('linked');
  });

  it('creates a private-relay account on an email-less token', async () => {
    mockApple({});
    fake.queue.push([], [userRow({ email: 'apple-sub@privaterelay.appleid.com' })]);
    await apple(post({ identityToken: 'x' }));
    const insert = fake.calls.find((c) => c.op === 'insert');
    expect(insert?.values.email).toBe('apple-sub@privaterelay.appleid.com');
  });
});

describe('admin token revocation', () => {
  const adminRequest = async () => {
    const token = await createToken({ sub: 'a', email: 'a@x', type: 'admin' }, true);
    return new Request('http://test.local', { headers: { authorization: `Bearer ${token}` } });
  };

  it('accepts a token issued after the row last changed', async () => {
    fake.queue.push([{ updatedAt: new Date(Date.now() - 60_000) }]);
    expect(await getAuthFromRequest(await adminRequest(), true)).not.toBeNull();
  });

  it('refuses a token once the admin row is gone', async () => {
    fake.queue.push([]);
    expect(await getAuthFromRequest(await adminRequest(), true)).toBeNull();
  });

  it('refuses a token issued before a password reset', async () => {
    fake.queue.push([{ updatedAt: new Date(Date.now() + 60_000) }]);
    expect(await getAuthFromRequest(await adminRequest(), true)).toBeNull();
  });

  it('accepts a token minted in the same second as the change', async () => {
    const request = await adminRequest();
    const { iat } = (await verifyToken(
      request.headers.get('authorization')!.replace('Bearer ', '')
    )) as { iat: number };
    fake.queue.push([{ updatedAt: new Date(iat * 1000 + 900) }]);
    expect(await getAuthFromRequest(request, true)).not.toBeNull();
  });
});
