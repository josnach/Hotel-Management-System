import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Info, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Loading } from '@/components/common';
import DeductionsModal from '@/components/payroll/DeductionsModal';
import { errText, isoDay, naira, RateInfo, SlipView, Summary, ui } from '@/lib/payrollUi';

interface Staff {
  id: string;
  staffId: string;
  fullName: string;
  department: string;
  position: string;
  basicSalary: number;
  compLimit: number;
}

interface Preview {
  config: RateInfo;
  summary: Summary;
  rows: SlipView[];
}

const now = new Date();

export default function PayrollCreate() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Defaults: the current month, paid on the 1st of the next month.
  const [startDate, setStartDate] = useState(isoDay(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [endDate, setEndDate] = useState(isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [paymentDate, setPaymentDate] = useState(isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 1)));
  const [trackTime, setTrackTime] = useState(false);
  const [trackLeave, setTrackLeave] = useState(false);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [breakdown, setBreakdown] = useState<SlipView | null>(null);
  const [error, setError] = useState('');

  const staff = useQuery({
    queryKey: ['payroll-staff'],
    queryFn: () => api.get('/staff', { status: 'Active' }) as Promise<Staff[]>,
  });

  const departments = useMemo(
    () => [...new Set((staff.data ?? []).map((s) => s.department).filter(Boolean))].sort(),
    [staff.data],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (staff.data ?? []).filter(
      (s) =>
        (!dept || s.department === dept) &&
        (!q || [s.staffId, s.fullName, s.department, s.position].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [staff.data, search, dept]);

  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.has(s.id));

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleVisible = () =>
    setSelected((cur) => {
      const next = new Set(cur);
      visible.forEach((s) => (allVisibleSelected ? next.delete(s.id) : next.add(s.id)));
      return next;
    });

  const employeeIds = [...selected];

  const generate = useMutation({
    mutationFn: () => api.post('/finance/payroll/preview', { employeeIds }) as Promise<Preview>,
    onSuccess: (data) => {
      setError('');
      setPreview(data);
    },
    onError: (e) => setError(errText(e)),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/finance/payroll', {
        startDate, endDate, paymentDate, frequency: 'MONTHLY', trackTime, trackLeave, employeeIds,
      }) as Promise<{ id: string }>,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      navigate(`/finance/payroll/${r.id}`);
    },
    onError: (e) => {
      setPreview(null);
      setError(errText(e));
    },
  });

  const onGenerate = () => {
    if (!startDate || !endDate || !paymentDate) return setError('Start date, end date and payment date are required');
    if (endDate < startDate) return setError('The end date must be after the start date');
    if (!selected.size) return setError('Select at least one employee');
    setError('');
    generate.mutate();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className={ui.h1}>Create Payroll Period</h1>
          <p className={ui.sub}>Select employees and generate payroll preview</p>
        </div>
        <Link to="/finance/payroll" className="pt-2 text-sm text-gray-600 hover:underline">← Back to Payroll</Link>
      </div>

      {/* Step 1 */}
      <div className={ui.card}>
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Step 1: Configure Pay Period</h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className={ui.label}>Start Date *</label>
              <input type="date" className={ui.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className={ui.label}>End Date *</label>
              <input type="date" className={ui.input} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <label className={ui.label}>Payment Date *</label>
              <input type="date" className={ui.input} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>
          <div className="grid items-end gap-4 md:grid-cols-3">
            <div>
              <label className={ui.label}>Frequency</label>
              {/* Tax is worked out monthly, so Monthly is the only choice for now. */}
              <select className={ui.input} value="MONTHLY" onChange={() => undefined}>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-purple-600" checked={trackTime} onChange={(e) => setTrackTime(e.target.checked)} />
              <span>Enable Time Tracking<br />(Optional)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-purple-600" checked={trackLeave} onChange={(e) => setTrackLeave(e.target.checked)} />
              <span>Enable Leave Tracking<br />(Optional)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Step 2 */}
      <div className={ui.card}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Step 2: Select Employees</h2>
          <div className="flex gap-3 text-sm">
            <button type="button" className="text-blue-600 hover:underline" onClick={() => setSelected(new Set((staff.data ?? []).map((s) => s.id)))}>Select All</button>
            <button type="button" className="text-gray-500 hover:underline" onClick={() => setSelected(new Set())}>Deselect All</button>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex gap-3">
            <input className={`${ui.input} flex-1`} placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className={`${ui.input} w-48`} value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" aria-label="Select all shown" className="h-4 w-4 rounded border-gray-300" checked={allVisibleSelected} onChange={toggleVisible} />
                  </th>
                  <th className={ui.th}>Staff ID</th>
                  <th className={ui.th}>Name</th>
                  <th className={ui.th}>Department</th>
                  <th className={ui.th}>Position</th>
                  <th className={`${ui.th} text-right`}>Basic Salary</th>
                  <th className={`${ui.th} text-right`}>Comp Limit</th>
                </tr>
              </thead>
              <tbody>
                {staff.isLoading ? (
                  <tr><td colSpan={7}><Loading /></td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">No employees found.</td></tr>
                ) : (
                  visible.map((s) => (
                    <tr key={s.id} className="border-t border-gray-100 text-gray-800">
                      <td className="px-3 py-3">
                        <input type="checkbox" aria-label={`Select ${s.fullName}`} className="h-4 w-4 rounded border-gray-300" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">{s.staffId}</td>
                      <td className="px-3 py-3 font-semibold">{s.fullName}</td>
                      <td className="px-3 py-3 text-blue-800">{s.department}</td>
                      <td className="px-3 py-3 text-blue-800">{s.position}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">{naira(s.basicSalary)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">{naira(s.compLimit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end">
        <button type="button" className={ui.btnPurple} disabled={generate.isPending} onClick={onGenerate}>
          Generate Preview
        </button>
      </div>

      {/* Payroll Preview */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10" onMouseDown={() => setPreview(null)}>
          <div role="dialog" aria-modal="true" aria-label="Payroll Preview" className="w-full max-w-5xl rounded-lg bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-xl font-semibold text-gray-900">Payroll Preview</h3>
              <button type="button" aria-label="Close" className="rounded p-1 text-gray-500 hover:bg-gray-100" onClick={() => setPreview(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="rounded-lg bg-purple-50 p-5">
                <div className="mb-2 font-semibold text-purple-700">Summary</div>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <div className="text-sm text-gray-700">Employees</div>
                    <div className="text-2xl font-bold text-gray-900">{preview.summary.employees}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-700">Total Gross Pay</div>
                    <div className="text-2xl font-bold text-green-600">{naira(preview.summary.gross)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-700">Total Deductions</div>
                    <div className="text-2xl font-bold text-red-600">{naira(preview.summary.deductions)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-700">Total Net Pay</div>
                    <div className="text-2xl font-bold text-blue-600">{naira(preview.summary.net)}</div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-medium text-gray-600">
                      <th className="px-2 py-3 text-left">Employee</th>
                      <th className="px-2 py-3 text-right">Basic Salary</th>
                      <th className="px-2 py-3 text-right">Allowances</th>
                      <th className="px-2 py-3 text-right">Overtime</th>
                      <th className="px-2 py-3 text-right">Bonus</th>
                      <th className="px-2 py-3 text-right">Total Earnings</th>
                      <th className="px-2 py-3 text-right">Tax</th>
                      <th className="px-2 py-3 text-right">Pension</th>
                      <th className="px-2 py-3 text-right">
                        <span className="inline-flex items-center gap-1" title="NHF plus any one-time deduction. Tax and pension have their own columns.">
                          Other Deductions <Info className="h-3 w-3" />
                        </span>
                      </th>
                      <th className="px-2 py-3 text-right">Comp Excess</th>
                      <th className="px-2 py-3 text-right">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.employeeId} className="border-t border-gray-100 text-gray-900">
                        <td className="px-2 py-4">
                          <div className="font-semibold">{r.name}</div>
                          <div className="text-xs text-gray-500">{r.department}</div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-4 text-right">{naira(r.basic)}</td>
                        <td className="whitespace-nowrap px-2 py-4 text-right">{naira(r.allowances)}</td>
                        <td className="whitespace-nowrap px-2 py-4 text-right">{naira(r.overtime)}</td>
                        <td className="whitespace-nowrap px-2 py-4 text-right">{naira(r.bonus)}</td>
                        <td className="whitespace-nowrap px-2 py-4 text-right font-bold">{naira(r.gross)}</td>
                        <td className="whitespace-nowrap px-2 py-4 text-right">{naira(r.paye)}</td>
                        <td className="whitespace-nowrap px-2 py-4 text-right">{naira(r.pensionEmployee)}</td>
                        <td className="whitespace-nowrap px-2 py-4 text-right">
                          <span className="inline-flex items-center gap-1.5 text-blue-600">
                            {naira(r.otherTotal)}
                            <button type="button" aria-label={`Show deductions for ${r.name}`} onClick={() => setBreakdown(r)}>
                              <Eye className="h-4 w-4" />
                            </button>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-4 text-right text-red-600">{naira(r.compExcess)}</td>
                        <td className="whitespace-nowrap px-2 py-4 text-right font-bold text-green-600">{naira(r.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button type="button" className={ui.btnGrey} onClick={() => setPreview(null)}>Cancel</button>
              <button type="button" className={ui.btnGreen} disabled={create.isPending} onClick={() => create.mutate()}>
                Confirm &amp; Create Payroll
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && breakdown && (
        <DeductionsModal row={breakdown} variant="other" rates={preview.config} onClose={() => setBreakdown(null)} />
      )}
    </div>
  );
}