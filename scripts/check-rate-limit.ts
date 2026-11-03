/**
 * Limiter and client-IP checks. No framework, no database:
 *   npx tsx scripts/check-rate-limit.ts
 */
import assert from 'node:assert/strict';
import { clientIpFromHeaders, ipLimitKey } from '../lib/client-ip';
import {
  FixedWindowLimiter,
  RATE_LIMITS,
  checkRateLimit,
  rateLimitMessage,
} from '../lib/rate-limit';

let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`ok   ${name}`);
}

function clocked(maxEntries?: number) {
  const clock = { t: 1_000_000 };
  return { clock, limiter: new FixedWindowLimiter(maxEntries, () => clock.t) };
}
const allowedCount = (times: number, run: () => { allowed: boolean }) =>
  Array.from({ length: times }, run).filter((decision) => decision.allowed).length;

check('login: the 11th attempt on one email is refused, from any IP', () => {
  const { limiter } = clocked();
  let ip = 0;
  const attempt = () =>
    checkRateLimit('login', { ip: `10.0.0.${++ip}`, email: 'A@Example.com ' }, limiter);
  assert.equal(allowedCount(10, attempt), 10);
  const refused = checkRateLimit('login', { ip: '10.9.9.9', email: 'a@example.com' }, limiter);
  assert.equal(refused.allowed, false);
  assert.equal(refused.retryAfterSeconds, 15 * 60);
  // A different email from a fresh IP is unaffected.
  const other = checkRateLimit('login', { ip: '10.9.9.9', email: 'b@example.com' }, limiter);
  assert.equal(other.allowed, true);
});

check('login: the 31st attempt from one IP is refused, whatever the email', () => {
  const { limiter } = clocked();
  let n = 0;
  const attempt = () =>
    checkRateLimit('login', { ip: '10.0.0.1', email: `u${++n}@x.com` }, limiter);
  assert.equal(allowedCount(40, attempt), RATE_LIMITS.login.ip.limit);
});

check('a blocked IP does not spend a victim email allowance', () => {
  const { limiter } = clocked();
  let n = 0;
  allowedCount(30, () =>
    checkRateLimit('login', { ip: 'attacker', email: `u${++n}@x.com` }, limiter)
  );
  allowedCount(50, () =>
    checkRateLimit('login', { ip: 'attacker', email: 'victim@x.com' }, limiter)
  );
  const fromVictim = () =>
    checkRateLimit('login', { ip: 'victim-ip', email: 'victim@x.com' }, limiter);
  assert.equal(allowedCount(10, fromVictim), 10);
});

check('the window resets, and Retry-After counts down', () => {
  const { clock, limiter } = clocked();
  const attempt = () => checkRateLimit('admin2fa', { ip: 'i', subject: 'admin-1' }, limiter);
  assert.equal(allowedCount(5, attempt), 5);
  clock.t += 5 * 60_000;
  assert.equal(attempt().retryAfterSeconds, 10 * 60);
  clock.t += 10 * 60_000;
  assert.equal(attempt().allowed, true);
});

check('scopes do not share counters; a non-string email counts by IP only', () => {
  const { limiter } = clocked();
  assert.equal(allowedCount(11, () => checkRateLimit('adminLogin', { ip: 'i' }, limiter)), 10);
  assert.equal(checkRateLimit('login', { ip: 'i', email: { $ne: 1 } }, limiter).allowed, true);
  assert.equal(limiter.size, 2);
});

check('payment intent: 30 tries in a window pass, the 31st is refused', () => {
  const { limiter } = clocked();
  assert.equal(allowedCount(31, () => checkRateLimit('paymentIntent', { ip: 'i' }, limiter)), 30);
});

check('memory stays bounded under a flood of unique keys', () => {
  const { limiter } = clocked(1000);
  const rule = { limit: 5, windowMs: 60_000 };
  for (let i = 0; i < 200_000; i++) limiter.consume([{ key: `k${i}`, rule }]);
  assert.ok(limiter.size <= 1000, `size ${limiter.size}`);
});

check('expired entries are reclaimed before live ones', () => {
  const { clock, limiter } = clocked(10);
  const rule = { limit: 1, windowMs: 1000 };
  const live = { limit: 1, windowMs: 1_000_000 };
  limiter.consume([{ key: 'live', rule: live }]);
  for (let i = 0; i < 9; i++) limiter.consume([{ key: `old${i}`, rule }]);
  clock.t += 2000;
  limiter.consume([{ key: 'new', rule }]);
  assert.equal(limiter.size, 2);
  assert.equal(limiter.consume([{ key: 'live', rule: live }]).allowed, false);
});

check('client IP: only CF-Connecting-IP counts', () => {
  const ip = (values: Record<string, string>) => clientIpFromHeaders(new Headers(values));
  assert.equal(ip({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.1.1.1' }), '203.0.113.7');
  // Local dev and anything else with no Cloudflare in front.
  assert.equal(ip({ 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' }), 'unknown');
  assert.equal(ip({}), 'unknown');
  assert.equal(ip({ 'cf-connecting-ip': 'not-an-ip' }), 'unknown');
});

check('IP key: IPv6 folds to /64, IPv4 and unknown pass through', () => {
  assert.equal(ipLimitKey('203.0.113.7'), '203.0.113.7');
  assert.equal(ipLimitKey('unknown'), 'unknown');
  assert.equal(ipLimitKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(ipLimitKey('2001:0DB8:1:2::1'), '2001:db8:1:2::/64');
  assert.equal(ipLimitKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(ipLimitKey('::ffff:203.0.113.7'), '203.0.113.7');
});

check('messages read sensibly', () => {
  assert.equal(rateLimitMessage(30), 'Too many attempts. Please try again in 1 minute.');
  assert.equal(rateLimitMessage(601), 'Too many attempts. Please try again in 11 minutes.');
  assert.match(rateLimitMessage(120, 'paymentIntent'), /checkout attempts.*2 minutes/);
});

console.log(`\n${passed} checks passed`);
