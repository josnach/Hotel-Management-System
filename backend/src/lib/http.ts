import { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Returns the schema's OUTPUT type, so .default() fields are never undefined for callers. */
export const parse = <S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> => {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'Validation failed', r.error.flatten());
  return r.data;
};

export const page = (q: Record<string, unknown>, def = 20) => {
  const p = Math.max(1, Number(q.page ?? 1));
  const size = Math.min(200, Math.max(1, Number(q.pageSize ?? def)));
  return { skip: (p - 1) * size, take: size, page: p, pageSize: size };
};

export const dayRange = (d?: string | Date) => {
  const base = d ? new Date(d) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

export const clientIp = (req: Request) =>
  (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.socket.remoteAddress ?? undefined;
