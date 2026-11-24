import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { config } from '../config';
import { HttpError } from '../lib/http';
import { prisma } from '../lib/prisma';

const INK = '#172033';
const NAVY = '#1e3a5f';
const MUTED = '#667085';
const LINE = '#d9dee7';
const LIGHT = '#f8fafc';

function formatDate(value: Date | null | undefined): string {
  if (!value) return '';
  return value.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: config.hotelTz,
  });
}

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return '';
  return value.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: config.hotelTz,
  });
}

function addField(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(label.toUpperCase(), x, y, { width });

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(INK)
    .text(value || ' ', x, y + 10, {
      width,
      height: 14,
      ellipsis: true,
    });

  doc
    .moveTo(x, y + 29)
    .lineTo(x + width, y + 29)
    .lineWidth(0.6)
    .strokeColor(LINE)
    .stroke();
}

function addSection(
  doc: PDFKit.PDFDocument,
  title: string,
  y: number,
): number {
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(NAVY)
    .text(title.toUpperCase(), 42, y);

  doc
    .moveTo(42, y + 15)
    .lineTo(553, y + 12)
    .lineWidth(0.8)
    .strokeColor(NAVY)
    .stroke();

  return y + 21;
}

function duration(checkIn: Date, departure: Date): string {
  const ms = departure.getTime() - checkIn.getTime();
  const days = Math.max(1, Math.ceil(ms / 86_400_000));
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export async function renderRegistrationCard(
  stayId: string,
  staffName = '',
): Promise<{ buffer: Buffer; filename: string }> {
  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: {
      guest: true,
      room: true,
    },
  });

  if (!stay) {
    throw new HttpError(404, 'Stay not found');
  }

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 32, bottom: 32, left: 42, right: 42 },
    info: {
      Title: `${config.hotelName} - Guest Registration Card`,
      Author: config.hotelName,
    },
  });

  const chunks: Buffer[] = [];

  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  if (config.pdfFontPath && fs.existsSync(config.pdfFontPath)) {
    doc.registerFont('Custom', config.pdfFontPath);
  }

  const guest = stay.guest;
  const fullName = `${guest.firstName} ${guest.lastName}`.trim();
  const birthday =
    guest.birthDay && guest.birthMonth
      ? `${String(guest.birthDay).padStart(2, '0')}/${String(guest.birthMonth).padStart(2, '0')}`
      : '';

  // Card background and header
  doc
    .roundedRect(28, 24, 539, 794, 8)
    .fillAndStroke('#ffffff', LINE);

  doc
    .font('Helvetica-Bold')
    .fontSize(19)
    .fillColor(NAVY)
    .text(config.hotelName, 42, 43, {
      width: 511,
      align: 'center',
    });

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(INK)
    .text('GUEST REGISTRATION CARD', 42, 70, {
      width: 511,
      align: 'center',
    });

  doc
    .moveTo(42, 91)
    .lineTo(553, 91)
    .lineWidth(1)
    .strokeColor(LINE)
    .stroke();

  let y = 108;
  const gap = 18;
  const colWidth = (511 - gap) / 2;

  // Guest information
  y = addSection(doc, 'Guest Information', y);

  addField(doc, 'Full Name', fullName, 42, y, colWidth);
  addField(doc, 'Date of Birth', birthday, 42 + colWidth + gap, y, colWidth);
  y += 39;

  addField(doc, 'Phone Number', guest.phone ?? '', 42, y, colWidth);
  addField(doc, 'Email Address', guest.email ?? '', 42 + colWidth + gap, y, colWidth);
  y += 39;

  addField(doc, 'Home/Office Address', guest.address ?? '', 42, y, 511);
  y += 39;

  // Identification
  y = addSection(doc, 'Identification', y);

  addField(doc, 'ID Type', guest.idType ?? '', 42, y, colWidth);
  addField(doc, 'ID Number', guest.idNumber ?? '', 42 + colWidth + gap, y, colWidth);
  y += 39;

  addField(doc, 'Nationality', guest.nationality ?? '', 42, y, colWidth);
  addField(
    doc,
    'Place of Issue',
    stay.placeOfIssue ?? '',
    42 + colWidth + gap,
    y,
    colWidth,
  );
  y += 39;

  // Stay details
  y = addSection(doc, 'Stay Details', y);

  addField(
    doc,
    'Expected Stay Duration',
    duration(stay.checkInAt, stay.expectedDeparture),
    42,
    y,
    colWidth,
  );
  addField(
    doc,
    'Purpose of Visit',
    stay.purposeOfVisit ?? '',
    42 + colWidth + gap,
    y,
    colWidth,
  );
  y += 39;

  addField(
    doc,
    'Vehicle Registration (If Applicable)',
    stay.vehicleRegistration ?? '',
    42,
    y,
    511,
  );
  y += 39;

  // Emergency contact
  y = addSection(doc, 'Emergency Contact', y);

  addField(
    doc,
    'Contact Name',
    stay.emergencyContactName ?? '',
    42,
    y,
    colWidth,
  );
  addField(
    doc,
    'Phone Number',
    stay.emergencyContactPhone ?? '',
    42 + colWidth + gap,
    y,
    colWidth,
  );
  y += 39;

  addField(
    doc,
    'Relationship',
    stay.emergencyContactRelationship ?? '',
    42,
    y,
    511,
  );
  y += 39;

  // Special requests
  y = addSection(doc, 'Special Requests', y);

  addField(
    doc,
    'Any Special Requirements',
    stay.specialRequests ?? '',
    42,
    y,
    511,
  );
  y += 39;

  // Declaration
  y = addSection(doc, 'Declaration', y);

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(INK)
    .text(
      "I confirm that the information provided is true and complete. I agree to abide by the hotel's terms and conditions.",
      42,
      y,
      { width: 511, lineGap: 2 },
    );

  y += 31;

  addField(doc, 'Signature', '', 42, y, colWidth);
  addField(doc, 'Date', '', 42 + colWidth + gap, y, colWidth);

  y += 42;

  // Official-use section
  doc
    .moveTo(42, y)
    .lineTo(553, y)
    .dash(4, { space: 3 })
    .lineWidth(0.8)
    .strokeColor(LINE)
    .stroke();

  doc.undash();

  y += 15;

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(NAVY)
    .text('FOR OFFICIAL USE ONLY', 42, y);

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text('Front Desk Staff', 42, y + 10);

  y += 28;

  const officialWidth = 150;
  addField(doc, 'Room No.', stay.room.number, 42, y, officialWidth);
  addField(doc, 'Staff Name', staffName, 42 + 180, y, officialWidth);
  addField(doc, 'Date', formatDate(stay.checkInAt), 42 + 360, y, 151);

  // Small reference details at the bottom
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(MUTED)
    .text(
      `Check-in: ${formatDateTime(stay.checkInAt)}    Expected departure: ${formatDateTime(stay.expectedDeparture)}`,
      42,
      785,
      { width: 511, align: 'center' },
    );

  doc.end();

  const safeName = fullName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');

  return {
    buffer: await done,
    filename: `guest-registration-${safeName || stay.id}.pdf`,
  };
}