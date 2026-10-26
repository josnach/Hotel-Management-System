import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { config, whatsappConfigured } from '../config';
import { asyncHandler, HttpError, page, parse } from '../lib/http';
import { audit } from '../lib/audit';
import { D, prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';
import { buildDigestParams } from '../messaging/digest';
import { enqueue } from '../messaging/outbox';
import { samePhone, toWaNumber } from '../messaging/phone';
import { validWebhookSignature, verifyFolioToken } from '../messaging/signing';
import { renderFolioInvoice, renderPaymentReceipt } from '../pdf/folioPdf';

const manage = requireRole('MANAGER'); // ADMIN always passes

// ───────────── Admin API (mounted under /api/messaging, behind login) ─────────────
export const messagingRouter = Router();

messagingRouter.get('/status', manage, asyncHandler(async (_q, res) => {
  const [queued, failed, sentToday] = await Promise.all([
    prisma.messageOutbox.count({ where: { status: { in: ['QUEUED', 'SENDING'] } } }),
    prisma.messageOutbox.count({ where: { status: 'FAILED' } }),
    prisma.messageOutbox.count({ where: { status: { in: ['SENT', 'DELIVERED', 'READ'] }, createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
  ]);
  res.json({ configured: whatsappConfigured(), webhookReady: !!(config.whatsapp.verifyToken && config.whatsapp.appSecret), queued, failed, sentLast24h: sentToday });
}));

messagingRouter.get('/messages', manage, asyncHandler(async (req, res) => {
  const { skip, take } = page(req.query, 25);
  const status = String(req.query.status ?? '');
  const where: Prisma.MessageOutboxWhereInput = ['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED'].includes(status) ? { status: status as any } : {};
  const [rows, total] = await Promise.all([
    prisma.messageOutbox.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.messageOutbox.count({ where }),
  ]);
  res.json({ rows, total });
}));

messagingRouter.post('/messages/:id/retry', manage, asyncHandler(async (req, res) => {
  const m = await prisma.messageOutbox.findUnique({ where: { id: req.params.id } });
  if (!m) throw new HttpError(404, 'Message not found');
  if (m.status !== 'FAILED') throw new HttpError(409, 'Only failed messages can be retried');
  await prisma.messageOutbox.update({ where: { id: m.id }, data: { status: 'QUEUED', attempts: 0, error: null, nextAttemptAt: new Date() } });
  await audit(prisma, { userId: req.user!.id, action: 'MESSAGE_RETRY', entity: 'MessageOutbox', entityId: m.id, meta: { template: m.template } });
  res.json({ ok: true });
}));

const ownerBody = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(7).max(20),
  active: z.boolean().default(true),
  digestHour: z.coerce.number().int().min(0).max(23).default(21),
});
const ownerPhoneOk = (phone: string) => { if (!toWaNumber(phone)) throw new HttpError(400, 'Enter a valid phone number (use +country code for non-Nigerian numbers)'); };

messagingRouter.get('/owners', manage, asyncHandler(async (_q, res) => res.json(await prisma.ownerRecipient.findMany({ orderBy: { createdAt: 'asc' } }))));
messagingRouter.post('/owners', manage, asyncHandler(async (req, res) => {
  const b = parse(ownerBody, req.body); ownerPhoneOk(b.phone);
  const o = await prisma.ownerRecipient.create({ data: b });
  await audit(prisma, { userId: req.user!.id, action: 'OWNER_RECIPIENT_ADD', entity: 'OwnerRecipient', entityId: o.id, meta: { name: o.name, digestHour: o.digestHour } });
  res.status(201).json(o);
}));
messagingRouter.put('/owners/:id', manage, asyncHandler(async (req, res) => {
  const b = parse(ownerBody.partial(), req.body); if (b.phone) ownerPhoneOk(b.phone);
  const o = await prisma.ownerRecipient.update({ where: { id: req.params.id }, data: b });
  await audit(prisma, { userId: req.user!.id, action: 'OWNER_RECIPIENT_EDIT', entity: 'OwnerRecipient', entityId: o.id, meta: b as Prisma.InputJsonValue });
  res.json(o);
}));
messagingRouter.delete('/owners/:id', manage, asyncHandler(async (req, res) => {
  await prisma.ownerRecipient.delete({ where: { id: req.params.id } });
  await audit(prisma, { userId: req.user!.id, action: 'OWNER_RECIPIENT_REMOVE', entity: 'OwnerRecipient', entityId: req.params.id });
  res.status(204).end();
}));

/** Queue today's digest to one recipient right now (to check the template works end to end). */
messagingRouter.post('/owners/:id/test-digest', manage, asyncHandler(async (req, res) => {
  const o = await prisma.ownerRecipient.findUnique({ where: { id: req.params.id } });
  if (!o) throw new HttpError(404, 'Recipient not found');
  const params = await buildDigestParams();
  const queued = await enqueue({ dedupeKey: `owner-digest-test:${o.id}:${Date.now()}`, phone: o.phone, template: 'owner_daily_digest', params: [o.name.split(' ')[0], ...params] });
  res.json({ queued, preview: params });
}));

// ───────────── Meta webhook (mounted BEFORE express.json: the signature needs the raw body) ─────────────
export const webhookRouter = Router();

webhookRouter.get('/', (req, res) => {
  const given = String(req.query['hub.verify_token'] ?? ''), want = config.whatsapp.verifyToken;
  const ok = !!want && given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
  if (req.query['hub.mode'] === 'subscribe' && ok) return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
  res.sendStatus(403);
});

const RANK: Record<string, number> = { QUEUED: 0, SENDING: 0, SENT: 1, DELIVERED: 2, READ: 3 };
const STOP = /^\s*(stop|unsubscribe|opt[\s-]?out)\s*[.!]?\s*$/i;
const START = /^\s*(start|subscribe)\s*[.!]?\s*$/i;

async function setConsent(from: string, optIn: boolean) {
  const tail = from.slice(-4);
  const cands = await prisma.guest.findMany({ where: { phone: { contains: tail } }, select: { id: true, phone: true } });
  const ids = cands.filter((g) => samePhone(g.phone, from)).map((g) => g.id);
  if (!ids.length) return;
  await prisma.guest.updateMany({ where: { id: { in: ids } }, data: optIn ? { whatsappOptIn: true, whatsappOptInAt: new Date(), whatsappOptOutAt: null } : { whatsappOptIn: false, whatsappOptOutAt: new Date() } });
  if (!optIn) await prisma.messageOutbox.updateMany({ where: { guestId: { in: ids }, status: 'QUEUED' }, data: { status: 'SKIPPED', error: 'Guest replied STOP' } });
}

async function handleWebhook(body: any) {
  for (const change of (body?.entry ?? []).flatMap((e: any) => e.changes ?? [])) {
    for (const s of change.value?.statuses ?? []) {
      const m = await prisma.messageOutbox.findUnique({ where: { providerMsgId: s.id } });
      if (!m) continue;
      if (s.status === 'failed') {
        await prisma.messageOutbox.update({ where: { id: m.id }, data: { status: 'FAILED', error: String(s.errors?.[0]?.title ?? s.errors?.[0]?.message ?? 'Delivery failed').slice(0, 500) } });
      } else {
        const next = s.status === 'delivered' ? 'DELIVERED' : s.status === 'read' ? 'READ' : null;
        // Status callbacks can arrive out of order (read before delivered): never move backwards.
        if (next && (RANK[next] ?? 0) > (RANK[m.status] ?? 0)) await prisma.messageOutbox.update({ where: { id: m.id }, data: { status: next } });
      }
    }
    for (const msg of change.value?.messages ?? []) {
      if (msg.type !== 'text' || !msg.from) continue;
      const text = String(msg.text?.body ?? '');
      if (STOP.test(text)) await setConsent(msg.from, false);
      else if (START.test(text)) await setConsent(msg.from, true);
    }
  }
}

webhookRouter.post('/', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  if (!config.whatsapp.appSecret) return res.sendStatus(503); // never accept unsigned webhooks
  if (!Buffer.isBuffer(req.body) || !validWebhookSignature(req.body, req.header('x-hub-signature-256'), config.whatsapp.appSecret)) return res.sendStatus(401);
  res.sendStatus(200); // acknowledge fast; Meta retries if we are slow
  let body: unknown;
  try { body = JSON.parse(req.body.toString('utf8')); } catch { return; }
  handleWebhook(body).catch((e) => console.error('WhatsApp webhook processing failed', e));
});

// ───────────── Public signed folio page (mounted at /p, no login; the token is the credential) ─────────────
export const publicRouter = Router();
publicRouter.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (v: unknown) => '₦' + Number(v ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (d: Date) => d.toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: config.hotelTz });

