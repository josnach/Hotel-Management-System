
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const currenciesRouter = Router();

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    username?: string;
    role: string;
  };
};

const currencySchema = z.object({
  code: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(100),
  symbol: z.string().trim().min(1).max(10),
  decimalPlaces: z.number().int().min(0).max(4).default(2),
});

const rateSchema = z.object({
  fromCurrencyCode: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  toCurrencyCode: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  // Keep the rate as a decimal string to avoid JS floating-point conversion.
  rate: z
    .string()
    .trim()
    .regex(/^\d{1,10}(\.\d{1,10})?$/, 'Rate must be a positive decimal number')
    .refine((value) => !/^0+(\.0+)?$/.test(value), {
      message: 'Rate must be greater than zero',
    }),
  effectiveFrom: z.string().datetime({ offset: true }).optional(),
  reason: z.string().trim().max(500).optional(),
});

function getUser(req: Request) {
  return (req as AuthenticatedRequest).user;
}

function requireCurrencyManager(req: Request, res: any): boolean {
  const user = getUser(req);

  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }

  if (!['ADMIN', 'MANAGER'].includes(user.role)) {
    res.status(403).json({
      error: 'Only administrators and managers can manage currencies and exchange rates',
    });
    return false;
  }

  return true;
}

function getValidationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

/**
 * GET /api/currencies
 * Any authenticated user can view active currencies.
 * ?all=true allows ADMIN/MANAGER to view inactive currencies too.
 */
currenciesRouter.get('/', async (req, res, next) => {
  try {
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const includeAll = req.query.all === 'true';

    if (includeAll && !['ADMIN', 'MANAGER'].includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const currencies = await prisma.currency.findMany({
      where: includeAll ? {} : { isActive: true },
      orderBy: { code: 'asc' },
    });

    const baseSetting = await prisma.setting.findUnique({
      where: { key: 'BASE_CURRENCY' },
    });

    return res.json({
      currencies,
      baseCurrency: baseSetting?.value ?? 'NGN',
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/currencies
 * Adds a currency. This endpoint intentionally does not edit or delete
 * existing currency records.
 */
currenciesRouter.post('/', async (req, res, next) => {
  try {
    if (!requireCurrencyManager(req, res)) return;

    const parsed = currencySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: getValidationMessage(parsed.error),
      });
    }

    const data = parsed.data;

    const existing = await prisma.currency.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      return res.status(409).json({
        error: `Currency ${data.code} already exists`,
      });
    }

    const user = getUser(req)!;

    const currency = await prisma.$transaction(async (tx) => {
      const created = await tx.currency.create({
        data: {
          code: data.code,
          name: data.name,
          symbol: data.symbol,
          decimalPlaces: data.decimalPlaces,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'CURRENCY_CREATED',
          entity: 'Currency',
          entityId: created.code,
          meta: {
            code: created.code,
            name: created.name,
            symbol: created.symbol,
            decimalPlaces: created.decimalPlaces,
          },
          ip: req.ip,
        },
      });

      return created;
    });

    return res.status(201).json({ currency });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/currencies/rates
 * Returns recent exchange-rate records with their currency details.
 */
currenciesRouter.get('/rates', async (req, res, next) => {
  try {
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const from = typeof req.query.from === 'string'
      ? req.query.from.toUpperCase()
      : undefined;
    const to = typeof req.query.to === 'string'
      ? req.query.to.toUpperCase()
      : undefined;

    const rates = await prisma.fxRate.findMany({
      where: {
        ...(from ? { fromCurrencyCode: from } : {}),
        ...(to ? { toCurrencyCode: to } : {}),
      },
      include: {
        fromCurrency: true,
        toCurrency: true,
      },
      orderBy: [
        { effectiveFrom: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 100,
    });

    return res.json({ rates });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/currencies/rates
 * Records a new rate. Historical records are never updated or deleted.
 */
currenciesRouter.post('/rates', async (req, res, next) => {
  try {
    if (!requireCurrencyManager(req, res)) return;

    const parsed = rateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: getValidationMessage(parsed.error),
      });
    }

    const data = parsed.data;

    if (data.fromCurrencyCode === data.toCurrencyCode) {
      return res.status(400).json({
        error: 'Source and target currencies must be different',
      });
    }

    const [fromCurrency, toCurrency] = await Promise.all([
      prisma.currency.findUnique({
        where: { code: data.fromCurrencyCode },
      }),
      prisma.currency.findUnique({
        where: { code: data.toCurrencyCode },
      }),
    ]);

    if (!fromCurrency || !toCurrency) {
      return res.status(400).json({
        error: 'Both currencies must exist before recording an exchange rate',
      });
    }

    if (!fromCurrency.isActive || !toCurrency.isActive) {
      return res.status(400).json({
        error: 'Exchange rates can only be recorded for active currencies',
      });
    }

    const user = getUser(req)!;
    const effectiveFrom = data.effectiveFrom
      ? new Date(data.effectiveFrom)
      : new Date();

    const rate = await prisma.$transaction(async (tx) => {
      const created = await tx.fxRate.create({
        data: {
          fromCurrencyCode: data.fromCurrencyCode,
          toCurrencyCode: data.toCurrencyCode,
          rate: data.rate,
          effectiveFrom,
          reason: data.reason,
          createdById: user.id,
        },
        include: {
          fromCurrency: true,
          toCurrency: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'FX_RATE_CREATED',
          entity: 'FxRate',
          entityId: created.id,
          meta: {
            fromCurrencyCode: created.fromCurrencyCode,
            toCurrencyCode: created.toCurrencyCode,
            rate: created.rate.toString(),
            effectiveFrom: created.effectiveFrom.toISOString(),
            reason: created.reason,
          },
          ip: req.ip,
        },
      });

      return created;
    });

    return res.status(201).json({ rate });
  } catch (error) {
    return next(error);
  }
});
