import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { audit } from '../lib/audit';
import { asyncHandler, clientIp, HttpError, parse } from '../lib/http';
import { Prisma, prisma } from '../lib/prisma';
import { issueSession, revokeAllSessions, revokeSession } from '../lib/session';
import { decryptSecret, encryptSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUrl, verifyTotp } from '../lib/totp';
import { authenticate } from '../middleware/auth';

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
/** Guessing a 6-digit code must be expensive: 10 tries per 15 minutes per IP. */
const codeLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

const publicUser = (u: { id: string; username: string; email: string; role: string; fullName: string | null }) =>
  ({ id: u.id, username: u.username, email: u.email, role: u.role, fullName: u.fullName });

/** Short-lived proof that the password step passed. NOT an access token. */
const signChallenge = (userId: string) => jwt.sign({ id: userId, purpose: '2fa-challenge' }, config.jwtSecret, { expiresIn: '5m' });
const readChallenge = (token: string): string => {
  try {
    const p = jwt.verify(token, config.jwtSecret) as { id?: string; purpose?: string };
    if (p.purpose !== '2fa-challenge' || !p.id) throw new Error('wrong purpose');
    return p.id;
  } catch { throw new HttpError(401, 'Your sign-in expired. Please enter your password again.'); }
};

const ctx = (req: Parameters<typeof clientIp>[0]) => ({ ua: req.headers['user-agent'], ip: clientIp(req) });

/** Verifies a TOTP or recovery code and consumes it so it cannot be reused. */
async function checkSecondFactor(userId: string, input: { code?: string; recoveryCode?: string }): Promise<'totp' | 'recovery'> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!u.twoFactorEnabled || !u.twoFactorSecretEnc) throw new HttpError(400, 'Two-factor authentication is not enabled');
  if (input.code) {
    const step = verifyTotp(decryptSecret(u.twoFactorSecretEnc), input.code, u.twoFactorLastStep);
    if (step == null) throw new HttpError(400, 'That code is incorrect or already used');
    const won = await prisma.user.updateMany({ where: { id: u.id, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] }, data: { twoFactorLastStep: step } });
    if (won.count === 0) throw new HttpError(400, 'That code is incorrect or already used');
    return 'totp';
  }
  if (input.recoveryCode) {
    const hash = hashRecoveryCode(input.recoveryCode);
    const hashes = (u.twoFactorRecoveryHashes as string[] | null) ?? [];
    if (!hashes.includes(hash)) throw new HttpError(400, 'That recovery code is incorrect or already used');
    const rest = hashes.filter((h) => h !== hash);
    const won = await prisma.user.updateMany({ where: { id: u.id, twoFactorRecoveryHashes: { equals: hashes } }, data: { twoFactorRecoveryHashes: rest } });
    if (won.count === 0) throw new HttpError(400, 'That recovery code is incorrect or already used');
    return 'recovery';
  }
  throw new HttpError(400, 'Enter your authentication code');
}

/* ───────────── Login ───────────── */

authRouter.post('/login', limiter, asyncHandler(async (req, res) => {
  const { identifier, password } = parse(z.object({ identifier: z.string().min(1), password: z.string().min(1) }), req.body);
  const u = await prisma.user.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }] } });
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
    await audit(prisma, { userId: u?.id, action: 'LOGIN_FAILED', entity: 'User', entityId: u?.id, meta: { identifier }, ip: clientIp(req) });
    throw new HttpError(401, 'Incorrect username or password');
  }
  if (!u.isActive) throw new HttpError(403, 'This account has been disabled');

  if (u.twoFactorEnabled) return res.json({ twoFactorRequired: true, challengeToken: signChallenge(u.id) });

  const { token, sessionId } = await issueSession(u, ctx(req));
  await audit(prisma, { userId: u.id, action: 'LOGIN', entity: 'UserSession', entityId: sessionId, ip: clientIp(req) });
  const mustSetUpTwoFactor = config.requireTwoFactorRoles.includes(u.role);
  res.json({ token, user: publicUser(u), mustSetUpTwoFactor });
}));

authRouter.post('/2fa/verify', codeLimiter, asyncHandler(async (req, res) => {
  const b = parse(z.object({ challengeToken: z.string().min(1), code: z.string().optional(), recoveryCode: z.string().optional() }), req.body);
  const userId = readChallenge(b.challengeToken);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!u.isActive) throw new HttpError(403, 'This account has been disabled');
  let used: 'totp' | 'recovery';
  try { used = await checkSecondFactor(userId, b); }
  catch (e) { await audit(prisma, { userId, action: 'LOGIN_2FA_FAILED', entity: 'User', entityId: userId, ip: clientIp(req) }); throw e; }
  const { token, sessionId } = await issueSession(u, ctx(req));
  await audit(prisma, { userId, action: used === 'recovery' ? 'LOGIN_RECOVERY_CODE' : 'LOGIN', entity: 'UserSession', entityId: sessionId, ip: clientIp(req), meta: { twoFactor: true } });
  res.json({ token, user: publicUser(u), remainingRecoveryCodes: ((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).twoFactorRecoveryHashes as string[] | null)?.length ?? 0 });
}));

authRouter.get('/me', authenticate, asyncHandler(async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, username: true, email: true, role: true, fullName: true, twoFactorEnabled: true } });
  res.json({ ...u, mustSetUpTwoFactor: !u.twoFactorEnabled && config.requireTwoFactorRoles.includes(u.role) });
}));