publicRouter.get('/folio/:token', asyncHandler(async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  const id = verifyFolioToken(req.params.token);
  const f = id ? await prisma.folio.findUnique({ where: { id }, include: { guest: true, stay: { include: { room: true } }, txs: { orderBy: { createdAt: 'asc' } } } }) : null;
  if (!f) return res.status(404).type('html').send('<p style="font-family:sans-serif;padding:2rem">This link is invalid or has expired. Please ask the front desk for a copy of your folio.</p>');
  let bal = D(0);
  const rows = f.txs.map((t) => { bal = bal.plus(t.bill).minus(t.payment); return `<tr><td>${esc(when(t.createdAt))}</td><td>${esc(t.description)}</td><td class="n">${Number(t.bill) ? money(t.bill) : ''}</td><td class="n">${Number(t.payment) ? money(t.payment) : ''}</td><td class="n">${money(bal)}</td></tr>`; }).join('');
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Folio ${esc(f.folioNo)}</title>
<style>body{font:14px system-ui,sans-serif;max-width:760px;margin:1.5rem auto;padding:0 1rem;color:#111}h1{font-size:1.25rem;margin:0}table{width:100%;border-collapse:collapse;margin-top:1rem}th,td{padding:.4rem .5rem;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}th{background:#f6f6f6}.n{text-align:right;white-space:nowrap}.tot{font-weight:700;font-size:1.05rem;margin-top:1rem;text-align:right}.hint{color:#666;font-size:.8rem;margin-top:1.5rem}@media print{.hint{display:none}}</style></head><body>
<h1>${esc(config.hotelName)}</h1><p>Folio <b>${esc(f.folioNo)}</b>${f.stay ? ` · Room ${esc(f.stay.room.number)}` : ''}<br>${esc(f.guest ? `${f.guest.firstName} ${f.guest.lastName}` : '')}</p>
<table><thead><tr><th>Date</th><th>Description</th><th class="n">Charge</th><th class="n">Paid</th><th class="n">Balance</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot">Balance due: ${money(bal)}</div><p class="hint"><a href="/p/folio/${esc(req.params.token)}/pdf">Download PDF</a></p></body></html>`);
}));

const pdfNotFound = (res: express.Response) => res.status(404).type('html').send('<p style="font-family:sans-serif;padding:2rem">This link is invalid or has expired. Please ask the front desk for a copy.</p>');
const sendPublicPdf = (res: express.Response, f: { buffer: Buffer; filename: string }) => {
  res.set({ 'Content-Type': 'application/pdf', 'Content-Length': String(f.buffer.length), 'Content-Disposition': `inline; filename="${f.filename}"`, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  res.end(f.buffer);
};
publicRouter.get('/folio/:token/pdf', asyncHandler(async (req, res) => {
  const id = verifyFolioToken(req.params.token);
  if (!id) return pdfNotFound(res);
  sendPublicPdf(res, await renderFolioInvoice(id));
}));
publicRouter.get('/folio/:token/receipt/:txId', asyncHandler(async (req, res) => {
  const id = verifyFolioToken(req.params.token);
  if (!id) return pdfNotFound(res);
  sendPublicPdf(res, await renderPaymentReceipt(id, req.params.txId)); // 404 if that payment is not on THIS folio
}));
