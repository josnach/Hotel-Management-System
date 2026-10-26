import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

const key = () => createHash('sha256').update(`folio-link:${config.jwtSecret}`).digest();
const mac = (payload: string) => createHmac('sha256', key()).update(payload).digest('base64url');

/** Expiring, unguessable link token for one folio. Nothing is stored; the signature is the proof. */
export function signFolioToken(folioId: string, ttlHours = 168): string {
  const payload = Buffer.from(JSON.stringify({ f: folioId, e: Date.now() + ttlHours * 3_600_000 })).toString('base64url');
  return `${payload}.${mac(payload)}`;
}

export function verifyFolioToken(token: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(mac(payload)), given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { f, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof f === 'string' && typeof e === 'number' && e > Date.now() ? f : null;
  } catch { return null; }
}

export const folioLink = (folioId: string, ttlHours?: number) => `${config.publicApiUrl}/p/folio/${signFolioToken(folioId, ttlHours)}`;

/** Short-lived session for the room QR page, bound to one stay. A folio-link token can never be used as one (different key). */
const pKey = () => createHash('sha256').update(`portal-session:${config.jwtSecret}`).digest();
const pMac = (payload: string) => createHmac('sha256', pKey()).update(payload).digest('base64url');
export function signPortalSession(stayId: string, ttlHours = 12): string {
  const payload = Buffer.from(JSON.stringify({ s: stayId, e: Date.now() + ttlHours * 3_600_000 })).toString('base64url');
  return `${payload}.${pMac(payload)}`;
}
export function verifyPortalSession(token: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(pMac(payload)), given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { s, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof s === 'string' && typeof e === 'number' && e > Date.now() ? s : null;
  } catch { return null; }
}

/** Verifies Meta's X-Hub-Signature-256 header against the raw request body. */
export function validWebhookSignature(raw: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!appSecret || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', appSecret).update(raw).digest('hex'));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}
