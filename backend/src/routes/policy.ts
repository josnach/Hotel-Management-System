import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { getFoodCostTarget, getMaxDiscountPercent, setFoodCostTarget, setMaxDiscountPercent } from '../services/policy';

export const policyRouter = Router();

/** Anyone logged in can read the limits so the forms can explain them. */
policyRouter.get('/', asyncHandler(async (_q, res) => res.json({ maxDiscountPercent: await getMaxDiscountPercent(), foodCostTarget: await getFoodCostTarget() })));

policyRouter.put('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ maxDiscountPercent: z.coerce.number().min(0).max(100) }), req.body);
  const from = await getMaxDiscountPercent();
  await setMaxDiscountPercent(b.maxDiscountPercent);
  await audit(prisma, { userId: req.user!.id, action: 'POLICY_CHANGE', entity: 'Setting', entityId: 'policy.maxDiscountPercent', meta: { from, to: b.maxDiscountPercent } });
  res.json({ maxDiscountPercent: b.maxDiscountPercent });
}));

policyRouter.put('/food-cost-target', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ foodCostTarget: z.coerce.number().min(1).max(100) }), req.body);
  const from = await getFoodCostTarget();
  await setFoodCostTarget(b.foodCostTarget);
  await audit(prisma, { userId: req.user!.id, action: 'POLICY_CHANGE', entity: 'Setting', entityId: 'policy.foodCostTarget', meta: { from, to: b.foodCostTarget } });
  res.json({ foodCostTarget: b.foodCostTarget });
}));
