import { Router, Request, Response, NextFunction } from "express";
import { Prisma, TxType, PaymentMethod } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
router.use(authenticate, requireRole("ADMIN", "MANAGER", "RECEPTIONIST", "ACCOUNTANT"));

const wrap =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const num = (v: any) => Number(v ?? 0);
const GROUP_TX = [TxType.DEBIT_GROUP, TxType.CREDIT];
const PAYABLE_METHODS: PaymentMethod[] = ["CASH", "CARD", "TRANSFER"];
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Group balance = payments - bills over group-billed transactions. Negative = group owes. */
async function balancesByGroup(): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ groupId: string; balance: Prisma.Decimal }[]>`
    SELECT f."groupId", COALESCE(SUM(t."payment" - t."bill"), 0) AS balance
    FROM "FolioTransaction" t
    JOIN "Folio" f ON f.id = t."folioId"
    WHERE f."groupId" IS NOT NULL
      AND t."type" IN ('DEBIT_GROUP', 'CREDIT')
    GROUP BY f."groupId"`;
  return new Map(rows.map((r) => [r.groupId, num(r.balance)]));
}

async function balanceOf(groupId: string): Promise<number> {
  const a = await prisma.folioTransaction.aggregate({
    where: { type: { in: GROUP_TX }, folio: { groupId } },
    _sum: { bill: true, payment: true },
  });
  return num(a._sum.payment) - num(a._sum.bill);
}

