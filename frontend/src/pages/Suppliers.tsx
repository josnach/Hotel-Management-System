import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Plus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Loading } from '@/components/common';
import { downloadCsv, errText, ui } from '@/lib/finUi';

interface Row {
  id: string;
  code: string | null;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  isActive: boolean;
  orders: number;
}

export default function Suppliers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [applied, setApplied] = useState({ q: '', status: '' });
  const [error, setError] = useState('');

  const q = useQuery({
    queryKey: ['suppliers', applied],
    queryFn: () => api.get('/finance/suppliers', { ...applied }) as Promise<{ rows: Row[] }>,
  });

  const toggle = useMutation({
    mutationFn: (id: string) => api.post(`/finance/suppliers/${id}/toggle`),
    onSuccess: () => {
      setError('');
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      void qc.invalidateQueries({ queryKey: ['po-supplier-options'] });
    },
    onError: (e) => setError(errText(e)),
  });

  const rows = q.data?.rows ?? [];

  const exportCsv = () =>
    downloadCsv('suppliers.csv', [
      ['Code', 'Name', 'Contact', 'Phone', 'Status', 'Orders'],
      ...rows.map((r) => [r.code, r.name, r.contactPerson, r.phone, r.isActive ? 'Active' : 'Inactive', r.orders]),
    ]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className={ui.h1}>Suppliers</h1>
        <div className="flex gap-3">
          <button type="button" className={ui.btnWhite} onClick={exportCsv}>
            <FileDown className="h-4 w-4" />
            Export CSV
          </button>
          <Link to="/finance/suppliers/new" className={ui.btnBlue}>
            <Plus className="h-4 w-4" />
            Add Supplier
          </Link>
        </div>
      </div>

      <div className={`p-5 ${ui.card}`}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <label className={ui.label}>Search</label>
            <input className={ui.input} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="min-w-[220px] flex-1">
            <label className={ui.label}>Status</label>
            <select className={ui.input} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <button type="button" className={ui.btnBlue} onClick={() => setApplied({ q: search, status })}>
            Apply Filters
          </button>
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className={`overflow-x-auto ${ui.card}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              {['Code', 'Name', 'Contact', 'Phone', 'Status', 'Orders', 'Actions'].map((h) => (
                <th key={h} className={ui.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={7}><Loading /></td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Users className="mx-auto mb-2 h-9 w-9 text-gray-400" />
                  <div className="font-semibold text-gray-900">No suppliers found</div>
                  <div className="mb-4 text-sm text-gray-500">Get started by creating a new supplier.</div>
                  <Link to="/finance/suppliers/new" className={ui.btnBlue}>
                    <Plus className="h-4 w-4" />
                    Add Supplier
                  </Link>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 text-gray-900">
                  <td className="whitespace-nowrap px-4 py-3">{r.code ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3">{r.contactPerson ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">{r.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {r.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.orders}</td>
                  <td className="px-4 py-3">
                    <button type="button" className="text-blue-600 hover:underline" disabled={toggle.isPending} onClick={() => toggle.mutate(r.id)}>
                      {r.isActive ? 'Deactivate' : 'Activate'}
                    </button>
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