import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { config } from '../config';
import { HttpError } from '../lib/http';
import { prisma } from '../lib/prisma';
import { METHOD_LABEL, slipView, SlipView } from '../services/payrollView';

const useCustomFont = () => !!config.pdfFontPath && fs.existsSync(config.pdfFontPath);
const money = (v: number) =>
  (useCustomFont() ? '₦' : 'NGN ') + v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Pay dates are date-only values, so they are shown in UTC to avoid slipping a day.
const day = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
const when = (d: Date) =>
  d.toLocaleString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: config.hotelTz });

const INK = '#111827', MUTED = '#6b7280', LINE = '#e5e7eb', GREEN = '#047857', RED = '#b91c1c';

interface Fonts { regular: string; bold: string }
interface PeriodInfo { name: string; startDate: Date; endDate: Date; paymentDate: Date | null }

function newDoc() {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `${config.hotelName} payslip`, Author: config.hotelName } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  let regular = 'Helvetica', bold = 'Helvetica-Bold';
  if (useCustomFont()) {
    doc.registerFont('Custom', config.pdfFontPath);
    regular = 'Custom'; bold = 'Custom';
    if (config.pdfBoldFontPath && fs.existsSync(config.pdfBoldFontPath)) {
      doc.registerFont('CustomBold', config.pdfBoldFontPath);
      bold = 'CustomBold';
    }
  }
  return { doc, done, fonts: { regular, bold } as Fonts };
}

function drawSlip(doc: PDFKit.PDFDocument, f: Fonts, v: SlipView, p: PeriodInfo, by: string) {
  const L = 40, W = doc.page.width - 80;
  let y = 40;

  // Header band
  doc.rect(L, y, W, 66).fill('#111827');
  doc.fillColor('#ffffff').font(f.bold).fontSize(20).text('PAYSLIP', L + 16, y + 12, { lineBreak: false });
  doc.font(f.regular).fontSize(9).text(`Payroll Period: ${p.name}`, L + 16, y + 42, { lineBreak: false });
  const rw = W * 0.5, rx = L + W - rw - 16;
  doc.font(f.bold).fontSize(13).text(config.hotelName, rx, y + 12, { width: rw, align: 'right', lineBreak: false });
  doc.font(f.regular).fontSize(8.5);
  let ry = y + 30;
  if (config.hotelAddress) { doc.text(config.hotelAddress, rx, ry, { width: rw, align: 'right', lineBreak: false }); ry += 12; }
  if (config.hotelPhone) doc.text(`Tel: ${config.hotelPhone}`, rx, ry, { width: rw, align: 'right', lineBreak: false });
  y += 66 + 18;

  // Employee details
  const info: [string, string][] = [
    ['Employee Name', v.name], ['Employee ID', v.staffId || '—'], ['Department', v.department || '—'],
    ['Position', v.position || '—'], ['Pay Period', `${day(p.startDate)} - ${day(p.endDate)}`], ['Payment Date', day(p.paymentDate)],
  ];
  info.forEach(([k, val], i) => {
    const x = L + (i % 3) * (W / 3), yy = y + Math.floor(i / 3) * 38;
    doc.font(f.regular).fontSize(8.5).fillColor(MUTED).text(k, x, yy, { width: W / 3 - 8, lineBreak: false });
    doc.font(f.bold).fontSize(10.5).fillColor(INK).text(val, x, yy + 12, { width: W / 3 - 8, lineBreak: false });
  });
  y += 84;
  doc.moveTo(L, y).lineTo(L + W, y).strokeColor(LINE).lineWidth(0.8).stroke();
  y += 14;

  // Earnings and deductions
  const colW = W / 2 - 14, xL = L, xR = L + W / 2 + 14;
  doc.font(f.bold).fontSize(12).fillColor(INK).text('Earnings', xL, y, { lineBreak: false });
  doc.text('Deductions', xR, y, { lineBreak: false });
  y += 22;

  const earn: [string, number][] = [
    ['Basic Salary', v.basic], ['Meal Allowance', v.meal], ['Transport Allowance', v.transport], ['Housing Allowance', v.housing],
    ['Other Allowances', v.otherAllow], ['Overtime', v.overtime], ['Bonus', v.bonus],
  ];
  const ded: [string, number][] = [
    ['PAYE Tax', v.paye], ['Pension (Employee)', v.pensionEmployee], ['NHF', v.nhf],
    ['Other Deductions', v.otherDeductions], ['Complimentary Excess', v.compExcess],
  ];
  const rows = (x: number, list: [string, number][], keep: string[]) => {
    let yy = y;
    for (const [label, amount] of list) {
      if (amount <= 0 && !keep.includes(label)) continue;
      doc.font(f.regular).fontSize(9.5).fillColor(MUTED).text(label, x, yy, { width: colW - 90, lineBreak: false });
      doc.font(f.bold).fontSize(9.5).fillColor(INK).text(money(amount), x + colW - 100, yy, { width: 100, align: 'right', lineBreak: false });
      yy += 18;
    }
    return yy;
  };
  const eEnd = rows(xL, earn, ['Basic Salary']);
  const dEnd = rows(xR, ded, ['PAYE Tax', 'Pension (Employee)']);
  y = Math.max(eEnd, dEnd) + 4;

  doc.moveTo(xL, y).lineTo(xL + colW, y).moveTo(xR, y).lineTo(xR + colW, y).strokeColor(LINE).lineWidth(0.6).stroke();
  y += 8;
  doc.font(f.bold).fontSize(10.5).fillColor(INK).text('Total Earnings', xL, y, { lineBreak: false });
  doc.fillColor(GREEN).text(money(v.gross), xL + colW - 110, y, { width: 110, align: 'right', lineBreak: false });
  doc.fillColor(INK).text('Total Deductions', xR, y, { lineBreak: false });
  doc.fillColor(RED).text(money(v.deductions), xR + colW - 110, y, { width: 110, align: 'right', lineBreak: false });
  y += 30;

  // Net pay band
  doc.rect(L, y, W, 54).fill('#f9fafb');
  doc.fillColor(INK).font(f.bold).fontSize(13).text('Net Pay', L + 14, y + 10, { lineBreak: false });
  doc.font(f.regular).fontSize(8.5).fillColor(MUTED).text('Amount payable to employee', L + 14, y + 30, { lineBreak: false });
  doc.font(f.bold).fontSize(20).fillColor(GREEN).text(money(v.net), L + W - 214, y + 8, { width: 200, align: 'right', lineBreak: false });
  doc.font(f.regular).fontSize(8.5).fillColor(MUTED).text(METHOD_LABEL[v.paymentMethod] ?? v.paymentMethod, L + W - 214, y + 34, { width: 200, align: 'right', lineBreak: false });
  y += 74;

  // Payment information
  doc.font(f.bold).fontSize(12).fillColor(INK).text('Payment Information', L, y, { lineBreak: false });
  y += 22;
  const pay: [string, string][] = [
    ['Payment Method', METHOD_LABEL[v.paymentMethod] ?? v.paymentMethod], ['Bank', v.bankName || '—'], ['Account Number', v.accountNumber || '—'],
  ];
  pay.forEach(([k, val], i) => {
    const x = L + i * (W / 3);
    doc.font(f.regular).fontSize(8.5).fillColor(MUTED).text(k, x, y, { width: W / 3 - 8, lineBreak: false });
    doc.font(f.bold).fontSize(10.5).fillColor(INK).text(val, x, y + 12, { width: W / 3 - 8, lineBreak: false });
  });

  // Footer
  doc.font(f.regular).fontSize(8).fillColor(MUTED).text(
    `This is a computer-generated document. No signature is required.  Generated on ${when(new Date())} by ${by}.`,
    L, doc.page.height - 60, { width: W, align: 'center', lineBreak: true },
  );
}

