// src/routes/menu.routes.ts
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth'; // your names
import { audit } from '../lib/audit'; // optional, see note below

const router = Router();
const canEdit = requireRole('ADMIN', 'MANAGER');

// GET /api/menu?salesPointId=...&all=true
router.get('/', authenticate, async (req, res) => {
  const editor = ['ADMIN', 'MANAGER'].includes(req.user!.role);
  const all = req.query.all === 'true' && editor;
  const salesPointId = req.query.salesPointId as string | undefined;

  const categories = await prisma.inventoryCategory.findMany({
    where: all ? {} : { isActive: true },
    orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      items: {
        where: { ...(all ? {} : { isActive: true }), ...(salesPointId && { salesPointId }) },
        orderBy: { name: 'asc' },
      },
    },
  });
  res.json(categories);
});

// ---- Categories ----
router.post('/categories', authenticate, canEdit, async (req, res) => {
  const { name, section, sortOrder = 0 } = req.body;
  if (!name?.trim() || !['FOOD', 'DRINKS', 'PASTRIES'].includes(section))
    return res.status(400).json({ message: 'Name and valid section are required' });
  try {
    res.status(201).json(await prisma.inventoryCategory.create({ data: { name: name.trim(), section, sortOrder } }));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      return res.status(409).json({ message: 'Category already exists in this section' });
    throw e;
  }
});

router.put('/categories/:id', authenticate, canEdit, async (req, res) => {
  const { name, section, sortOrder, isActive } = req.body;
  res.json(await prisma.inventoryCategory.update({ where: { id: req.params.id }, data: { name, section, sortOrder, isActive } }));
});

router.delete('/categories/:id', authenticate, canEdit, async (req, res) => {
  const count = await prisma.inventoryItem.count({ where: { categoryId: req.params.id } });
  if (count) return res.status(409).json({ message: 'Move or delete this category’s items first' });
  await prisma.inventoryCategory.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ---- Items ----
router.post('/items', authenticate, canEdit, async (req, res) => {
  const { name, description, categoryId, salesPointId, sellPrice, costPrice = 0, quantity = 0, minLevel = 5 } = req.body;
  if (!name?.trim() || !categoryId || !salesPointId || !(Number(sellPrice) >= 0))
    return res.status(400).json({ message: 'Name, category, sales point and a valid price are required' });

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({
      data: { name: name.trim(), description, categoryId, salesPointId, sellPrice, costPrice, quantity, minLevel },
    });
    if (Number(quantity) > 0) {
      await tx.stockMovement.create({
        data: { itemId: created.id, type: 'OPENING', quantity, balance: quantity, userId: req.user!.id },
      });
    }
    return created;
  });
  res.status(201).json(item);
});

// Stock quantity is NOT editable here: use your stock adjustment / purchase flow so movements stay accurate
router.put('/items/:id', authenticate, canEdit, async (req, res) => {
  const { name, description, categoryId, salesPointId, sellPrice, costPrice, minLevel, isActive } = req.body;
  res.json(await prisma.inventoryItem.update({
    where: { id: req.params.id },
    data: { name, description, categoryId, salesPointId, sellPrice, costPrice, minLevel, isActive },
  }));
});

router.delete('/items/:id', authenticate, canEdit, async (req, res) => {
  try {
    await prisma.inventoryItem.delete({ where: { id: req.params.id } });
  } catch (e) {
    // Used in past orders / stock history / store stock: hide instead of deleting
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      await prisma.inventoryItem.update({ where: { id: req.params.id }, data: { isActive: false } });
      return res.json({ deactivated: true });
    }
    throw e;
  }
  res.status(204).end();
});

export default router;