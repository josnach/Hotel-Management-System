
import { money } from './utils';

type PrintDocumentKind = 'KITCHEN' | 'BILL' | 'RECEIPT';

interface PrintOrderItem {
  quantity: number | string;
  unitPrice: number | string;
  instructions?: string | null;
  item?: {
    name?: string;
  } | null;
}

export interface PrintableOrder {
  id: string;
  orderNo: string;
  createdAt?: string;
  paymentStatus: string;
  paymentMethod: string;
  subtotal: number | string;
  vat: number | string;
  serviceCharge: number | string;
  total: number | string;
  notes?: string | null;
  instructions?: string | null;
  isComplimentary?: boolean;
  isStaffCredit?: boolean;
  salesPoint?: {
    name?: string;
  } | null;
  staff?: {
    username?: string;
  } | null;
  guest?: {
    firstName?: string;
    lastName?: string;
  } | null;
  items: PrintOrderItem[];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return replacements[character];
  });
}

function amount(value: number | string): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function lineTotal(item: PrintOrderItem): number {
  return amount(item.quantity) * amount(item.unitPrice);
}

function guestName(order: PrintableOrder): string {
  const name = [
    order.guest?.firstName,
    order.guest?.lastName,
  ].filter(Boolean).join(' ');

  return name || 'Walk-in guest';
}

function documentHeading(
  kind: PrintDocumentKind,
  order: PrintableOrder,
): string {
  if (kind === 'KITCHEN') return 'KITCHEN ORDER';
  if (kind === 'BILL') return 'GUEST BILL';

  if (order.isComplimentary) return 'COMPLIMENTARY RECEIPT';
  if (order.paymentMethod === 'ROOM_CHARGE') return 'ROOM CHARGE';

  return 'PAYMENT RECEIPT';
}

