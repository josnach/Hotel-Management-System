import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/common';
import { downloadCsv, errText, naira, shortDate, ui } from '@/lib/finUi';

type Status = 'DRAFT' | 'PENDING' | 'APPROVED' | 'RECEIVED' | 'CANCELLED';

interface Row {
  id: string;
  poNo: string;
  supplier: string;
  orderDate: string;
  expectedDelivery: string | null;
  status: Status;
  total: string | number;
  itemCount: number;
}

interface Response {
  summary: { total: number; draft: number; pending: number; approved: number; received: number; cancelled: number };
  rows: Row[];
}

interface SupplierOption {
  id: string;
  name: string;
}

interface Filters {
  status: string;
  start: string;
  end: string;
  supplierId: string;
  q: string;
}

const EMPTY: Filters = { status: '', start: '', end: '', supplierId: '', q: '' };

const STATUSES: { value: Status; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const BADGE: Record<Status, string> = {
  DRAFT: 'bg-blue-100 text-blue-700',
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-700',
  RECEIVED: 'bg-purple-100 text-purple-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const TILES: { key: keyof Response['summary']; label: string; text: string; border: string }[] = [
  { key: 'total', label: 'Total', text: 'text-gray-900', border: 'border-gray-200' },
  { key: 'draft', label: 'Draft', text: 'text-blue-700', border: 'border-blue-100' },
  { key: 'pending', label: 'Pending', text: 'text-yellow-700', border: 'border-yellow-200' },
  { key: 'approved', label: 'Approved', text: 'text-green-700', border: 'border-green-200' },
  { key: 'received', label: 'Received', text: 'text-purple-700', border: 'border-purple-200' },
  { key: 'cancelled', label: 'Cancelled', text: 'text-red-700', border: 'border-red-200' },
];

export default function PurchaseOrderList() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canApprove = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [error, setError] = useState('');

  const suppliers = useQuery({
    queryKey: ['po-supplier-options'],
    queryFn: () => api.get('/finance/suppliers/options') as Promise<SupplierOption[]>,
  });

  const q = useQuery({
    queryKey: ['purchase-orders', applied],
    queryFn: () => api.get('/finance/purchase-orders', { ...applied }) as Promise<Response>,
  });

  const act = useMutation({
    mutationFn: (v: { id: string; action: 'submit' | 'approve' | 'cancel' | 'receive'; body?: unknown }) =>
      api.post(`/finance/purchase-orders/${v.id}/${v.action}`, v.body),
    onSuccess: () => {
      setError('');
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (e) => setError(errText(e)),
  });

  const run = (id: string, action: 'submit' | 'approve' | 'cancel', question: string) => {
    if (window.confirm(question)) act.mutate({ id, action });
  };
  const receive = (id: string) => {
    if (!window.confirm('Receive this order into stock? This adds the items to inventory and posts the journal.')) return;
    const paid = window.confirm('Has the supplier already been paid?\n\nOK = paid from bank, Cancel = still owed.');
    act.mutate({ id, action: 'receive', body: { paid } });
  };

  const exportCsv = () => {
    const rows = q.data?.rows ?? [];
    downloadCsv('purchase-orders.csv', [
      ['PO Number', 'Supplier', 'Order Date', 'Expected Delivery', 'Items', 'Total (NGN)', 'Status'],
      ...rows.map((r) => [
        r.poNo, r.supplier, shortDate(r.orderDate), shortDate(r.expectedDelivery), r.itemCount, Number(r.total).toFixed(2), r.status,
      ]),
    ]);
  };

  const set = (k: keyof Filters) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className={ui.h1}>Purchase Orders</h1>
          <p className={ui.sub}>Manage your procurement and supplier orders</p>
        </div>
        <div className="flex gap-3">
          <button type="button" className={ui.btnGreen} onClick={exportCsv}>
            <FileSpreadsheet className="h-4 w-4" />
            Export
          </button>
          <Link to="/finance/purchase-orders/new" className={ui.btnBlue}>
            <Plus className="h-4 w-4" />
            New Purchase Order
          </Link>
        </div>
      </div>

      <div className={`p-5 ${ui.card}`}>
        <div className="grid gap-4 md:grid-cols-4">
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
            <label className={ui.label}>Start Date</label>
            <input type="date" className={ui.input} value={draft.start} onChange={set('start')} />
          </div>
          <div>
            <label className={ui.label}>End Date</label>
            <input type="date" className={ui.input} value={draft.end} onChange={set('end')} />
          </div>
          <div>
            <label className={ui.label}>Supplier</label>
            <select className={ui.input} value={draft.supplierId} onChange={set('supplierId')}>
              <option value="">All Suppliers</option>
              {(suppliers.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 grid items-end gap-4 md:grid-cols-4">
          <div className="md:col-span-3">
            <label className={ui.label}>Search</label>
            <input className={ui.input} placeholder="Search by PO number or supplier name..." value={draft.q} onChange={set('q')} />
          </div>
          <div className="flex gap-3">
            <button type="button" className={`${ui.btnBlue} flex-1 justify-center`} onClick={() => setApplied(draft)}>
              Filter
            </button>
            <button
              type="button"
              className={`${ui.btnGrey} justify-center`}
              onClick={() => {
                setDraft(EMPTY);
                setApplied(EMPTY);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {TILES.map((t) => (
          <div key={t.key} className={`rounded-lg border bg-white p-4 text-center ${t.border}`}>
            <div className={`text-sm font-medium ${t.key === 'total' ? 'text-gray-900' : t.text}`}>{t.label}</div>
            <div className={`text-2xl font-bold ${t.text}`}>{q.data?.summary[t.key] ?? 0}</div>
          </div>
        ))}
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className={ui.card}>
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className={ui.section}>Purchase Orders</h2>
          <p className="text-sm text-gray-500">{q.data?.rows.length ?? 0} purchase orders found</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['PO Number', 'Supplier', 'Order Date', 'Expected Delivery', 'Items', 'Total', 'Status', 'Actions'].map((h) => (
                  <th key={h} className={ui.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                <tr><td colSpan={8}><Loading /></td></tr>
              ) : !q.data?.rows.length ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">No purchase orders found.</td></tr>
              ) : (
                q.data.rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 text-gray-900">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{r.poNo}</td>
                    <td className="px-4 py-3">{r.supplier}</td>
                    <td className="whitespace-nowrap px-4 py-3">{shortDate(r.orderDate)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{shortDate(r.expectedDelivery)}</td>
                    <td className="px-4 py-3">{r.itemCount}</td>
                    <td className="whitespace-nowrap px-4 py-3">{naira(r.total)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[r.status]}`}>
                        {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex gap-3">
                        {r.status === 'DRAFT' && (
                          <button type="button" className="text-blue-600 hover:underline" onClick={() => run(r.id, 'submit', 'Submit this order for approval?')}>
                            Submit
                          </button>
                        )}
                        {r.status === 'PENDING' && canApprove && (
                          <button type="button" className="text-green-600 hover:underline" onClick={() => run(r.id, 'approve', 'Approve this purchase order?')}>
                            Approve
                          </button>
                        )}
                        {r.status === 'APPROVED' && (
                          <button type="button" className="text-purple-600 hover:underline" onClick={() => receive(r.id)}>
                            Receive
                          </button>
                        )}
                        {r.status !== 'RECEIVED' && r.status !== 'CANCELLED' && (
                          <button type="button" className="text-red-600 hover:underline" onClick={() => run(r.id, 'cancel', 'Cancel this purchase order?')}>
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
    </div>
  );
}