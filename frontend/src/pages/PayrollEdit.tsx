import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Loading } from '@/components/common';
import { errText, naira, RunStatus, shortDate, SlipView, statusLabel, Summary, ui } from '@/lib/payrollUi';

interface Detail {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  paymentDate: string | null;
  frequency: string;
  status: RunStatus;
  payslips: SlipView[];
  summary: Summary;
}

interface Adjust {
  bonus: string;
  ded: string;
  note: string;
}

const cell = 'w-full min-w-[90px] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export default function PayrollEdit() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [paymentDate, setPaymentDate] = useState('');
  const [adj, setAdj] = useState<Record<string, Adjust>>({});
  const [error, setError] = useState('');

  const q = useQuery({
    queryKey: ['payroll', id],
    queryFn: () => api.get(`/finance/payroll/${id}`) as Promise<Detail>,
  });

  // Fill the form once, from what is saved.
  useEffect(() => {
    if (!q.data) return;
    setPaymentDate(q.data.paymentDate ? q.data.paymentDate.slice(0, 10) : '');
    setAdj(
      Object.fromEntries(
        q.data.payslips.map((r) => [
          r.id as string,
          { bonus: r.bonus ? String(r.bonus) : '0.00', ded: r.otherDeductions ? String(r.otherDeductions) : '0.00', note: r.deductionNote ?? '' },
        ]),
      ),
    );
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => {
      const d = q.data!;
      // Only send employees whose bonus, deduction or note actually changed.
      const adjustments = d.payslips
        .filter((r) => {
          const a = adj[r.id as string];
          return a && (Number(a.bonus || 0) !== r.bonus || Number(a.ded || 0) !== r.otherDeductions || a.note !== (r.deductionNote ?? ''));
        })
        .map((r) => {
          const a = adj[r.id as string];
          return { payslipId: r.id, bonus: Number(a.bonus || 0), otherDeductions: Number(a.ded || 0), deductionNote: a.note || undefined };
        });
      return api.put(`/finance/payroll/${id}`, { paymentDate: paymentDate || undefined, adjustments });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payroll', id] });
      void qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      navigate(`/finance/payroll/${id}`);
    },
    onError: (e) => setError(errText(e)),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{errText(q.error)}</p>;

  const d = q.data;
  if (d.status !== 'DRAFT') {
    return (
      <div className="mx-auto max-w-6xl space-y-3">
        <p className="rounded-md bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          This payroll has been approved and can no longer be changed.
        </p>
        <Link to={`/finance/payroll/${id}`} className={ui.btnWhite}>Back to payroll</Link>
      </div>
    );
  }

  const setField = (rowId: string, patch: Partial<Adjust>) =>
    setAdj((cur) => ({ ...cur, [rowId]: { ...cur[rowId], ...patch } }));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className={ui.h1}>Edit Payroll</h1>
          <p className={ui.sub}>{d.name}</p>
        </div>
        <Link to={`/finance/payroll/${id}`} className="pt-2 text-sm text-gray-600 hover:underline">← Back</Link>
      </div>

      <div className={`space-y-4 p-5 ${ui.card}`}>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={ui.label}>Payroll Period</label>
            <input className={ui.readonly} readOnly value={d.name} />
          </div>
          <div>
            <label className={ui.label}>Start Date</label>
            <input className={ui.readonly} readOnly value={shortDate(d.startDate)} />
          </div>
          <div>
            <label className={ui.label}>End Date</label>
            <input className={ui.readonly} readOnly value={shortDate(d.endDate)} />
          </div>
        </div>
        <div className="grid items-end gap-4 md:grid-cols-3">
          <div>
            <label className={ui.label}>Payment Date *</label>
            <input type="date" className={ui.input} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div>
            <label className={ui.label}>Frequency</label>
            <input className={`${ui.readonly} capitalize`} readOnly value={d.frequency.toLowerCase()} />
          </div>
          <div>
            <label className={ui.label}>Status</label>
            <span className="inline-block rounded bg-gray-100 px-3 py-2 text-sm text-gray-700">{statusLabel(d.status)}</span>
          </div>
        </div>
      </div>

      <div className={ui.card}>
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Employee Payroll Details</h2>
          <p className="text-sm text-gray-500">Adjust one-time bonuses and deductions for each employee</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-medium text-gray-600">
                <th className="px-4 py-3 text-left">Employee</th>
                <th className="px-3 py-3 text-right">Basic Salary</th>
                <th className="px-3 py-3 text-right">Allowances</th>
                <th className="px-3 py-3 text-right">Overtime</th>
                <th className="px-3 py-3 text-right">Total Earnings</th>
                <th className="px-3 py-3 text-right">Deductions</th>
                <th className="px-3 py-3 text-right">Net Pay</th>
                <th className="px-3 py-3 text-left">One-time Bonus</th>
                <th className="px-3 py-3 text-left">One-time Deduction</th>
                <th className="px-3 py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {d.payslips.map((r) => {
                const a = adj[r.id as string] ?? { bonus: '0.00', ded: '0.00', note: '' };
                return (
                  <tr key={r.id} className="border-t border-gray-100 text-gray-900">
                    <td className="px-4 py-4">
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.staffId} | {r.department}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-right">{naira(r.basic)}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-right">{naira(r.allowances)}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-right">{naira(r.overtime)}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-right font-bold">{naira(r.gross)}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-right">{naira(r.deductions)}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-right font-bold text-green-600">{naira(r.net)}</td>
                    <td className="px-3 py-4">
                      <input type="number" min="0" step="0.01" className={cell} value={a.bonus} onChange={(e) => setField(r.id as string, { bonus: e.target.value })} />
                    </td>
                    <td className="px-3 py-4">
                      <input type="number" min="0" step="0.01" className={cell} value={a.ded} onChange={(e) => setField(r.id as string, { ded: e.target.value })} />
                    </td>
                    <td className="px-3 py-4">
                      <input className={cell} placeholder="Optional" maxLength={200} value={a.note} onChange={(e) => setField(r.id as string, { note: e.target.value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 text-center text-sm">
          <span className="font-bold text-gray-900">Total Net Pay: </span>
          <span className="font-bold text-green-600">{naira(d.summary.net)}</span>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Net pay and tax are recalculated when you press Update Payroll.
      </p>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-3">
        <button type="button" className={ui.btnGrey} onClick={() => navigate(`/finance/payroll/${id}`)}>Cancel</button>
        <button type="button" className={ui.btnBlue} disabled={save.isPending} onClick={() => save.mutate()}>
          Update Payroll
        </button>
      </div>
    </div>
  );
}