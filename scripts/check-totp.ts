/**
 * TOTP checks against the published test vectors. No framework, no database:
 *   npx tsx scripts/check-totp.ts
 */
import assert from 'node:assert/strict';
import {
  base32Decode,
  base32Encode,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hotp,
  parseEncryptionKey,
  totp,
  verifyTotp,
  type TotpAlgorithm,
} from '../lib/totp';

const SEEDS: Record<TotpAlgorithm, Buffer> = {
  sha1: Buffer.from('12345678901234567890'),
  sha256: Buffer.from('12345678901234567890123456789012'),
  sha512: Buffer.from('1234567890123456789012345678901234567890123456789012345678901234'),
};

// RFC 6238 appendix B: [time, sha1, sha256, sha512], 8 digits.
const RFC6238: Array<[number, string, string, string]> = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

// RFC 4226 appendix D: counters 0 to 9.
const RFC4226 = [
  '755224', '287082', '359152', '969429', '338314',
  '254676', '287922', '162583', '399871', '520489',
];

let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`ok   ${name}`);
}

for (const [time, sha1, sha256, sha512] of RFC6238) {
  check(`RFC 6238 T=${time}`, () => {
    assert.equal(totp(SEEDS.sha1, time, 8, 'sha1'), sha1);
    assert.equal(totp(SEEDS.sha256, time, 8, 'sha256'), sha256);
    assert.equal(totp(SEEDS.sha512, time, 8, 'sha512'), sha512);
  });
}

check('RFC 4226 counters 0-9', () => {
  RFC4226.forEach((code, counter) => assert.equal(hotp(SEEDS.sha1, counter), code));
});

check('base32: RFC 4648 vector and round trip', () => {
  assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
  const secret = generateTotpSecret();
  assert.deepEqual(base32Decode(base32Encode(secret)), secret);
});

check('verify: accepts one step of drift, rejects two', () => {
  const now = 1_700_000_000;
  const at = (seconds: number) => totp(SEEDS.sha1, seconds);
  assert.notEqual(verifyTotp(SEEDS.sha1, at(now), now), null);
  assert.notEqual(verifyTotp(SEEDS.sha1, at(now - 30), now), null);
  assert.notEqual(verifyTotp(SEEDS.sha1, at(now + 30), now), null);
  assert.equal(verifyTotp(SEEDS.sha1, at(now - 90), now), null);
  assert.equal(verifyTotp(SEEDS.sha1, at(now + 90), now), null);
});

check('verify: a used step cannot be replayed', () => {
  const now = 1_700_000_000;
  const code = totp(SEEDS.sha1, now);
  const step = verifyTotp(SEEDS.sha1, code, now);
  assert.notEqual(step, null);
  assert.equal(verifyTotp(SEEDS.sha1, code, now, step), null);
  assert.equal(verifyTotp(SEEDS.sha1, code, now + 20, step), null);
});

check('verify: malformed codes are refused', () => {
  for (const bad of ['', '12345', '1234567', 'abcdef', '12 456']) {
    assert.equal(verifyTotp(SEEDS.sha1, bad, 1_700_000_000), null);
  }
});

check('secret encryption: round trip, wrong key, wrong admin, tamper', () => {
  const key = parseEncryptionKey('ab'.repeat(32))!;
  const other = parseEncryptionKey('cd'.repeat(32))!;
  const secret = generateTotpSecret();
  const sealed = encryptTotpSecret(secret, key, 'admin-1');
  assert.deepEqual(decryptTotpSecret(sealed, key, 'admin-1'), secret);
  assert.equal(decryptTotpSecret(sealed, other, 'admin-1'), null);
  assert.equal(decryptTotpSecret(sealed, key, 'admin-2'), null);
  const parts = sealed.split('.');
  parts[3] = Buffer.from(Buffer.from(parts[3], 'base64url').map((byte) => byte ^ 1)).toString('base64url');
  assert.equal(decryptTotpSecret(parts.join('.'), key, 'admin-1'), null);
  assert.equal(parseEncryptionKey('too-short'), null);
  assert.equal(parseEncryptionKey(undefined), null);
});

check('recovery codes: unique, format-insensitive hash, scoped per admin', () => {
  const codes = generateRecoveryCodes();
  assert.equal(new Set(codes).size, 10);
  assert.match(codes[0], /^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
  const hash = hashRecoveryCode('a', codes[0]);
  assert.equal(hashRecoveryCode('a', codes[0].toLowerCase().replace(/-/g, ' ')), hash);
  assert.notEqual(hashRecoveryCode('b', codes[0]), hash);
});

console.log(`\n${passed} checks passed`);
