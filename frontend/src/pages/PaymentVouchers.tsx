import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Clock, DollarSign, FileText, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/common';
import { errText, naira, PAYEE_TYPES, shortDate, ui } from '@/lib/finUi';

type Status = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID' | 'CANCELLED';

interface Row {
  id: string;
  voucherNo: string;
  payeeName: string;
  payeeType: string;
  amount: string | number;
  status: Status;
  date: string;
  createdBy: string;
}

interface Response {
  summary: { total: number; pending: number; approved: number; totalAmount: string | number };
  rows: Row[];
}

interface Filters {
  q: string;
  status: string;
  payeeType: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { q: '', status: '', payeeType: '', from: '', to: '' };

const STATUSES: { value: Status; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const BADGE: Record<Status, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

function Stat({ icon, tone, label, value }: { icon: ReactNode; tone: string; label: string; value: string | number }) {
  return (
    <div className={`flex items-center gap-3 p-4 ${ui.card}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>{icon}</div>
      <div>
        <div className="text-sm text-gray-700">{label}</div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
      </div>
    </div>
  );
}

export default function PaymentVouchers() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canApprove = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [error, setError] = useState('');

  const q = useQuery({
    queryKey: ['payment-vouchers', applied],
    queryFn: () => api.get('/finance/payment-vouchers', { ...applied }) as Promise<Response>,
  });

  const act = useMutation({
    mutationFn: (v: { id: string; action: 'submit' | 'approve' | 'pay' | 'cancel'; body?: unknown }) =>
      api.post(`/finance/payment-vouchers/${v.id}/${v.action}`, v.body),
    onSuccess: () => {
      setError('');
      void qc.invalidateQueries({ queryKey: ['payment-vouchers'] });
    },
    onError: (e) => setError(errText(e)),
  });

  const run = (id: string, action: 'submit' | 'approve' | 'pay', question: string) => {
    if (window.confirm(question)) act.mutate({ id, action });
  };
  const cancel = (id: string) => {
    const reason = window.prompt('Reason for cancelling this voucher (optional):');
    if (reason !== null) act.mutate({ id, action: 'cancel', body: { reason } });
  };

  const set = (k: keyof Filters) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className={ui.h1}>Payment Vouchers</h1>
          <p className={ui.sub}>Manage and track all payment vouchers</p>
        </div>
        <Link to="/finance/payment-vouchers/new" className={ui.btnBlue}>
          <Plus className="h-4 w-4" />
          New Payment Voucher
        </Link>
      </div>

      <div className={`p-5 ${ui.card}`}>
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className={ui.label}>Search</label>
            <input className={ui.input} placeholder="Voucher #, Payee, Description..." value={draft.q} onChange={set('q')} />
          </div>
          <div>
            <label className={ui.label}>Status</label>
            <select className={ui.input} value={draft.status} onChange={set('status')}>
              <option value="">All Status</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={ui.label}>Payee Type</label>
            <select className={ui.input} value={draft.payeeType} onChange={set('payeeType')}>
              <option value="">All Types</option>
              {PAYEE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={ui.label}>Date From</label>
            <input type="date" className={ui.input} value={draft.from} onChange={set('from')} />
          </div>
          <div>
            <label className={ui.label}>Date To</label>
            <input type="date" className={ui.input} value={draft.to} onChange={set('to')} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            className={ui.btnWhite}
            onClick={() => {
              setDraft(EMPTY);
              setApplied(EMPTY);
            }}
          >
            Clear Filters
          </button>
          <button type="button" className={ui.btnBlue} onClick={() => setApplied(draft)}>
            Apply Filters
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat icon={<ClipboardList className="h-5 w-5 text-blue-600" />} tone="bg-blue-100" label="Total Vouchers" value={q.data?.summary.total ?? 0} />
        <Stat icon={<Clock className="h-5 w-5 text-yellow-600" />} tone="bg-yellow-100" label="Pending Approval" value={q.data?.summary.pending ?? 0} />
        <Stat icon={<CheckCircle2 className="h-5 w-5 text-green-600" />} tone="bg-green-100" label="Approved" value={q.data?.summary.approved ?? 0} />
        <Stat icon={<DollarSign className="h-5 w-5 text-purple-600" />} tone="bg-purple-100" label="Total Amount" value={naira(q.data?.summary.totalAmount)} />
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className={`overflow-x-auto ${ui.card}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              {['Voucher #', 'Payee', 'Amount', 'Status', 'Date', 'Created By', 'Actions'].map((h) => (
                <th key={h} className={ui.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={7}><Loading /></td></tr>
            ) : !q.data?.rows.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center text-gray-500">
                  <FileText className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                  No payment vouchers found.
                </td>
              </tr>
            ) : (
              q.data.rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 text-gray-900">
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{r.voucherNo}</td>
                  <td className="px-4 py-3">
                    {r.payeeName}
                    <div className="text-xs capitalize text-gray-500">{r.payeeType.toLowerCase()}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{naira(r.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[r.status]}`}>
                      {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{shortDate(r.date)}</td>
                  <td className="px-4 py-3">{r.createdBy}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex gap-3">
                      {r.status === 'DRAFT' && (
                        <button type="button" className="text-blue-600 hover:underline" onClick={() => run(r.id, 'submit', 'Submit this voucher for approval?')}>
                          Submit
                        </button>
                      )}
                      {r.status === 'SUBMITTED' && canApprove && (
                        <button type="button" className="text-green-600 hover:underline" onClick={() => run(r.id, 'approve', 'Approve this payment voucher?')}>
                          Approve
                        </button>
                      )}
                      {r.status === 'APPROVED' && (
                        <button type="button" className="text-indigo-600 hover:underline" onClick={() => run(r.id, 'pay', 'Mark this voucher as paid? This posts the journal entry.')}>
                          Pay
                        </button>
                      )}
                      {(r.status === 'DRAFT' || r.status === 'SUBMITTED' || r.status === 'APPROVED') && (
                        <button type="button" className="text-red-600 hover:underline" onClick={() => cancel(r.id)}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}