import { config, mailConfigured, smsConfigured, whatsappConfigured } from '../config';
import { HttpError } from '../lib/http';
import { D, prisma } from '../lib/prisma';
import { enqueue } from '../messaging/outbox';
import { toWaNumber } from '../messaging/phone';
import { signFolioToken } from '../messaging/signing';
import { billedTo, renderFolioInvoice, renderPaymentReceipt } from '../pdf/folioPdf';
import { sendEmail } from './mail';
import { sendSms } from './sms';

export type Channel = 'EMAIL' | 'WHATSAPP' | 'SMS';
export interface Target { channel: Channel; to: string }
export interface SendInput { folioId: string; kind: 'INVOICE' | 'RECEIPT'; txId?: string; targets: Target[]; userId?: string }
export interface SendResult { channel: Channel; to: string; status: 'QUEUED' | 'SENT' | 'FAILED'; error?: string }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const naira = (n: unknown) => 'NGN ' + Number(n ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Public, expiring link to the PDF (same signed token the WhatsApp page uses; 7 days). */
export function pdfLink(folioId: string, txId?: string, ttlHours = 168) {
  const t = signFolioToken(folioId, ttlHours);
  return txId ? `${config.publicApiUrl}/p/folio/${t}/receipt/${txId}` : `${config.publicApiUrl}/p/folio/${t}/pdf`;
}

/** What the "Send" dialog needs: prefilled recipients and which channels are configured. */
export async function deliveryOptions(folioId: string) {
  const f = await prisma.folio.findUnique({ where: { id: folioId }, include: { guest: true } });
  if (!f) throw new HttpError(404, 'Folio not found');
  return {
    email: f.guest?.email ?? '', phone: f.guest?.phone ?? '', whatsappOptIn: !!f.guest?.whatsappOptIn,
    available: { EMAIL: mailConfigured(), WHATSAPP: whatsappConfigured(), SMS: smsConfigured() },
  };
}

export async function sendFolioDocument(i: SendInput): Promise<SendResult[]> {
  const f = await prisma.folio.findUnique({ where: { id: i.folioId }, include: { guest: true, group: true, stay: { include: { room: true } } } });
  if (!f) throw new HttpError(404, 'Folio not found');
  const bal = await prisma.folioTransaction.aggregate({ where: { folioId: f.id }, _sum: { bill: true, payment: true } });
  const balance = D(bal._sum.bill ?? 0).minus(D(bal._sum.payment ?? 0));
  const name = billedTo(f);
  const first = f.guest?.firstName ?? name;
  const isReceipt = i.kind === 'RECEIPT';
  if (isReceipt && !i.txId) throw new HttpError(400, 'Choose which payment the receipt is for');
  type Pdf = { buffer: Buffer; filename: string; receiptNo?: string; amount?: string };
  let pdf: Pdf | null = null;
  const getPdf = async (): Promise<Pdf> => (pdf ??= isReceipt ? await renderPaymentReceipt(f.id, i.txId!) : await renderFolioInvoice(f.id));
  const link = pdfLink(f.id, isReceipt ? i.txId : undefined);
  if (isReceipt) await getPdf();

  const results: SendResult[] = [];
  const seen = new Set<string>();
  for (const t of i.targets) {
    const key = `${t.channel}:${t.to.trim().toLowerCase()}`;
    if (seen.has(key)) continue; seen.add(key);
    let status: SendResult['status'] = 'FAILED', error: string | undefined, providerRef: string | undefined, recipient = t.to.trim();
    try {
      if (t.channel === 'EMAIL') {
        const p = await getPdf();
        const subject = isReceipt ? `Your payment receipt ${p.receiptNo} - ${config.hotelName}` : `Your folio ${f.folioNo} - ${config.hotelName}`;
        const text = `Dear ${first},\n\n${isReceipt ? `Thank you for your payment of ${p.amount}. Your receipt is attached.` : `Your folio ${f.folioNo} is attached. Balance: ${naira(balance.lt(0) ? 0 : balance)}.`}\n\nYou can also download it here (link valid for 7 days):\n${link}\n\n${config.hotelName}`;
        const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;color:#111"><p>Dear ${esc(first)},</p><p>${isReceipt ? `Thank you for your payment of <b>${esc(p.amount)}</b>. Your receipt is attached.` : `Your folio <b>${esc(f.folioNo)}</b> is attached. Balance: <b>${esc(naira(balance.lt(0) ? 0 : balance))}</b>.`}</p><p><a href="${esc(link)}">Download PDF</a> (link valid for 7 days)</p><p>${esc(config.hotelName)}</p></div>`;
        const r = await sendEmail({ to: recipient, subject, text, html, attachments: [{ filename: p.filename, content: p.buffer, contentType: 'application/pdf' }] });
        status = 'SENT'; providerRef = r.id;
      } else if (t.channel === 'SMS') {
        const to = toWaNumber(recipient);
        if (!to) throw new Error('Enter a valid phone number');
        recipient = to;
        const body = isReceipt ? `${config.hotelName}: payment received. Receipt: ${link}` : `${config.hotelName}: folio ${f.folioNo}, balance ${naira(balance.lt(0) ? 0 : balance)}. PDF: ${link}`;
        const r = await sendSms(to, body);
        status = 'SENT'; providerRef = r.id;
      } else {
        const to = toWaNumber(recipient);
        if (!to) throw new Error('Enter a valid phone number');
        recipient = to;
        if (!whatsappConfigured()) throw new Error('WhatsApp is not configured');
        if (!f.guest?.whatsappOptIn) throw new Error('This guest has not opted in to WhatsApp messages');
        const dedupeKey = `folio-manual:${f.id}:${i.txId ?? 'all'}:${to}:${Date.now()}`;
        const queued = await enqueue({ dedupeKey, phone: to, template: 'folio_receipt', guestId: f.guestId ?? undefined, params: [first, config.hotelName, naira(bal._sum.bill), link] });
        if (!queued) throw new Error('Could not queue the WhatsApp message');
        status = 'QUEUED'; providerRef = dedupeKey;
      }
    } catch (e) { error = (e instanceof Error ? e.message : String(e)).slice(0, 300); }
    await prisma.folioDelivery.create({ data: { folioId: f.id, txId: i.txId, kind: i.kind, channel: t.channel, recipient, status, error, providerRef, sentById: i.userId } });
    results.push({ channel: t.channel, to: recipient, status, error });
  }
  return results;
}

/** History for the folio screen. WhatsApp rows show the outbox's live status. */
export async function listDeliveries(folioId: string) {
  const rows = await prisma.folioDelivery.findMany({ where: { folioId }, orderBy: { createdAt: 'desc' }, take: 50, include: { sentBy: { select: { username: true } } } });
  const keys = rows.filter((r) => r.channel === 'WHATSAPP' && r.providerRef).map((r) => r.providerRef!);
  const outbox = keys.length ? await prisma.messageOutbox.findMany({ where: { dedupeKey: { in: keys } }, select: { dedupeKey: true, status: true, error: true } }) : [];
  const byKey = new Map(outbox.map((o) => [o.dedupeKey, o]));
  return rows.map((r) => {
    const o = r.providerRef ? byKey.get(r.providerRef) : undefined;
    return { id: r.id, kind: r.kind, txId: r.txId, channel: r.channel, recipient: r.recipient, createdAt: r.createdAt, sentBy: r.sentBy?.username ?? null, status: o?.status ?? r.status, error: o?.error ?? r.error };
  });
}

/** After check-out when AUTO_EMAIL_FOLIO=true. Never throws. */
export async function emailFolioAtCheckout(stayId: string) {
  try {
    if (!config.autoEmailFolio || !mailConfigured()) return;
    const s = await prisma.stay.findUnique({ where: { id: stayId }, include: { guest: true, folio: true } });
    if (!s?.folio || !s.guest.email) return;
    const already = await prisma.folioDelivery.findFirst({ where: { folioId: s.folio.id, channel: 'EMAIL', kind: 'INVOICE', status: 'SENT' } });
    if (already) return;
    await sendFolioDocument({ folioId: s.folio.id, kind: 'INVOICE', targets: [{ channel: 'EMAIL', to: s.guest.email }] });
  } catch (e) { console.error('emailFolioAtCheckout failed', e); }
}