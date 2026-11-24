import { Router, Request, Response } from "express";
import { PrismaClient, ReservationStatus, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
export const reservationsRouter = Router();

const DAY = 86_400_000;
const nightsBetween = (a: Date, b: Date) => Math.max(1, Math.round((b.getTime() - a.getTime()) / DAY));
const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);

const include = {
  guest: true,
  room: { include: { type: true } },
  group: true,
  payments: { orderBy: { createdAt: "asc" as const } },
};

function shape(r: any) {
  const paid = r.payments.reduce((s: number, p: any) => s + num(p.amount), 0);
  const total = num(r.estimatedTotal);
  return {
    id: r.id,
    reservationNumber: r.reservationNumber,
    createdAt: r.createdAt,
    status: r.status,
    guest: {
      name: `${r.guest.firstName ?? ""} ${r.guest.lastName ?? ""}`.trim() || r.guest.name,
      phone: r.guest.phone,
      email: r.guest.email,
      idNumber: r.guest.idNumber,
    },
    room: { id: r.room.id, number: r.room.number, type: r.room.type?.name ?? "", pricePerNight: num(r.room.pricePerNight) },
    group: r.group ? { id: r.group.id, name: r.group.name } : null,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    nights: nightsBetween(r.checkIn, r.checkOut),
    numberOfGuests: r.numberOfGuests,
    estimatedTotal: total,
    paidAmount: paid,
    balanceDue: Math.max(0, total - paid),
    paymentMethod: r.paymentMethod,
    guaranteeType: r.guaranteeType,
    specialRequests: r.specialRequests,
    payments: r.payments.map((p: any) => ({
      id: p.id, date: p.createdAt, description: p.description, amount: num(p.amount),
    })),
  };
}

/* LIST: GET /api/reservations?status=CONFIRMED&q=fatima */
reservationsRouter.get("/", async (req: Request, res: Response) => {
  const { status, q } = req.query as { status?: string; q?: string };

  const where: Prisma.ReservationWhereInput = {};
  if (status && status !== "ALL") where.status = status as ReservationStatus;
  if (q?.trim()) {
    const term = q.trim();
    where.OR = [
      { reservationNumber: { contains: term, mode: "insensitive" } },
      { guest: { firstName: { contains: term, mode: "insensitive" } } },
      { guest: { lastName: { contains: term, mode: "insensitive" } } },
      { guest: { phone: { contains: term } } },
      { room: { number: { contains: term, mode: "insensitive" } } },
    ];
  }

  const [rows, grouped] = await Promise.all([
    prisma.reservation.findMany({ where, include, orderBy: { checkIn: "asc" } }),
    prisma.reservation.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const count = (s: ReservationStatus) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  res.json({
    data: rows.map(shape),
    counts: {
      all: grouped.reduce((s, g) => s + g._count._all, 0),
      confirmed: count("CONFIRMED"),
      checkedIn: count("CHECKED_IN"),
      cancelled: count("CANCELLED"),
    },
  });
});

/* DETAIL: GET /api/reservations/:id */
reservationsRouter.get("/:id", async (req, res) => {
  const r = await prisma.reservation.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!r) return res.status(404).json({ message: "Reservation not found" });
  res.json(shape(r));
});

/* EDIT: PUT /api/reservations/:id  (only while CONFIRMED) */
reservationsRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { roomId, groupId, checkIn, checkOut, numberOfGuests, paymentMethod, guaranteeType, specialRequests } = req.body;

  const existing = await prisma.reservation.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: "Reservation not found" });
  if (existing.status !== "CONFIRMED")
    return res.status(409).json({ message: "Only confirmed reservations can be edited" });

  const cin = new Date(checkIn);
  const cout = new Date(checkOut);
  if (!(cout > cin)) return res.status(400).json({ message: "Check-out must be after check-in" });
  if (!numberOfGuests || numberOfGuests < 1) return res.status(400).json({ message: "Number of guests is required" });

  const room = await prisma.room.findUnique({ where: { id: Number(roomId) } });
  if (!room) return res.status(400).json({ message: "Select a valid room" });

  // room must be free for the new dates (ignore this reservation itself)
  const clash = await prisma.reservation.findFirst({
    where: {
      id: { not: id },
      roomId: room.id,
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      checkIn: { lt: cout },
      checkOut: { gt: cin },
    },
  });
  if (clash) return res.status(409).json({ message: `Room ${room.number} is already booked for those dates` });

  const estimatedTotal = num(room.pricePerNight) * nightsBetween(cin, cout);

  const updated = await prisma.reservation.update({
    where: { id },
    data: {
      roomId: room.id,
      groupId: groupId ? Number(groupId) : null,
      checkIn: cin,
      checkOut: cout,
      numberOfGuests: Number(numberOfGuests),
      estimatedTotal,
      paymentMethod,
      guaranteeType,
      specialRequests: specialRequests || null,
    },
    include,
  });
  res.json(shape(updated));
});