function renderDocument(
  order: PrintableOrder,
  kind: PrintDocumentKind,
): string {
  const paymentMethod = String(order.paymentMethod || '').replace(/_/g, ' ');
  const isPaid = order.paymentStatus === 'PAID';
  const isComplimentary = Boolean(order.isComplimentary);
  const isRoomCharge = order.paymentMethod === 'ROOM_CHARGE';

  const title = documentHeading(kind, order);

  const createdAt = order.createdAt
    ? new Date(order.createdAt).toLocaleString()
    : new Date().toLocaleString();

  const rows = (order.items ?? []).map((item) => {
    const name = escapeHtml(item.item?.name || 'Menu item');
    const quantity = amount(item.quantity);
    const price = amount(item.unitPrice);

    const instructions = item.instructions
      ? `<div class="instructions">${escapeHtml(item.instructions)}</div>`
      : '';

    if (kind === 'KITCHEN') {
      return `
        <tr>
          <td>
            <strong>${name}</strong>
            ${instructions}
          </td>
          <td class="number">${quantity}</td>
        </tr>`;
    }

    return `
      <tr>
        <td>
          ${name}
          ${instructions}
        </td>
        <td class="number">${quantity}</td>
        <td class="number">${escapeHtml(money(price))}</td>
        <td class="number">${escapeHtml(money(quantity * price))}</td>
      </tr>`;
  }).join('');

  const kitchenInstructions = order.instructions
    ? `<p><strong>Order instructions:</strong> ${escapeHtml(order.instructions)}</p>`
    : '';

  const notes = order.notes
    ? `<p><strong>Notes:</strong> ${escapeHtml(order.notes)}</p>`
    : '';

  const kitchenTable = `
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="number">Qty</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  const financialTable = `
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="number">Qty</th>
          <th class="number">Price</th>
          <th class="number">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <section class="totals">
      <div>
        <span>Subtotal</span>
        <strong>${escapeHtml(money(amount(order.subtotal)))}</strong>
      </div>
      <div>
        <span>VAT</span>
        <strong>${escapeHtml(money(amount(order.vat)))}</strong>
      </div>
      <div>
        <span>Service charge</span>
        <strong>${escapeHtml(money(amount(order.serviceCharge)))}</strong>
      </div>
      <div class="grand-total">
        <span>Total</span>
        <strong>${escapeHtml(money(amount(order.total)))}</strong>
      </div>
    </section>`;

  let paymentMessage = '';

  if (kind === 'BILL') {
    paymentMessage = isPaid
      ? `<p class="status">Payment status: PAID</p>`
      : `<p class="status">PAYMENT DUE — ${escapeHtml(money(amount(order.total)))}</p>`;
  }

  if (kind === 'RECEIPT') {
    if (!isPaid) {
      throw new Error('Cannot print a payment receipt for an unpaid order.');
    }

    if (isComplimentary) {
      paymentMessage = '<p class="status">COMPLIMENTARY — NO PAYMENT COLLECTED</p>';
    } else if (isRoomCharge) {
      paymentMessage = '<p class="status">POSTED TO GUEST ROOM FOLIO — NOT A CASH PAYMENT</p>';
    } else {
      paymentMessage = `<p class="status">PAID VIA ${escapeHtml(paymentMethod)}</p>`;
    }
  }

  const customerBlock = kind === 'KITCHEN'
    ? ''
    : `<p><strong>Customer:</strong> ${escapeHtml(guestName(order))}</p>`;

  const content = kind === 'KITCHEN'
    ? `${kitchenTable}${kitchenInstructions}${notes}`
    : `${financialTable}${customerBlock}${paymentMessage}${notes}`;

  return `
    <section class="document">
      <header>
        <h1>Koraf Hotels & Apartments Ltd</h1>
        <p><strong>Address:</strong> 4 Koraf Hotel Crescent, Dawaki Hillside Estate.</p>
        <p><strong>Tel:</strong> +234 802 480 0870</p>
        <p><strong>Email:</strong> info@korafhotels.com</p>
        <h2>${escapeHtml(title)}</h2>
        <p><strong>Order:</strong> ${escapeHtml(order.orderNo)}</p>
        <p><strong>Sales point:</strong> ${escapeHtml(order.salesPoint?.name || 'N/A')}</p>
        <p><strong>Waiter:</strong> ${escapeHtml(order.staff?.username || 'N/A')}</p>
        <p><strong>Date:</strong> ${escapeHtml(createdAt)}</p>
        ${kind !== 'KITCHEN' ? `<p><strong>Payment method:</strong> ${escapeHtml(paymentMethod)}</p>` : ''}
      </header>
      ${content}
      <footer>${kind === 'KITCHEN' ? 'Please prepare this order.' : 'Thank you for visiting us.'}</footer>
    </section>`;
}

function writePrintDocument(
  printWindow: Window,
  order: PrintableOrder,
  kind: PrintDocumentKind,
): void {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(order.orderNo)} - ${kind}</title>
  <style>
    @page { size: auto; margin: 8mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
    }
    .document {
      max-width: 760px;
      margin: 0 auto;
      padding: 8px;
    }
    header { text-align: center; margin-bottom: 18px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 0 0 12px; }
    header p { margin: 4px 0; text-align: left; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; }
    th, td {
      padding: 7px 4px;
      text-align: left;
      border-bottom: 1px solid #ccc;
      vertical-align: top;
    }
    th { border-bottom: 2px solid #111; }
    .number { text-align: right; white-space: nowrap; }
    .instructions { font-size: 11px; margin-top: 4px; }
    .totals { margin: 16px 0; }
    .totals div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 5px 0;
    }
    .grand-total {
      border-top: 2px solid #111;
      font-size: 15px;
      margin-top: 6px;
      padding-top: 9px !important;
    }
    .status { font-weight: bold; margin-top: 14px; }
    footer {
      text-align: center;
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px dashed #888;
    }
  </style>
</head>
<body>
  ${renderDocument(order, kind)}
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export function printKitchenDocket(
  printWindow: Window,
  order: PrintableOrder,
): void {
  writePrintDocument(printWindow, order, 'KITCHEN');
}

export function printGuestBill(
  printWindow: Window,
  order: PrintableOrder,
): void {
  writePrintDocument(printWindow, order, 'BILL');
}

export function printPaymentReceipt(
  printWindow: Window,
  order: PrintableOrder,
): void {
  if (order.paymentStatus !== 'PAID') {
    throw new Error('Cannot print a payment receipt for an unpaid order.');
  }

  writePrintDocument(printWindow, order, 'RECEIPT');
}


export function printSaleDocuments(
  printWindow: Window,
  order: PrintableOrder,
): void {
  const documents: PrintDocumentKind[] = ['BILL'];

  if (order.paymentStatus === 'PAID') {
    documents.push('RECEIPT');
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(order.orderNo)} - Sale Documents</title>
  <style>
    @page { size: auto; margin: 8mm; }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
    }

    .document {
      max-width: 760px;
      margin: 0 auto;
      padding: 8px;
    }

    .document + .document {
      break-before: page;
      page-break-before: always;
    }

    header { text-align: center; margin-bottom: 18px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 0 0 12px; }
    header p { margin: 4px 0; text-align: left; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; }

    th, td {
      padding: 7px 4px;
      text-align: left;
      border-bottom: 1px solid #ccc;
      vertical-align: top;
    }

    th { border-bottom: 2px solid #111; }
    .number { text-align: right; white-space: nowrap; }
    .instructions { font-size: 11px; margin-top: 4px; }
    .totals { margin: 16px 0; }

    .totals div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 5px 0;
    }

    .grand-total {
      border-top: 2px solid #111;
      font-size: 15px;
      margin-top: 6px;
      padding-top: 9px !important;
    }

    .status { font-weight: bold; margin-top: 14px; }

    footer {
      text-align: center;
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px dashed #888;
    }

    @media print {
      .document + .document {
        break-before: page;
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
  ${documents.map((kind) => renderDocument(order, kind)).join('')}

  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 300);
    });
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}


export async function fetchOrderForPrinting(
  orderId: string,
): Promise<PrintableOrder> {
  const { api } = await import('./api');

  const order = await api.get<PrintableOrder>(
    `/orders/${encodeURIComponent(orderId)}`,
  );

  if (!order?.id || !Array.isArray(order.items)) {
    throw new Error('The server did not return complete order details for printing.');
  }

  return order;
}
