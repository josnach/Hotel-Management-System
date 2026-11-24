import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Loading } from '@/components/common';

type Status = 'ALL' | 'COMPLETED' | 'CANCELLED' | 'PAID' | 'REFUNDED';

interface Row {
  id: string;
  date: string;
  guestName: string;
  description: string;
  type: 'DEBIT' | 'CREDIT';
  amount: string | number;
  status: Exclude<Status, 'ALL'>;
}

interface LedgerResponse {
  summary: { receivables: string | number; payables: string | number; net: string | number };
  rows: Row[];
}

interface InHouse {
  stayId: string;
  label: string;
}

const TABS: { key: Status; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'PAID', label: 'Paid' },
  { key: 'REFUNDED', label: 'Refunded' },
];

const naira = (n: string | number) =>
  `₦${Math.abs(Number(n)).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_STYLE: Record<Row['status'], string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  PAID: 'bg-blue-100 text-blue-700',
  REFUNDED: 'bg-purple-100 text-purple-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

const input = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const label = 'mb-1 block text-sm font-medium text-gray-700';
const btnCancel = 'rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300';
const btnBlue = 'rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60';
const btnGreen = 'rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-16" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-semibold text-gray-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/* ───────────── Process Payment ───────────── */
function PayModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const pay = useMutation({
    mutationFn: () => api.post(`/finance/city-ledger/${row.id}/pay`, { method, paymentDate, reference, notes }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['city-ledger'] });
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });

  const submit = () => {
    if (!method) return setError('Select a payment method');
    setError('');
    pay.mutate();
  };

  return (
    <Modal title="Process Payment" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={label}>Payment Method</label>
          <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Select Payment Method</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="TRANSFER">Transfer</option>
          </select>
        </div>
        <div>
          <label className={label}>Payment Date</label>
          <input type="date" className={input} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
        <div>
          <label className={label}>Reference Number (Optional)</label>
          <input className={input} placeholder="Enter reference number..." value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div>
          <label className={label}>Notes (Optional)</label>
          <textarea className={input} rows={3} placeholder="Enter payment notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnCancel} onClick={onClose}>Cancel</button>
          <button type="button" className={btnBlue} disabled={pay.isPending} onClick={submit}>Process Payment</button>
        </div>
      </div>
    </Modal>
  );
}

/* ───────────── Process Refund ───────────── */
function RefundModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState('');
  const [refundDate, setRefundDate] = useState(today());
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const refund = useMutation({
    mutationFn: () => api.post(`/finance/city-ledger/${row.id}/refund`, { method, refundDate, reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['city-ledger'] });
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });

  const submit = () => {
    if (!method) return setError('Select a refund method');
    setError('');
    refund.mutate();
  };

  return (
    <Modal title="Process Refund" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={label}>Refund Method</label>
          <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Select Refund Method</option>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CREDIT_NOTE">Credit Note</option>
          </select>
        </div>
        <div>
          <label className={label}>Refund Date</label>
          <input type="date" className={input} value={refundDate} onChange={(e) => setRefundDate(e.target.value)} />
        </div>
        <div>
          <label className={label}>Refund Reason (Optional)</label>
          <textarea className={input} rows={3} placeholder="Enter reason for refund..." value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnCancel} onClick={onClose}>Cancel</button>
          <button type="button" className={btnGreen} disabled={refund.isPending} onClick={submit}>Process Refund</button>
        </div>
      </div>
    </Modal>
  );
}

/* ───────────── Post to Guest Account ───────────── */
function PostModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const [stayId, setStayId] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [error, setError] = useState('');

  const guests = useQuery({
    queryKey: ['city-ledger', 'in-house'],
    queryFn: () => api.get('/finance/city-ledger/in-house') as Promise<InHouse[]>,
  });

  const post = useMutation({
    mutationFn: () =>
      api.post(`/finance/city-ledger/${row.id}/post-to-guest`, {
        stayId: stayId || undefined,
        roomNumber: stayId ? undefined : roomNumber.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['city-ledger'] });
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });

  const submit = () => {
    if (!stayId && !roomNumber.trim()) return setError('Select a guest or enter a room number');
    setError('');
    post.mutate();
  };

  return (
    <Modal title="Post to Guest Account" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={label}>Select Guest</label>
          <select className={input} value={stayId} onChange={(e) => setStayId(e.target.value)}>
            <option value="">Select Guest</option>
            {(guests.data ?? []).map((g) => (
              <option key={g.stayId} value={g.stayId}>{g.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Or search by room number:</label>
          <input
            className={input}
            placeholder="Enter room number"
            value={roomNumber}
            onChange={(e) => setRoomNumber(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnCancel} onClick={onClose}>Cancel</button>
          <button type="button" className={btnBlue} disabled={post.isPending} onClick={submit}>Post to Guest</button>
        </div>
      </div>
    </Modal>
  );
}

/* ───────────── Summary card ───────────── */
function SummaryCard({
  title, value, tone, icon, suffix,
}: {
  title: string;
  value: string;
  tone: 'red' | 'green' | 'blue';
  icon: ReactNode;
  suffix?: string;
}) {
  const box = { red: 'bg-red-100 text-red-600', green: 'bg-green-100 text-green-600', blue: 'bg-blue-100 text-blue-600' }[tone];
  const amount = { red: 'text-red-600', green: 'text-green-600', blue: 'text-red-600' }[tone];
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold ${box}`}>{icon}</div>
      <div>
        <div className="text-sm text-gray-700">{title}</div>
        <div className={`text-xl font-semibold ${amount}`}>
          {value}
          {suffix && <span className="ml-2 text-xs font-medium">{suffix}</span>}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Page ───────────── */
