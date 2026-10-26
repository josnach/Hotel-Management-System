import type { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { HttpError } from '../lib/http';
import { verifyAccessToken } from '../lib/session';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  /** The device session this request belongs to. */
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Missing token');

    const { user, sessionId } = await verifyAccessToken(authorization.slice(7));
    req.user = { id: user.id, username: user.username, role: user.role, sessionId };
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, 'Invalid or expired token'));
  }
};

/** ADMIN always passes. */
export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (role === 'ADMIN') return next();
    if (role === 'MANAGER' && roles.length > 0) return next();
    if (role && roles.includes(role)) return next();
    next(new HttpError(403, 'You do not have permission to do this'));
  };