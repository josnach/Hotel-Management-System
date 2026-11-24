export const pdfMoney = (n: unknown) =>
  `NGN ${Number(n ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; // built-in PDF fonts have no ₦

export interface PdfSection { title?: string; head: string[]; body: (string | number)[][] }

export async function exportReportPdf(o: {
  title: string; subtitle?: string; filename: string; stats?: [string, string | number][]; sections: PdfSection[];
}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape' });
  let y = 16;
  doc.setFontSize(16); doc.text(o.title, 14, y); y += 7;
  doc.setFontSize(10);
  if (o.subtitle) { doc.text(o.subtitle, 14, y); y += 6; }
  if (o.stats?.length) { doc.text(o.stats.map(([k, v]) => `${k}: ${v}`).join('   |   '), 14, y, { maxWidth: 270 }); y += 8; }
  for (const s of o.sections) {
    if (y > 175) { doc.addPage(); y = 16; }
    if (s.title) { doc.setFontSize(12); doc.text(s.title, 14, y); y += 3; }
    autoTable(doc, {
      startY: y + 2, head: [s.head], body: s.body.map((r) => r.map(String)),
      headStyles: { fillColor: [66, 130, 240] }, styles: { fontSize: 9 },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10;
  }
  doc.save(o.filename);
}