export default function CityLedger() {
  const [status, setStatus] = useState<Status>('COMPLETED');
  const [modal, setModal] = useState<{ kind: 'pay' | 'refund' | 'post'; row: Row } | null>(null);

  const q = useQuery({
    queryKey: ['city-ledger', status],
    queryFn: () => api.get(`/finance/city-ledger?status=${status}`) as Promise<LedgerResponse>,
  });

  const startPay = (row: Row) => {
    if (window.confirm('Are you sure you want to process payment for this transaction?')) setModal({ kind: 'pay', row });
  };
  const startRefund = (row: Row) => {
    if (window.confirm('Are you sure you want to process a refund for this transaction?')) setModal({ kind: 'refund', row });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">City Ledger</h1>
        <Link
          to="/finance/city-ledger/create"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add Transaction
        </Link>
      </div>

      {q.data && (
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard title="Total Receivables" value={naira(q.data.summary.receivables)} tone="red" icon="$" />
          <SummaryCard title="Total Payables" value={naira(q.data.summary.payables)} tone="green" icon="✓" />
          <SummaryCard title="Net Balance" value={naira(q.data.summary.net)} tone="blue" icon="▥" suffix="(Due to Guest)" />
        </div>
      )}

      <div className="rounded-lg bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5">
          <h2 className="text-base font-semibold text-gray-900">City Ledger Transactions</h2>
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatus(t.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  status === t.key ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {q.isLoading ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Guest/Group</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount (₦)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.rows ?? []).map((r) => {
                  const debit = r.type === 'DEBIT';
                  const open = r.status === 'COMPLETED';
                  return (
                    <tr key={r.id} className="border-b border-gray-100 text-gray-900">
                      <td className="whitespace-nowrap px-4 py-3">{shortDate(r.date)}</td>
                      <td className="px-4 py-3">{r.guestName}</td>
                      <td className="px-4 py-3">{r.description}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${debit ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {debit ? 'Debit' : 'Credit'}
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 ${debit ? 'text-red-600' : 'text-green-600'}`}>
                        {debit ? '-' : '+'}{naira(r.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                          {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {open && (
                          <div className="flex gap-3">
                            {debit ? (
                              <button type="button" className="text-blue-600 hover:underline" onClick={() => startPay(r)}>Pay</button>
                            ) : (
                              <button type="button" className="text-green-600 hover:underline" onClick={() => startRefund(r)}>Refund</button>
                            )}
                            <button type="button" className="text-indigo-600 hover:underline" onClick={() => setModal({ kind: 'post', row: r })}>
                              Post to Guest
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.kind === 'pay' && <PayModal row={modal.row} onClose={() => setModal(null)} />}
      {modal?.kind === 'refund' && <RefundModal row={modal.row} onClose={() => setModal(null)} />}
      {modal?.kind === 'post' && <PostModal row={modal.row} onClose={() => setModal(null)} />}
    </div>
  );
}
