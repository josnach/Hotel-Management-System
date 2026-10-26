import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/http';

export const notFound = (_req: Request, res: Response) => res.status(404).json({ message: 'Not found' });

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message, details: err.details });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'A record with these details already exists' });
    if (err.code === 'P2025') return res.status(404).json({ message: 'Record not found' });
    if (err.code === 'P2003') return res.status(409).json({ message: 'This record is in use and cannot be removed' });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on our side' });
};
