import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { asyncHandler, parse } from '../lib/http';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import { clientIp } from '../lib/http';
import { Prisma } from '../lib/prisma';
import { revokeAllSessions, revokeSession } from '../lib/session';

export const usersRouter = Router();
usersRouter.use(requireRole());

const sel = { id: true, username: true, email: true, fullName: true, role: true, isActive: true, createdAt: true, twoFactorEnabled: true };
const body = z.object({
  username: z.string().min(2), email: z.string().email(), fullName: z.string().optional(),
  role: z.nativeEnum(UserRole), password: z.string().min(8).optional(),
});

usersRouter.get('/', asyncHandler(async (_q, res) => res.json(await prisma.user.findMany({ select: sel, orderBy: { username: 'asc' } }))));
usersRouter.get('/:id', asyncHandler(async (req, res) => res.json(await prisma.user.findUniqueOrThrow({ where: { id: req.params.id }, select: sel }))));
usersRouter.post('/', asyncHandler(async (req, res) => {
  const b = parse(body.extend({ password: z.string().min(8) }), req.body);
  const { password, ...rest } = b;
  res.status(201).json(await prisma.user.create({ data: { ...rest, passwordHash: await bcrypt.hash(password, 10) }, select: sel }));
}));
usersRouter.put('/:id', asyncHandler(async (req, res) => {
  const { password, ...rest } = parse(body.partial(), req.body);
  const updated = await prisma.user.update({ where: { id: req.params.id }, data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) }, select: sel });
  if (password) await revokeAllSessions(req.params.id, 'PASSWORD_RESET_BY_ADMIN', { byUserId: req.user!.id });
  res.json(updated);
}));
usersRouter.post('/:id/toggle', asyncHandler(async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id } });
  const updated = await prisma.user.update({ where: { id: u.id }, data: { isActive: !u.isActive }, select: sel });
  if (!updated.isActive) await revokeAllSessions(u.id, 'ACCOUNT_DISABLED', { byUserId: req.user!.id });
  res.json(updated);
}));
usersRouter.delete('/:id', asyncHandler(async (req, res) => { await prisma.user.delete({ where: { id: req.params.id } }); res.status(204).end(); }));

/** Devices a user is signed in on. */
usersRouter.get('/:id/sessions', asyncHandler(async (req, res) => {
  res.json(await prisma.userSession.findMany({
    where: { userId: req.params.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, deviceLabel: true, ip: true, createdAt: true, lastSeenAt: true, expiresAt: true },
  }));
}));

/** Forced logout: one device (body.sessionId) or every device. */
usersRouter.post('/:id/force-logout', asyncHandler(async (req, res) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined;
  let count = 0;
  if (sessionId) {
    const s = await prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!s || s.userId !== req.params.id) return res.status(404).json({ message: 'Session not found' });
    count = (await revokeSession(sessionId, 'FORCED_LOGOUT', req.user!.id)).count;
  } else {
    count = (await revokeAllSessions(req.params.id, 'FORCED_LOGOUT', { byUserId: req.user!.id })).count;
  }
  await audit(prisma, { userId: req.user!.id, action: 'FORCED_LOGOUT', entity: 'User', entityId: req.params.id, ip: clientIp(req), meta: { sessionId: sessionId ?? 'ALL', count } });
  res.json({ ok: true, count });
}));

/** Lost phone and recovery codes: admin switches 2FA off so the user can enrol again. */
usersRouter.post('/:id/reset-2fa', asyncHandler(async (req, res) => {
  await prisma.user.update({ where: { id: req.params.id }, data: { twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorRecoveryHashes: Prisma.DbNull, twoFactorLastStep: null, twoFactorEnabledAt: null } });
  await revokeAllSessions(req.params.id, '2FA_RESET', { byUserId: req.user!.id });
  await audit(prisma, { userId: req.user!.id, action: '2FA_RESET_BY_ADMIN', entity: 'User', entityId: req.params.id, ip: clientIp(req) });
  res.json({ ok: true });
}));