import { isIP } from 'node:net';

/**
 * The caller's address, for rate limits and logs.
 *
 * Production is Cloudflare -> Caddy -> web, and Caddy admits only Cloudflare's
 * ranges, so CF-Connecting-IP cannot be forged. X-Forwarded-For can: Cloudflare
 * appends to whatever the client sent, so its first value is attacker-chosen.
 * It is deliberately not read, not even as a fallback, because a fallback would
 * reopen the same hole wherever the header goes missing.
 *
 * With no Cloudflare in front (next dev, staging on 127.0.0.1) every caller is
 * 'unknown'. Limits still work there; they share one bucket.
 */
export const UNKNOWN_IP = 'unknown';

export function clientIpFromHeaders(headers: { get(name: string): string | null }): string {
  const value = headers.get('cf-connecting-ip')?.trim();
  return value && isIP(value) ? value : UNKNOWN_IP;
}

/**
 * The key an address is counted under. One IPv6 subscriber typically holds a
 * whole /64, so counting single addresses would hand them 2^64 fresh buckets.
 */
export function ipLimitKey(ip: string): string {
  if (isIP(ip) !== 6) return ip;

  const address = ip.split('%')[0].toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped) return mapped[1];

  const [head, tail] = address.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  // A trailing dotted quad occupies two groups.
  const tailSize = tailGroups.length + (tailGroups.at(-1)?.includes('.') ? 1 : 0);
  const zeros = address.includes('::') ? 8 - headGroups.length - tailSize : 0;
  const groups = [...headGroups, ...Array<string>(Math.max(zeros, 0)).fill('0'), ...tailGroups];
  const prefix = groups.slice(0, 4).map((group) => parseInt(group, 16).toString(16));
  return `${prefix.join(':')}::/64`;
}