/** 1. LIST: Groups Management table */
router.get("/", wrap(async (_req, res) => {
  const [groups, balances, counts] = await Promise.all([
    prisma.group.findMany({ orderBy: { createdAt: "desc" } }),
    balancesByGroup(),
    prisma.stay.groupBy({
      by: ["groupId"],
      where: { status: "CHECKED_IN", groupId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const memberCount = new Map(counts.map((c) => [c.groupId!, c._count._all]));

  res.json(groups.map((g) => {
    const members = memberCount.get(g.id) ?? 0;
    return {
      id: g.id,
      name: g.name,
      contact: g.contact,
      phone: g.phone,
      members,
      status: members > 0 ? "CHECKED_IN" : "NOT_CHECKED_IN",
      balance: balances.get(g.id) ?? 0,
    };
  }));
}));

/** 2. CREATE: Create New Group modal */
router.post("/", wrap(async (req, res) => {
  const { name, contact, phone, notes } = req.body ?? {};
  if (!name || !String(name).trim()) return res.status(400).json({ message: "Group name is required" });
  try {
    const g = await prisma.group.create({
      data: {
        name: String(name).trim(),
        contact: contact?.trim() || null,
        phone: phone?.trim() || null,
        notes: notes?.trim() || null,
      },
    });
    res.status(201).json(g);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ message: "A group with this name already exists" });
    throw e;
  }
}));

/** 3. DETAIL: header, members, transactions with running balance, print totals */
router.get("/:id", wrap(async (req, res) => {
  const { id } = req.params;
  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) return res.status(404).json({ message: "Group not found" });

  const [memberStays, txs] = await Promise.all([
    prisma.stay.findMany({
      where: { groupId: id, status: "CHECKED_IN" },
      include: { guest: true, room: true, folio: true },
    }),
    prisma.folioTransaction.findMany({
      where: { type: { in: GROUP_TX }, folio: { groupId: id } },
      include: { folio: { include: { guest: true } }, salesPoint: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  let running = 0, totalDebits = 0, totalCredits = 0;
  const transactions = txs.map((t) => {
    const bill = num(t.bill), payment = num(t.payment);
    running += payment - bill;
    totalDebits += bill;
    totalCredits += payment;
    const g = t.folio.guest;
    return {
      id: t.id,
      date: t.createdAt,
      guestName: g ? `${g.firstName} ${g.lastName}` : null, // null -> "N/A"
      description: t.description,
      source: t.salesPoint?.name ?? "Frontdesk",
      type: t.type === "CREDIT" ? "Credit" : "Debit",
      bill, payment, balance: running,
    };
  });

  const stayIds = memberStays.map((s) => s.id);
  const memberBalances = stayIds.length
    ? await prisma.folioTransaction.groupBy({
        by: ["folioId"],
        where: { type: { in: GROUP_TX }, folio: { stayId: { in: stayIds } } },
        _sum: { bill: true, payment: true },
      })
    : [];
  const balByFolio = new Map(memberBalances.map((m) => [m.folioId, num(m._sum.payment) - num(m._sum.bill)]));

  res.json({
    group: { id: group.id, name: group.name, contact: group.contact, phone: group.phone, notes: group.notes },
    balance: running,
    status: memberStays.length > 0 ? "CHECKED_IN" : "NOT_CHECKED_IN",
    members: memberStays.map((s) => ({
      stayId: s.id,
      name: `${s.guest.firstName} ${s.guest.lastName}`,
      phone: s.guest.phone,
      room: s.room.number,
      balance: s.folio ? balByFolio.get(s.folio.id) ?? 0 : 0,
    })),
    transactions,
    totals: { debits: totalDebits, credits: totalCredits, balance: running },
  });
}));

/** 4. EDIT */
router.put("/:id", wrap(async (req, res) => {
  const { name, contact, phone, notes } = req.body ?? {};
  if (!name || !String(name).trim()) return res.status(400).json({ message: "Group name is required" });
  try {
    const g = await prisma.group.update({
      where: { id: req.params.id },
      data: {
        name: String(name).trim(),
        contact: contact?.trim() || null,
        phone: phone?.trim() || null,
        notes: notes?.trim() || null,
      },
    });
    res.json(g);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ message: "A group with this name already exists" });
    if (e.code === "P2025") return res.status(404).json({ message: "Group not found" });
    throw e;
  }
}));

/** 5. "Add Checked-in Guests to Group": searchable list of in-house guests not yet in a group */
router.get("/:id/available-guests", wrap(async (req, res) => {
  const q = String(req.query.search ?? "").trim();
  const stays = await prisma.stay.findMany({
    where: {
      status: "CHECKED_IN",
      groupId: null,
      ...(q && {
        OR: [
          { guest: { firstName: { contains: q, mode: "insensitive" } } },
          { guest: { lastName: { contains: q, mode: "insensitive" } } },
          { guest: { phone: { contains: q } } },
          { room: { number: { contains: q } } },
        ],
      }),
    },
    include: { guest: true, room: true },
    orderBy: { checkInAt: "desc" },
    take: 50,
  });
  res.json(stays.map((s) => ({
    stayId: s.id,
    name: `${s.guest.firstName} ${s.guest.lastName}`,
    phone: s.guest.phone,
    room: s.room.number,
  })));
}));

/** 6. Add a guest (their stay and folio) to the group */
router.post("/:id/members", wrap(async (req, res) => {
  const { stayId } = req.body ?? {};
  if (!stayId) return res.status(400).json({ message: "stayId is required" });

  await prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({ where: { id: req.params.id } });
    if (!group) throw Object.assign(new Error("Group not found"), { status: 404 });
    const stay = await tx.stay.findUnique({ where: { id: stayId } });
    if (!stay || stay.status !== "CHECKED_IN")
      throw Object.assign(new Error("Guest is not currently checked in"), { status: 400 });
    if (stay.groupId)
      throw Object.assign(new Error("Guest already belongs to a group"), { status: 409 });

    await tx.stay.update({ where: { id: stayId }, data: { groupId: group.id } });
    await tx.folio.updateMany({ where: { stayId }, data: { groupId: group.id } });
  });
  res.status(201).json({ ok: true });
}));

/** 7. "Add Payment to Group Account" */
router.post("/:id/payments", wrap(async (req, res) => {
  const amount = Number(req.body?.amount);
  const method = String(req.body?.method ?? "").toUpperCase() as PaymentMethod;
  const description = String(req.body?.description ?? "").trim();

  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Enter a valid amount" });
  if (!PAYABLE_METHODS.includes(method)) return res.status(400).json({ message: "Select a payment method" });
  if (!description) return res.status(400).json({ message: "Description is required" });

  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ message: "Group not found" });

  const tx = await prisma.$transaction(async (db) => {
    let account = await db.folio.findFirst({ where: { groupId: group.id, isGroupAccount: true } });
    if (!account) {
      account = await db.folio.create({
        data: { folioNo: `GRP-${Date.now()}`, groupId: group.id, isGroupAccount: true },
      });
    }
    return db.folioTransaction.create({
      data: {
        folioId: account.id,
        type: TxType.CREDIT,
        description: `${description} - Payment via ${titleCase(method)}`,
        bill: 0,
        payment: amount,
        method,
        userId: (req as any).user?.id ?? null,
      },
    });
  });

  res.status(201).json({ transaction: tx, balance: await balanceOf(group.id) });
}));

/** 8. HISTORY page */
router.get("/:id/history", wrap(async (req, res) => {
  const { id } = req.params;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 10;

  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) return res.status(404).json({ message: "Group not found" });

  const folioWhere = { groupId: id, isGroupAccount: false };
  const [totalFolios, folios, statusRows, checkedIn, balance] = await Promise.all([
    prisma.folio.count({ where: folioWhere }),
    prisma.folio.findMany({
      where: folioWhere,
      include: { guest: true, stay: { include: { room: true, guest: true } } },
      orderBy: { openedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.folio.groupBy({ by: ["status"], where: folioWhere, _count: { _all: true } }),
    prisma.stay.count({ where: { groupId: id, status: "CHECKED_IN" } }),
    balanceOf(id),
  ]);

  const sums = folios.length
    ? await prisma.folioTransaction.groupBy({
        by: ["folioId"],
        where: { type: { in: GROUP_TX }, folioId: { in: folios.map((f) => f.id) } },
        _sum: { bill: true, payment: true },
      })
    : [];
  const bal = new Map(sums.map((s) => [s.folioId, num(s._sum.payment) - num(s._sum.bill)]));
  const dist = (s: string) => statusRows.find((r) => r.status === s)?._count._all ?? 0;

  res.json({
    group: { id: group.id, name: group.name, contact: group.contact, phone: group.phone, notes: group.notes },
    stats: {
      totalMembers: checkedIn,
      checkedInMembers: checkedIn,
      totalFolios,
      balance,
      status: checkedIn > 0 ? "Active" : "Inactive",
    },
    folios: folios.map((f) => {
      const g = f.guest ?? f.stay?.guest;
      return {
        id: f.id,
        folioNo: f.folioNo,
        guestId: g?.id ?? null,
        guestName: g ? `${g.firstName} ${g.lastName}` : null,
        room: f.stay?.room.number ?? null,
        checkIn: f.stay?.checkInAt ?? null,
        checkOut: f.stay?.checkOutAt ?? null,
        balance: bal.get(f.id) ?? 0,
        status: f.status,
      };
    }),
    pagination: { page, pageSize, total: totalFolios, pages: Math.ceil(totalFolios / pageSize) },
    statusDistribution: {
      CHECKED_IN: dist("ACTIVE"),
      CHECKED_OUT: dist("CHECKED_OUT"),
      SETTLED: dist("SETTLED"),
    },
  });
}));

export default router;