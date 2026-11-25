/**
 * In-memory fixed-window rate limiting for the sign-in surface.
 *
 * There is one web container, so one process sees every request. The cost of
 * keeping this in memory is that counters reset on deploy or restart, which is
 * acceptable: an attacker gains one extra window per deploy. The benefit is the
 * reason it is not modelled on lib/woo/auth.ts, which counts rows in the
 * database: a refused request here makes no query, so a flood cannot keep Neon
 * awake, and an idle site does nothing at all. There is no timer. Expired
 * entries are removed when the table fills up.
 */

export interface RateRule {
  limit: number;
  windowMs: number;
}

export interface RateDecision {
  allowed: boolean;
  /** Whole seconds until a retry can succeed. 0 when allowed. */
  retryAfterSeconds: number;
}

interface Entry {
  count: number;
  resetAt: number;
}

export class FixedWindowLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly maxEntries = 20_000,
    private readonly now: () => number = Date.now
  ) {}

  get size(): number {
    return this.entries.size;
  }

  /**
   * Counts one attempt against every key, or against none of them if any key is
   * already exhausted. The all-or-nothing rule means a blocked IP cannot use up
   * a victim's email allowance, nor grow the table with made-up addresses.
   */
  consume(checks: Array<{ key: string; rule: RateRule }>): RateDecision {
    const now = this.now();

    let retryAfterMs = 0;
    for (const { key, rule } of checks) {
      const entry = this.entries.get(key);
      if (entry && entry.resetAt > now && entry.count >= rule.limit) {
        retryAfterMs = Math.max(retryAfterMs, entry.resetAt - now);
      }
    }
    if (retryAfterMs > 0) {
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
    }

    for (const { key, rule } of checks) {
      const entry = this.entries.get(key);
      if (entry && entry.resetAt > now) {
        entry.count += 1;
        continue;
      }
      // Re-inserted, not updated, so Map order stays oldest window first.
      this.entries.delete(key);
      if (this.entries.size >= this.maxEntries) this.makeRoom(now);
      this.entries.set(key, { count: 1, resetAt: now + rule.windowMs });
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Drops expired entries, then the oldest 5% if that freed nothing. */
  private makeRoom(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
    if (this.entries.size < this.maxEntries) return;

    let toDrop = Math.max(1, Math.floor(this.maxEntries / 20));
    for (const key of this.entries.keys()) {
      if (toDrop-- <= 0) break;
      this.entries.delete(key);
    }
  }
}

const MINUTE = 60_000;

/**
 * Every threshold in one place. Each counts attempts, successful ones included,
 * which keeps the call sites to a single guard.
 *
 * `email` limits for customers trade a little availability for protection: a
 * stranger can hold one customer's password sign-in at the limit. Admins are
 * never keyed on email alone, see lib/admin-login-guard.ts.
 */
export const RATE_LIMITS = {
  // Shared by /api/auth/login, /api/v1/auth/login and signInAction, so moving
  // between them buys nothing. The IP rule allows for a carrier NAT.
  login: {
    ip: { limit: 30, windowMs: 15 * MINUTE },
    email: { limit: 10, windowMs: 15 * MINUTE },
  },
  register: {
    ip: { limit: 10, windowMs: 60 * MINUTE },
    email: { limit: 5, windowMs: 60 * MINUTE },
  },
  // Google and Apple verify the credential; this caps the work and the outbound
  // calls. There is no trustworthy email until the token has been verified.
  social: {
    ip: { limit: 30, windowMs: 15 * MINUTE },
  },
  // Checked before any query. The finer, durable email+IP lockout is in
  // lib/admin-login-guard.ts.
  adminLogin: {
    ip: { limit: 10, windowMs: 15 * MINUTE },
  },
  // subject is the admin id, known only after the password was correct, so a
  // stranger cannot spend it. Six digits need a tight limit.
  admin2fa: {
    ip: { limit: 20, windowMs: 15 * MINUTE },
    subject: { limit: 5, windowMs: 15 * MINUTE },
  },
  // Retrying a declined card happens inside Stripe's form on the same intent and
  // does not come back here; only re-submitting the address step does. 30 per 10
  // minutes is far above a person's retries and still caps order-row spam.
  paymentIntent: {
    ip: { limit: 30, windowMs: 10 * MINUTE },
  },
  // /api/tax/calculate is unauthenticated and each call goes out to TaxCloud.
  taxQuote: {
    ip: { limit: 30, windowMs: 10 * MINUTE },
  },
  // Forgot-password sends mail and queries Neon on every call. A refused call
  // still gets the same reply, so the limit reveals nothing about accounts.
  passwordReset: {
    ip: { limit: 10, windowMs: 60 * MINUTE },
    email: { limit: 3, windowMs: 60 * MINUTE },
  },
  // The token is 256 bits, so this caps work and Neon wake-ups, not guessing.
  passwordResetConfirm: {
    ip: { limit: 20, windowMs: 15 * MINUTE },
  },
} as const;

export type RateScope = keyof typeof RATE_LIMITS;

export function normalizeEmailKey(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase().slice(0, 254);
  return normalized || null;
}

/**
 * Kept on globalThis: Next can load a module once per route bundle, which would
 * otherwise give the web and mobile routes separate counters.
 */
const store = globalThis as typeof globalThis & { __authRateLimiter?: FixedWindowLimiter };

function sharedLimiter(): FixedWindowLimiter {
  store.__authRateLimiter ??= new FixedWindowLimiter();
  return store.__authRateLimiter;
}

export function checkRateLimit(
  scope: RateScope,
  target: { ip: string; email?: unknown; subject?: string },
  limiter: FixedWindowLimiter = sharedLimiter()
): RateDecision {
  const rules: { ip: RateRule; email?: RateRule; subject?: RateRule } = RATE_LIMITS[scope];

  const checks: Array<{ key: string; rule: RateRule }> = [
    { key: `${scope}:ip:${target.ip}`, rule: rules.ip },
  ];
  const email = normalizeEmailKey(target.email);
  if (rules.email && email) checks.push({ key: `${scope}:email:${email}`, rule: rules.email });
  if (rules.subject && target.subject) {
    checks.push({ key: `${scope}:subject:${target.subject}`, rule: rules.subject });
  }
  return limiter.consume(checks);
}

export function rateLimitMessage(retryAfterSeconds: number, scope?: RateScope): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const wait = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  return scope === 'paymentIntent'
    ? `Too many checkout attempts. Please wait ${wait} and try again.`
    : `Too many attempts. Please try again in ${wait}.`;
}