authRouter.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await revokeSession(req.user!.sessionId, 'LOGOUT', req.user!.id);
  await audit(prisma, { userId: req.user!.id, action: 'LOGOUT', entity: 'UserSession', entityId: req.user!.sessionId, ip: clientIp(req) });
  res.json({ ok: true });
}));

authRouter.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const b = parse(z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }), req.body);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(b.currentPassword, u.passwordHash))) throw new HttpError(400, 'Current password is incorrect');
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(b.newPassword, 10) } });
  const r = await revokeAllSessions(u.id, 'PASSWORD_CHANGED', { exceptSessionId: req.user!.sessionId, byUserId: u.id });
  await audit(prisma, { userId: u.id, action: 'PASSWORD_CHANGED', entity: 'User', entityId: u.id, ip: clientIp(req), meta: { sessionsRevoked: r.count } });
  res.json({ ok: true, otherSessionsSignedOut: r.count });
}));

/* ───────────── Two-factor setup ───────────── */

authRouter.post('/2fa/setup', authenticate, asyncHandler(async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (u.twoFactorEnabled) throw new HttpError(409, 'Two-factor authentication is already enabled. Disable it first to re-enrol.');
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: u.id }, data: { twoFactorSecretEnc: encryptSecret(secret) } });
  res.json({ secret, otpauthUrl: otpauthUrl(secret, u.email) });
}));

authRouter.post('/2fa/enable', authenticate, codeLimiter, asyncHandler(async (req, res) => {
  const { code } = parse(z.object({ code: z.string().min(6) }), req.body);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (u.twoFactorEnabled) throw new HttpError(409, 'Two-factor authentication is already enabled');
  if (!u.twoFactorSecretEnc) throw new HttpError(400, 'Start the setup first');
  const step = verifyTotp(decryptSecret(u.twoFactorSecretEnc), code);
  if (step == null) throw new HttpError(400, 'That code is incorrect. Check the time on your phone and try again.');
  const { codes, hashes } = generateRecoveryCodes();
  await prisma.user.update({ where: { id: u.id }, data: { twoFactorEnabled: true, twoFactorEnabledAt: new Date(), twoFactorLastStep: step, twoFactorRecoveryHashes: hashes } });
  await audit(prisma, { userId: u.id, action: '2FA_ENABLED', entity: 'User', entityId: u.id, ip: clientIp(req) });
  res.json({ ok: true, recoveryCodes: codes });
}));

authRouter.post('/2fa/disable', authenticate, codeLimiter, asyncHandler(async (req, res) => {
  const b = parse(z.object({ password: z.string().min(1), code: z.string().optional(), recoveryCode: z.string().optional() }), req.body);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (config.requireTwoFactorRoles.includes(u.role)) throw new HttpError(403, 'Your role must keep two-factor authentication on. Ask an administrator.');
  if (!(await bcrypt.compare(b.password, u.passwordHash))) throw new HttpError(400, 'Password is incorrect');
  await checkSecondFactor(u.id, b);
  await prisma.user.update({ where: { id: u.id }, data: { twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorRecoveryHashes: Prisma.DbNull, twoFactorLastStep: null, twoFactorEnabledAt: null } });
  await audit(prisma, { userId: u.id, action: '2FA_DISABLED', entity: 'User', entityId: u.id, ip: clientIp(req) });
  res.json({ ok: true });
}));

authRouter.post('/2fa/recovery-codes', authenticate, codeLimiter, asyncHandler(async (req, res) => {
  const { code } = parse(z.object({ code: z.string().min(6) }), req.body);
  await checkSecondFactor(req.user!.id, { code });
  const { codes, hashes } = generateRecoveryCodes();
  await prisma.user.update({ where: { id: req.user!.id }, data: { twoFactorRecoveryHashes: hashes } });
  await audit(prisma, { userId: req.user!.id, action: '2FA_RECOVERY_REGENERATED', entity: 'User', entityId: req.user!.id, ip: clientIp(req) });
  res.json({ recoveryCodes: codes });
}));

/* ───────────── Sessions / devices ───────────── */

authRouter.get('/sessions', authenticate, asyncHandler(async (req, res) => {
  const rows = await prisma.userSession.findMany({
    where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, deviceLabel: true, ip: true, createdAt: true, lastSeenAt: true, expiresAt: true },
  });
  res.json(rows.map((s) => ({ ...s, current: s.id === req.user!.sessionId })));
}));

authRouter.delete('/sessions/:id', authenticate, asyncHandler(async (req, res) => {
  const s = await prisma.userSession.findUnique({ where: { id: req.params.id } });
  if (!s || s.userId !== req.user!.id) throw new HttpError(404, 'Session not found');
  await revokeSession(s.id, 'USER_REVOKED', req.user!.id);
  await audit(prisma, { userId: req.user!.id, action: 'SESSION_REVOKED', entity: 'UserSession', entityId: s.id, ip: clientIp(req), meta: { device: s.deviceLabel } });
  res.json({ ok: true, signedOutCurrent: s.id === req.user!.sessionId });
}));

authRouter.post('/sessions/revoke-others', authenticate, asyncHandler(async (req, res) => {
  const r = await revokeAllSessions(req.user!.id, 'USER_REVOKED_OTHERS', { exceptSessionId: req.user!.sessionId, byUserId: req.user!.id });
  await audit(prisma, { userId: req.user!.id, action: 'SESSIONS_REVOKED_OTHERS', entity: 'User', entityId: req.user!.id, ip: clientIp(req), meta: { count: r.count } });
  res.json({ ok: true, count: r.count });
}));