/* CHECK IN: POST /api/reservations/:id/check-in
   Creates the folio, posts the deposit as a credit, charges the first night, marks room occupied. */
reservationsRouter.post("/:id/check-in", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const r = await tx.reservation.findUnique({ where: { id }, include: { room: true, payments: true, folio: true } });
      if (!r) throw { code: 404, message: "Reservation not found" };
      if (r.status !== "CONFIRMED") throw { code: 409, message: `Cannot check in a ${r.status.toLowerCase()} reservation` };
      if (r.folio) throw { code: 409, message: "A folio already exists for this reservation" };
      if (r.room.status === "OCCUPIED") throw { code: 409, message: `Room ${r.room.number} is currently occupied` };

      const folio = await tx.folio.create({ data: { reservationId: r.id } });

      // deposits already paid become credits on the folio
      for (const p of r.payments) {
        await tx.folioCharge.create({
          data: { folioId: folio.id, type: "DEPOSIT", description: p.description, amount: -num(p.amount) },
        });
      }
      // first night's room rate; subsequent nights are posted by the nightly job
      await tx.folioCharge.create({
        data: { folioId: folio.id, type: "ROOM", description: `Room ${r.room.number} - night 1`, amount: r.room.pricePerNight },
      });

      await tx.room.update({ where: { id: r.roomId }, data: { status: "OCCUPIED" } });
      return tx.reservation.update({ where: { id }, data: { status: "CHECKED_IN" }, include });
    });
    res.json(shape(result));
  } catch (e: any) {
    res.status(e.code ?? 500).json({ message: e.message ?? "Check-in failed" });
  }
});

/* QUICK ACTIONS */
reservationsRouter.post("/:id/payments", async (req, res) => {
  const id = Number(req.params.id);
  const amount = Number(req.body.amount);
  if (!(amount > 0)) return res.status(400).json({ message: "Enter a valid amount" });

  const r = await prisma.reservation.findUnique({ where: { id } });
  if (!r) return res.status(404).json({ message: "Reservation not found" });

  await prisma.reservationPayment.create({
    data: {
      reservationId: id,
      amount,
      description: req.body.description?.trim() || `Payment for reservation ${r.reservationNumber}`,
    },
  });
  const full = await prisma.reservation.findUnique({ where: { id }, include });
  res.status(201).json(shape(full));
});

const setStatus = (status: ReservationStatus) => async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const r = await prisma.reservation.findUnique({ where: { id } });
  if (!r) return res.status(404).json({ message: "Reservation not found" });
  if (r.status !== "CONFIRMED") return res.status(409).json({ message: "Only confirmed reservations can be changed" });
  const updated = await prisma.reservation.update({ where: { id }, data: { status }, include });
  res.json(shape(updated));
};
reservationsRouter.post("/:id/cancel", setStatus("CANCELLED"));
reservationsRouter.post("/:id/no-show", setStatus("NO_SHOW"));

// app.use("/api/reservations", requireAuth, reservationsRouter);
