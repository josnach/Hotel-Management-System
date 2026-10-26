import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { config } from '../config';
import { HttpError } from '../lib/http';
import { D, prisma } from '../lib/prisma';

const useCustomFont = () => !!config.pdfFontPath && fs.existsSync(config.pdfFontPath);
const sym = () => (useCustomFont() ? '₦' : 'NGN ');
const money = (v: unknown) => sym() + Number(v ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (d: Date) => d.toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: config.hotelTz });
const day = (d: Date) => d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: config.hotelTz });

const INK = '#111827', MUTED = '#6b7280', LINE = '#e5e7eb', BRAND = '#1e3a8a';

function newDoc(size: 'A4' | 'A5') {
  const doc = new PDFDocument({ size, margin: 40, info: { Title: `${config.hotelName} document`, Author: config.hotelName } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  let regular = 'Helvetica', bold = 'Helvetica-Bold';
  if (useCustomFont()) {
    doc.registerFont('Custom', config.pdfFontPath); regular = 'Custom'; bold = 'Custom';
    if (config.pdfBoldFontPath && fs.existsSync(config.pdfBoldFontPath)) { doc.registerFont('CustomBold', config.pdfBoldFontPath); bold = 'CustomBold'; }
  }
  return { doc, done, regular, bold };
}

function letterhead(doc: PDFKit.PDFDocument, f: { regular: string; bold: string }, title: string, right: string[]) {
  const w = doc.page.width - 80;
  doc.font(f.bold).fontSize(18).fillColor(BRAND).text(config.hotelName, 40, 40, { width: w * 0.6 });
  doc.font(f.regular).fontSize(8.5).fillColor(MUTED);
  const contact = [config.hotelAddress, config.hotelPhone, config.hotelEmail].filter(Boolean).join('  •  ');
  if (contact) doc.text(contact, 40, doc.y + 2, { width: w * 0.6 });
  doc.font(f.bold).fontSize(16).fillColor(INK).text(title, 40 + w * 0.55, 40, { width: w * 0.45, align: 'right' });
  doc.font(f.regular).fontSize(9).fillColor(MUTED);
  for (const line of right) doc.text(line, 40 + w * 0.55, doc.y, { width: w * 0.45, align: 'right' });
  const y = Math.max(doc.y, 90) + 8;
  doc.moveTo(40, y).lineTo(40 + w, y).strokeColor(BRAND).lineWidth(1.5).stroke();
  doc.y = y + 12; doc.x = 40;
}

async function loadFolio(folioId: string) {
  const f = await prisma.folio.findUnique({ where: { id: folioId }, include: { guest: true, group: true, stay: { include: { room: true } }, txs: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } });
  if (!f) throw new HttpError(404, 'Folio not found');
  return f;
}
export const billedTo = (f: { guest: { firstName: string; lastName: string } | null; group: { name: string } | null }) =>
  (f.guest ? `${f.guest.firstName} ${f.guest.lastName}` : f.group?.name ?? 'Guest');

/** Full guest folio as an invoice/statement PDF. */
export async function renderFolioInvoice(folioId: string): Promise<{ buffer: Buffer; filename: string }> {
  const f = await loadFolio(folioId);
  const { doc, done, regular, bold } = newDoc('A4');
  const fonts = { regular, bold };

  let running = D(0), totalBill = D(0), totalPaid = D(0);
  const rows = f.txs.map((t) => {
    running = running.plus(t.bill).minus(t.payment); totalBill = totalBill.plus(t.bill); totalPaid = totalPaid.plus(t.payment);
    return { t, bal: running };
  });
  const balance = running;

  letterhead(doc, fonts, balance.lte(0) ? 'INVOICE / RECEIPT' : 'INVOICE', [`Folio ${f.folioNo}`, `Issued ${when(new Date())}`]);

  doc.font(bold).fontSize(9).fillColor(MUTED).text('BILLED TO', 40, doc.y);
  doc.font(bold).fontSize(12).fillColor(INK).text(billedTo(f));
  doc.font(regular).fontSize(9).fillColor(MUTED);
  if (f.guest?.phone) doc.text(f.guest.phone);
  if (f.guest?.email) doc.text(f.guest.email);
  const meta = [
    f.stay ? `Room ${f.stay.room.number}` : null,
    f.stay?.checkInAt ? `Check-in ${day(f.stay.checkInAt)}` : null,
    f.stay?.checkOutAt ? `Check-out ${day(f.stay.checkOutAt)}` : null,
    `Status ${f.status.replace('_', ' ').toLowerCase()}`,
  ].filter(Boolean).join('   •   ');
  doc.moveDown(0.4).text(meta);
  doc.moveDown(0.8);

  const cols = [{ x: 40, w: 92, label: 'Date' }, { x: 132, w: 195, label: 'Description' }, { x: 327, w: 70, label: 'Charge', right: true }, { x: 397, w: 70, label: 'Paid', right: true }, { x: 467, w: 88, label: 'Balance', right: true }];
  const header = () => {
    const y = doc.y;
    doc.rect(40, y - 3, 515, 18).fill('#f3f4f6');
    doc.font(bold).fontSize(8.5).fillColor(INK);
    for (const c of cols) doc.text(c.label, c.x + 3, y + 1, { width: c.w - 6, align: c.right ? 'right' : 'left' });
    doc.y = y + 20;
  };
  header();
  doc.font(regular).fontSize(8.5);
  for (const { t, bal } of rows) {
    const descH = doc.heightOfString(t.description, { width: cols[1].w - 6 });
    const h = Math.max(14, descH + 4);
    if (doc.y + h > doc.page.height - 120) { doc.addPage(); doc.y = 40; header(); doc.font(regular).fontSize(8.5); }
    const y = doc.y;
    doc.fillColor(MUTED).text(when(t.createdAt), cols[0].x + 3, y, { width: cols[0].w - 6 });
    doc.fillColor(INK).text(t.description, cols[1].x + 3, y, { width: cols[1].w - 6 });
    doc.fillColor(INK).text(Number(t.bill) ? money(t.bill) : '', cols[2].x + 3, y, { width: cols[2].w - 6, align: 'right' });
    doc.fillColor('#047857').text(Number(t.payment) ? money(t.payment) : '', cols[3].x + 3, y, { width: cols[3].w - 6, align: 'right' });
    doc.fillColor(INK).text(money(bal), cols[4].x + 3, y, { width: cols[4].w - 6, align: 'right' });
    doc.moveTo(40, y + h - 1).lineTo(555, y + h - 1).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.y = y + h;
  }

  if (doc.y > doc.page.height - 130) { doc.addPage(); doc.y = 40; }
  doc.moveDown(0.8);
  const tx = 327, tw = 228;
  const line = (label: string, value: string, strong = false, color = INK) => {
    const y = doc.y;
    doc.font(strong ? bold : regular).fontSize(strong ? 11 : 9.5).fillColor(color);
    doc.text(label, tx, y, { width: tw - 100 });
    doc.text(value, tx + tw - 110, y, { width: 110, align: 'right' });
    doc.y = y + (strong ? 18 : 14);
  };
  line('Total charges', money(totalBill));
  line('Total payments', money(totalPaid));
  doc.moveTo(tx, doc.y).lineTo(tx + tw, doc.y).strokeColor(INK).lineWidth(0.8).stroke(); doc.y += 4;
  line(balance.lte(0) ? 'Balance (fully paid)' : 'Balance due', money(balance.lt(0) ? 0 : balance), true, balance.lte(0) ? '#047857' : '#b91c1c');
  if (balance.lt(0)) line('Credit on account', money(balance.abs()), false, MUTED);

  doc.font(regular).fontSize(8).fillColor(MUTED).text(`Thank you for staying with ${config.hotelName}.  This document was generated electronically and is valid without a signature.`, 40, doc.page.height - 60, { width: 515, align: 'center' });
  doc.end();
  return { buffer: await done, filename: `Folio-${f.folioNo}.pdf` };
}

/** Receipt for ONE payment on a folio (A5). */
export async function renderPaymentReceipt(folioId: string, txId: string): Promise<{ buffer: Buffer; filename: string; receiptNo: string; amount: string }> {
  const f = await loadFolio(folioId);
  const idx = f.txs.findIndex((t) => t.id === txId);
  const tx = f.txs[idx];
  if (!tx || !Number(tx.payment)) throw new HttpError(404, 'Payment not found on this folio');
  const balanceAfter = f.txs.slice(0, idx + 1).reduce((a, t) => a.plus(t.bill).minus(t.payment), D(0));
  const receiptNo = `RCT-${f.folioNo}-${tx.id.slice(-5).toUpperCase()}`;

  const { doc, done, regular, bold } = newDoc('A5');
  letterhead(doc, { regular, bold }, 'PAYMENT RECEIPT', [`No. ${receiptNo}`, when(tx.createdAt)]);
  const w = doc.page.width - 80;
  const row = (label: string, value: string) => {
    const y = doc.y;
    doc.font(regular).fontSize(9.5).fillColor(MUTED).text(label, 40, y, { width: w * 0.4 });
    doc.font(bold).fontSize(9.5).fillColor(INK).text(value, 40 + w * 0.4, y, { width: w * 0.6, align: 'right' });
    doc.y = y + 17;
    doc.moveTo(40, doc.y - 3).lineTo(40 + w, doc.y - 3).strokeColor(LINE).lineWidth(0.5).stroke();
  };
  row('Received from', billedTo(f));
  if (f.stay) row('Room', f.stay.room.number);
  row('Folio', f.folioNo);
  row('Payment method', tx.method ?? 'CASH');
  row('Description', tx.description);
  doc.moveDown(0.8);
  const y0 = doc.y;
  doc.roundedRect(40, y0, w, 46, 6).fillAndStroke('#ecfdf5', '#a7f3d0');
  doc.font(regular).fontSize(8.5).fillColor('#047857').text('AMOUNT RECEIVED', 52, y0 + 8, { width: w - 24 });
  doc.font(bold).fontSize(18).fillColor('#047857').text(money(tx.payment), 52, y0 + 20, { width: w - 24 });
  doc.x = 40; doc.y = y0 + 58;
  row('Balance on folio after this payment', money(balanceAfter.lt(0) ? 0 : balanceAfter));
  doc.font(regular).fontSize(8).fillColor(MUTED).text('Thank you. This receipt was generated electronically and is valid without a signature.', 40, doc.page.height - 50, { width: w, align: 'center' });
  doc.end();
  return { buffer: await done, filename: `Receipt-${receiptNo}.pdf`, receiptNo, amount: money(tx.payment) };
}