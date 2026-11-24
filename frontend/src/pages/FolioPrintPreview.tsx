
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { Button } from '@/components/ui/button';

const naira = (value: unknown) =>
  `\u20A6${Number(value ?? 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Lagos',
  }).format(date);
};

const display = (value?: string | number | null) => {
  const result = String(value ?? '').trim();
  return result || 'N/A';
};

export function FolioPrintPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: folio, isLoading, error } = useGet(`/folios/${id}`);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Loading folio print preview...
      </div>
    );
  }

  if (error || !folio) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-sm text-red-600">
          Unable to load this folio. Please return to the folio details and try again.
        </p>
        <Button variant="outline" onClick={() => navigate(`/folios/${id}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Folio
        </Button>
      </div>
    );
  }

  const guestName = folio.guest
    ? `${folio.guest.firstName ?? ''} ${folio.guest.lastName ?? ''}`.trim()
    : folio.group?.name ?? 'N/A';

  const transactions = Array.isArray(folio.txs) ? folio.txs : [];

  const totalCharges = transactions.reduce(
    (total: number, transaction: any) =>
      total + Number(transaction.bill ?? 0),
    0,
  );

  const totalPayments = transactions.reduce(
    (total: number, transaction: any) =>
      total + Number(transaction.payment ?? 0),
    0,
  );

  // Preserve the existing folio ledger calculation: charges less payments.
  const balance = totalCharges - totalPayments;

  const hotel = folio.hotel ?? {};
  const stay = folio.stay ?? {};
  const roomNumber = stay.room?.number ?? '-';

  const printedAt = formatDateTime(new Date());

  const balanceLabel =
    balance > 0 ? 'Credit' : balance < 0 ? 'Debit' : 'Settled';

  return (
    <div className="folio-print-page min-h-screen bg-slate-100 px-4 py-6">
      <style>{`
        .folio-print-page {
          color: #1f2937;
          font-family: Arial, Helvetica, sans-serif;
        }

        .folio-print-sheet {
          box-sizing: border-box;
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          padding: 15mm 16mm;
          background: #fff;
          border: 1px solid #d1d5db;
          box-shadow: 0 2px 12px rgba(15, 23, 42, 0.10);
        }

        .folio-print-sheet * {
          box-sizing: border-box;
        }

        .folio-hotel-name {
          margin: 0;
          font-size: 21px;
          line-height: 1.3;
          font-weight: 800;
          letter-spacing: 0.7px;
          text-align: center;
          text-transform: uppercase;
        }

        .folio-hotel-contact {
          margin-top: 4px;
          color: #4b5563;
          font-size: 10px;
          line-height: 1.6;
          text-align: center;
        }

        .folio-document-title {
          margin: 23px 0 5px;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 1px;
          text-align: center;
        }

        .folio-meta {
          margin-bottom: 19px;
          color: #4b5563;
          font-size: 10px;
          text-align: center;
        }

        .folio-info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 13px;
          margin-bottom: 20px;
        }

        .folio-info-panel {
          min-height: 117px;
          padding: 11px 12px;
          border: 1px solid #d1d5db;
          border-radius: 3px;
        }

        .folio-section-heading {
          margin: 0 0 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid #d1d5db;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.55px;
        }

        .folio-info-row {
          display: grid;
          grid-template-columns: 82px minmax(0, 1fr);
          gap: 5px;
          margin: 5px 0;
          font-size: 10px;
          line-height: 1.35;
        }

        .folio-info-label {
          color: #4b5563;
          font-weight: 600;
        }

        .folio-info-value {
          overflow-wrap: anywhere;
          font-weight: 600;
        }

        .folio-transaction-heading {
          margin: 0 0 9px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.55px;
        }

        .folio-transaction-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 9px;
        }

        .folio-transaction-table th {
          padding: 8px 6px;
          border: 1px solid #d1d5db;
          background: #f3f4f6;
          font-weight: 800;
          text-align: left;
        }

        .folio-transaction-table td {
          padding: 8px 6px;
          border: 1px solid #d1d5db;
          vertical-align: top;
          overflow-wrap: anywhere;
        }

        .folio-transaction-table .folio-amount {
          text-align: right;
          white-space: nowrap;
        }

        .folio-transaction-table .folio-total-row td {
          background: #f9fafb;
          font-weight: 800;
        }

        .folio-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 17px;
        }

        .folio-summary-card {
          min-height: 67px;
          padding: 10px;
          border: 1px solid #d1d5db;
          border-radius: 3px;
        }

        .folio-summary-label {
          margin-bottom: 7px;
          color: #4b5563;
          font-size: 9px;
          font-weight: 700;
        }

        .folio-summary-value {
          font-size: 13px;
          font-weight: 800;
        }

        .folio-terms {
          margin-top: 22px;
        }

        .folio-terms ul {
          margin: 7px 0 0;
          padding-left: 17px;
          color: #374151;
          font-size: 9px;
          line-height: 1.65;
        }

        .folio-signatures {
          display: grid;
          grid-template-columns: 1fr 1fr 0.7fr;
          gap: 22px;
          margin-top: 48px;
        }

        .folio-signature-line {
          height: 23px;
          border-bottom: 1px solid #6b7280;
        }

        .folio-signature-label {
          margin-top: 6px;
          color: #4b5563;
          font-size: 9px;
          text-align: center;
        }

        .folio-print-footer {
          margin-top: 32px;
          padding-top: 10px;
          border-top: 1px solid #d1d5db;
          color: #4b5563;
          font-size: 9px;
          line-height: 1.7;
          text-align: center;
        }

        @page {
          size: A4 portrait;
          margin: 0;
        }

        @media print {
          html, body {
            width: 210mm !important;
            min-width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          #folio-print-root,
          #folio-print-root * {
            visibility: visible !important;
          }

          #folio-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .folio-print-page {
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .folio-print-toolbar {
            display: none !important;
          }

          .folio-print-sheet {
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            padding: 15mm 16mm !important;
            border: 0 !important;
            box-shadow: none !important;
            page-break-after: avoid !important;
          }

          .folio-transaction-table tr,
          .folio-info-panel,
          .folio-summary-card {
            break-inside: avoid;
          }
        }

        @media screen and (max-width: 800px) {
          .folio-print-sheet {
            width: 100%;
            min-height: 0;
            padding: 24px;
          }
        }

        @media screen and (max-width: 540px) {
          .folio-info-grid,
          .folio-summary-grid {
            grid-template-columns: 1fr;
          }

          .folio-print-sheet {
            padding: 16px;
            overflow-x: auto;
          }

          .folio-transaction-table {
            min-width: 560px;
          }
        }
      `}</style>

      <div className="folio-print-toolbar mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Folio Print Preview #{folio.folioNo}
          </h1>
          <p className="text-xs text-slate-500">
            Review the document before printing.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/folios/${id}`)}
          >
            Close
          </Button>
        </div>
      </div>

      <main id="folio-print-root" className="folio-print-sheet">
        <header>
          <h2 className="folio-hotel-name">
            {display(hotel.name)}
          </h2>

          <div className="folio-hotel-contact">
            {hotel.address && <div>{hotel.address}</div>}
            {[hotel.phone, hotel.email].filter(Boolean).join(' | ')}
            {hotel.website && (
              <div>{hotel.website}</div>
            )}
          </div>
        </header>

        <h1 className="folio-document-title">GUEST FOLIO</h1>

        <div className="folio-meta">
          Folio #: {display(folio.folioNo)}
          {' | '}
          Printed: {printedAt}
          {' | '}
          Page: 1 of 1
        </div>

        <section className="folio-info-grid">
          <div className="folio-info-panel">
            <h3 className="folio-section-heading">
              GUEST INFORMATION
            </h3>

            <div className="folio-info-row">
              <span className="folio-info-label">Name</span>
              <span className="folio-info-value">{display(guestName)}</span>
            </div>
            <div className="folio-info-row">
              <span className="folio-info-label">Email</span>
              <span className="folio-info-value">
                {display(folio.guest?.email)}
              </span>
            </div>
            <div className="folio-info-row">
              <span className="folio-info-label">Phone</span>
              <span className="folio-info-value">
                {display(folio.guest?.phone)}
              </span>
            </div>
            <div className="folio-info-row">
              <span className="folio-info-label">Address</span>
              <span className="folio-info-value">
                {display(folio.guest?.address)}
              </span>
            </div>
          </div>

          <div className="folio-info-panel">
            <h3 className="folio-section-heading">
              STAY DETAILS
            </h3>

            <div className="folio-info-row">
              <span className="folio-info-label">Room</span>
              <span className="folio-info-value">{display(roomNumber)}</span>
            </div>
            <div className="folio-info-row">
              <span className="folio-info-label">Check-in</span>
              <span className="folio-info-value">
                {formatDateTime(stay.checkInAt)}
              </span>
            </div>
            <div className="folio-info-row">
              <span className="folio-info-label">Check-out</span>
              <span className="folio-info-value">
                {formatDateTime(stay.checkOutAt)}
              </span>
            </div>
            <div className="folio-info-row">
              <span className="folio-info-label">Status</span>
              <span className="folio-info-value">
               {display(folio.status).replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </section>

        <section>
          <h3 className="folio-transaction-heading">
            TRANSACTION DETAILS
          </h3>

          <table className="folio-transaction-table">
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '32%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '17%' }} />
            </colgroup>

            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Reference</th>
                <th className="folio-amount">Debit (₦)</th>
                <th className="folio-amount">Credit (₦)</th>
              </tr>
            </thead>

            <tbody>
              {transactions.map((transaction: any) => (
                <tr key={transaction.id}>
                  <td>{formatDateTime(transaction.createdAt)}</td>
                  <td>{display(transaction.description)}</td>
                  <td>-</td>
                  <td className="folio-amount">
                    {Number(transaction.bill ?? 0) > 0
                      ? naira(transaction.bill)
                      : '-'}
                  </td>
                  <td className="folio-amount">
                    {Number(transaction.payment ?? 0) > 0
                      ? naira(transaction.payment)
                      : '-'}
                  </td>
                </tr>
              ))}

              {transactions.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center' }}>
                    No transactions recorded for this folio.
                  </td>
                </tr>
              )}

              <tr className="folio-total-row">
                <td colSpan={3}>TOTAL</td>
                <td className="folio-amount">{naira(totalCharges)}</td>
                <td className="folio-amount">{naira(totalPayments)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="folio-summary-grid">
          <div className="folio-summary-card">
            <div className="folio-summary-label">Total Charges</div>
            <div className="folio-summary-value">{naira(totalCharges)}</div>
          </div>

          <div className="folio-summary-card">
            <div className="folio-summary-label">Total Payments</div>
            <div className="folio-summary-value">{naira(totalPayments)}</div>
          </div>

          <div className="folio-summary-card">
            <div className="folio-summary-label">Balance</div>
            <div className="folio-summary-value">
              {naira(Math.abs(balance))} ({balanceLabel})
            </div>
          </div>
        </section>

        <section className="folio-terms">
          <h3 className="folio-section-heading">TERMS &amp; CONDITIONS</h3>
          <ul>
            <li>All charges are payable upon presentation of this folio.</li>
            <li>
              Please verify all transactions and report any discrepancies immediately.
            </li>
            <li>
              This folio serves as an official record of your stay and transactions.
            </li>
            <li>
              Thank you for choosing our hotel. We look forward to serving you again.
            </li>
          </ul>
        </section>

        <section className="folio-signatures">
          <div>
            <div className="folio-signature-line" />
            <div className="folio-signature-label">Guest Signature</div>
          </div>
          <div>
            <div className="folio-signature-line" />
            <div className="folio-signature-label">Front Desk Agent</div>
          </div>
          <div>
            <div className="folio-signature-line" />
            <div className="folio-signature-label">Date</div>
          </div>
        </section>

        <footer className="folio-print-footer">
          <div>Thank you for staying with us! | We appreciate your business.</div>
          {hotel.website && <div>{hotel.website}</div>}
        </footer>
      </main>
    </div>
  );
}
