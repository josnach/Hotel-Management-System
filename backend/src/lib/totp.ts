import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

/* ───────────── RFC 6238 TOTP (Google/Microsoft Authenticator, Authy…) — no extra dependency ───────────── */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD = 30;
const DIGITS = 6;

export const base32Encode = (buf: Buffer) => {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};

export const base32Decode = (s: string) => {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
};

export const generateTotpSecret = () => base32Encode(randomBytes(20));

const hotp = (secret: string, counter: number) => {
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
};

const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Accepts the current code ±1 step. Returns the matched step (store it to block replays) or null. */
export function verifyTotp(secret: string, code: string, lastUsedStep?: number | null, now = Date.now()): number | null {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const current = Math.floor(now / 1000 / PERIOD);
  for (const step of [current, current - 1, current + 1]) {
    if (safeEq(hotp(secret, step), clean)) return lastUsedStep != null && step <= lastUsedStep ? null : step;
  }
  return null;
}

export const otpauthUrl = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`${config.hotelName}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(config.hotelName)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;

/* ───────────── Secret encryption at rest (AES-256-GCM) ───────────── */

const encKey = () => createHash('sha256').update(`2fa-secret:${config.twoFactorKey}`).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(stored: string): string {
  const [iv, tag, enc] = stored.split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

/* ───────────── Recovery codes ───────────── */

export const hashRecoveryCode = (code: string) => createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex');

/** 10 single-use codes like "K7QM-2XPD". Shown once; only hashes are stored. */
export function generateRecoveryCodes(n = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes = Array.from({ length: n }, () => {
    const b = randomBytes(8);
    const c = Array.from(b, (x) => alphabet[x % alphabet.length]).join('');
    return `${c.slice(0, 4)}-${c.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}