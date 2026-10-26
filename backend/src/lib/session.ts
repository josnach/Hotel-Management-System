import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { config } from '../config';
import { HttpError } from './http';
import { prisma } from './prisma';

export interface AccessPayload { id: string; username: string; role: UserRole; sid: string; exp?: number }

/** "Chrome on Windows", "Safari on iPhone"… */
export function deviceLabel(ua = ''): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ua ? 'Browser' : 'Unknown browser';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `${browser} on ${os}`;
}

/** Creates the session row and the signed JWT that points at it. */
export async function issueSession(user: { id: string; username: string; role: UserRole }, ctx: { ua?: string; ip?: string }) {
  const s = await prisma.userSession.create({
    data: { userId: user.id, deviceLabel: deviceLabel(ctx.ua), userAgent: ctx.ua?.slice(0, 300), ip: ctx.ip, expiresAt: new Date(Date.now() + 12 * 3_600_000) },
  });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, sid: s.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
  const exp = (jwt.decode(token) as { exp?: number } | null)?.exp;
  if (exp) await prisma.userSession.update({ where: { id: s.id }, data: { expiresAt: new Date(exp * 1000) } });
  return { token, sessionId: s.id };
}

/** The single place that decides if a bearer token is still good. Used by HTTP middleware AND both WebSockets. */
export async function verifyAccessToken(token: string) {
  let payload: AccessPayload;
  try { payload = jwt.verify(token, config.jwtSecret) as AccessPayload; } catch { throw new HttpError(401, 'Invalid or expired token'); }
  if (!payload.sid) throw new HttpError(401, 'Session expired, please sign in again');
  const session = await prisma.userSession.findUnique({ where: { id: payload.sid }, include: { user: true } });
  if (!session || session.userId !== payload.id) throw new HttpError(401, 'Session not found, please sign in again');
  if (session.revokedAt) throw new HttpError(401, 'This session was signed out');
  if (session.expiresAt.getTime() < Date.now()) throw new HttpError(401, 'Session expired, please sign in again');
  if (!session.user.isActive) throw new HttpError(401, 'Account disabled or not found');
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) void prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  return { user: session.user, sessionId: session.id };
}

export const revokeSession = (id: string, reason: string, byUserId?: string) =>
  prisma.userSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason, revokedById: byUserId } });

export const revokeAllSessions = (userId: string, reason: string, opts: { exceptSessionId?: string; byUserId?: string } = {}) =>
  prisma.userSession.updateMany({
    where: { userId, revokedAt: null, ...(opts.exceptSessionId ? { id: { not: opts.exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason, revokedById: opts.byUserId },
  });

/** Housekeeping: delete sessions that expired or were revoked over 30 days ago. */
export const purgeOldSessions = () =>
  prisma.userSession.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(Date.now() - 30 * 86_400_000) } }, { revokedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } }] } });