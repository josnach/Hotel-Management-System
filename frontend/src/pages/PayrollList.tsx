import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { Loading } from '@/components/common';
import { errText, naira, RunStatus, shortDate, STATUS_BADGE, statusLabel, ui } from '@/lib/payrollUi';

interface Run {
  id: string;
  name: string;
  frequency: string;
  startDate: string;
  endDate: string;
  status: RunStatus;
  employees: number;
  totalNet: number;
}

export default function PayrollList() {
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const q = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api.get('/finance/payroll') as Promise<Run[]>,
  });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/finance/payroll/${id}`),
    onSuccess: () => {
      setError('');
      void qc.invalidateQueries({ queryKey: ['payroll-runs'] });
    },
    onError: (e) => setError(errText(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className={ui.h1}>Payroll Management</h1>
          <p className={ui.sub}>Manage employee payroll periods and payments</p>
        </div>
        <div className="flex gap-3">
          {/* Not in the original: keeps your existing rates, reliefs and tax bands one click away. */}
          <Link to="/finance/payroll/settings" className={ui.btnWhite}>
            <Settings className="h-4 w-4" />
            Payroll Settings
          </Link>
          <Link to="/finance/payroll/new" className={ui.btnPurple}>
            <Plus className="h-4 w-4" />
            New Payroll Period
          </Link>
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className={`overflow-x-auto ${ui.card}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Period</th>
              <th className="px-5 py-3">Dates</th>
              <th className="px-5 py-3">Employees</th>
              <th className="px-5 py-3 text-right">Total Net Pay</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={6}><Loading /></td></tr>
            ) : !q.data?.length ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-500">No payroll periods yet.</td></tr>
            ) : (
              q.data.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 text-gray-900">
                  <td className="px-5 py-4">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs capitalize text-gray-500">{r.frequency.toLowerCase()}</div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">{shortDate(r.startDate)} - {shortDate(r.endDate)}</td>
                  <td className="px-5 py-4">{r.employees}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-green-600">{naira(r.totalNet)}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>{statusLabel(r.status)}</span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <div className="flex gap-4">
                      <Link to={`/finance/payroll/${r.id}`} className="text-purple-700 hover:underline">View</Link>
                      {r.status === 'DRAFT' && (
                        <>
                          <Link to={`/finance/payroll/${r.id}/edit`} className="text-blue-600 hover:underline">Edit</Link>
                          <button
                            type="button"
                            className="text-red-600 hover:underline"
                            disabled={del.isPending}
                            onClick={() => window.confirm(`Delete payroll ${r.name}? This cannot be undone.`) && del.mutate(r.id)}
                          >
                            Delete
                          </button>
                        </>
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