const periodInfo = (p: { name: string; startDate: Date; endDate: Date; paymentDate: Date | null }): PeriodInfo => ({
  name: p.name, startDate: p.startDate, endDate: p.endDate, paymentDate: p.paymentDate,
});

/** One employee's payslip. */
export async function renderPayslip(slipId: string, by: string): Promise<{ buffer: Buffer; filename: string }> {
  const s = await prisma.payslip.findUnique({ where: { id: slipId }, include: { employee: true, period: true } });
  if (!s) throw new HttpError(404, 'Payslip not found');
  const { doc, done, fonts } = newDoc();
  drawSlip(doc, fonts, slipView(s, s.period.status), periodInfo(s.period), by);
  doc.end();
  const safe = s.employee.fullName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return { buffer: await done, filename: `Payslip-${s.period.name}-${safe}.pdf` };
}

/** Every payslip in a payroll, one per page. */
export async function renderPeriodPayslips(periodId: string, by: string): Promise<{ buffer: Buffer; filename: string }> {
  const p = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { payslips: { include: { employee: true }, orderBy: { employee: { fullName: 'asc' } } } },
  });
  if (!p) throw new HttpError(404, 'Payroll period not found');
  if (!p.payslips.length) throw new HttpError(404, 'This payroll has no payslips');
  const { doc, done, fonts } = newDoc();
  p.payslips.forEach((s, i) => {
    if (i > 0) doc.addPage();
    drawSlip(doc, fonts, slipView(s, p.status), periodInfo(p), by);
  });
  doc.end();
  return { buffer: await done, filename: `Payslips-${p.name}.pdf` };
}