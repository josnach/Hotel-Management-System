import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FileText, Info } from 'lucide-react';
import { api, openPdf } from '@/lib/api';
import { Loading } from '@/components/common';
import DeductionsModal from '@/components/payroll/DeductionsModal';
import { downloadCsv, errText, naira, RateInfo, RunStatus, shortDate, SlipView, statusLabel, Summary, ui } from '@/lib/payrollUi';

interface Detail {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  paymentDate: string | null;
  status: RunStatus;
  config: RateInfo | null;
  payslips: SlipView[];
  summary: Summary;
}

const BAR: Record<RunStatus, string> = {
  DRAFT: 'bg-gray-100',
  APPROVED: 'bg-blue-100',
  PAID: 'bg-green-100',
};

function StatCard({ label, value, tone, border }: { label: string; value: ReactNode; tone: string; border: string }) {
  return (
    <div className={`rounded-lg border-l-4 bg-white p-5 shadow-sm ${border}`}>
      <div className="text-sm text-gray-700">{label}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

const Row = ({ label, value, tone = 'text-gray-900' }: { label: string; value: ReactNode; tone?: string }) => (
  <div className="flex items-center justify-between py-2 text-sm">
    <span className="text-gray-700">{label}</span>
    <span className={`font-semibold ${tone}`}>{value}</span>
  </div>
);

export default function PayrollDetails() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [breakdown, setBreakdown] = useState<SlipView | null>(null);

  const q = useQuery({
    queryKey: ['payroll', id],
    queryFn: () => api.get(`/finance/payroll/${id}`) as Promise<Detail>,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['payroll', id] });
    void qc.invalidateQueries({ queryKey: ['payroll-runs'] });
  };

  const approve = useMutation({
    mutationFn: () => api.post(`/finance/payroll/${id}/approve`),
    onSuccess: () => {
      setError('');
      setNotice('Payroll approved successfully.');
      refresh();
    },
    onError: (e) => setError(errText(e)),
  });

  const pay = useMutation({
    mutationFn: () => api.post(`/finance/payroll/${id}/pay`, {}),
    onSuccess: () => {
      setError('');
      setNotice('Payments processed successfully.');
      refresh();
    },
    onError: (e) => setError(errText(e)),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{errText(q.error)}</p>;

  const d = q.data;
  const s = d.summary;
  const rates: RateInfo = d.config ?? {};

  const onApprove = () => {
    if (window.confirm('Approve and post this payroll to the books? It cannot be changed afterwards.')) approve.mutate();
  };
  const onPay = () => {
    const bank = d.payslips.filter((r) => r.paymentMethod === 'BANK_TRANSFER').reduce((t, r) => t + r.net, 0);
    const cash = s.net - bank;
    if (window.confirm(`Process payments of ${naira(s.net)}?\n\nBank transfers: ${naira(bank)}\nCash: ${naira(cash)}`)) pay.mutate();
  };

  const downloadAll = async () => {
    try {
      await openPdf(`/finance/payroll/${id}/payslips.pdf`, `Payslips-${d.name}.pdf`);
    } catch (e) {
      setError(errText(e));
    }
  };

  const exportCsv = () =>
    downloadCsv(`payroll-${d.name}.csv`, [
      ['Staff ID', 'Employee', 'Department', 'Basic Salary', 'Allowances', 'Overtime', 'Bonus', 'Total Earnings', 'Tax', 'Pension', 'Other Deductions', 'Comp Excess', 'Net Pay', 'Payment Method', 'Paid'],
      ...d.payslips.map((r) => [
        r.staffId, r.name, r.department, r.basic, r.allowances, r.overtime, r.bonus, r.gross, r.paye, r.pensionEmployee,
        r.otherTotal, r.compExcess, r.net, r.paymentMethod, r.paid ? 'Yes' : 'No',
      ]),
    ]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {notice && <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</p>}
      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-6">
          <div>
            <h1 className={ui.h1}>Payroll Details</h1>
            <p className="text-sm text-gray-600">{d.name}</p>
          </div>
          <button type="button" className={ui.btnPurple} onClick={downloadAll}>
            <FileText className="h-4 w-4" />
            Download All Payslips (PDF)
          </button>
        </div>
        <div className="flex items-center gap-3">
          {d.status === 'DRAFT' && (
            <>
              <Link to={`/finance/payroll/${id}/edit`} className={ui.btnBlue}>Edit Payroll</Link>
              <button type="button" className={ui.btnGreen} disabled={approve.isPending} onClick={onApprove}>Approve Payroll</button>
            </>
          )}
          {d.status === 'APPROVED' && (
            <button type="button" className={ui.btnPurple} disabled={pay.isPending} onClick={onPay}>Process Payments</button>
          )}
          <button type="button" className={ui.btnDark} onClick={exportCsv}>Export CSV</button>
          <Link to="/finance/payroll" className="text-sm text-gray-600 hover:underline">← Back</Link>
        </div>
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-4 text-sm ${BAR[d.status]}`}>
        <span><b>Status:</b> {statusLabel(d.status)}</span>
        <span><b>Period:</b> {shortDate(d.startDate)} - {shortDate(d.endDate)}</span>
        <span><b>Payment Date:</b> {shortDate(d.paymentDate)}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total Employees" value={s.employees} tone="text-gray-900" border="border-purple-600" />
        <StatCard label="Total Gross Pay" value={naira(s.gross)} tone="text-green-600" border="border-green-500" />
        <StatCard label="Total Deductions" value={naira(s.deductions)} tone="text-red-600" border="border-red-500" />
        <StatCard label="Total Net Pay" value={naira(s.net)} tone="text-blue-600" border="border-blue-600" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className={ui.card}>
          <div className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">Deductions Summary</div>
          <div className="px-5 py-3">
            <Row label="PAYE Tax" value={naira(s.paye)} />
            <Row label="Pension (Employee)" value={naira(s.pension)} />
            <Row label="Comp Excess Deductions" value={naira(s.compExcess)} tone="text-red-600" />
          </div>
        </div>
        <div className={ui.card}>
          <div className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">Payment Summary</div>
          <div className="px-5 py-3">
            <Row label="Bank Transfers" value={`${s.bankTransfers} employees`} />
            <Row label="Cash Payments" value={`${s.cashPayments} employees`} />
            <div className="my-1 border-t border-gray-100" />
            <Row label="Paid" value={`${s.paid} employees`} tone="text-green-600" />
            <Row label="Pending" value={`${s.pending} employees`} tone="text-amber-600" />
          </div>
        </div>
      </div>

      <div className={ui.card}>
        <div className="border-b border-gray-100 px-5 py-4 font-semibold text-gray-900">Employee Payroll Details</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-medium text-gray-600">
                <th className="px-4 py-3 text-left">Employee</th>
                <th className="px-3 py-3 text-right">Basic Salary</th>
                <th className="px-3 py-3 text-right">Allowances</th>
                <th className="px-3 py-3 text-right">Overtime</th>
                <th className="px-3 py-3 text-right">Bonus</th>
                <th className="px-3 py-3 text-right">Total Earnings</th>
                <th className="px-3 py-3 text-right">Tax</th>
                <th className="px-3 py-3 text-right">Pension</th>
                <th className="px-3 py-3 text-right">
                  <span className="inline-flex items-center gap-1" title="NHF plus any one-time deduction. Click the eye for the full list.">
                    Other Deductions <Info className="h-3 w-3" />
                  </span>
                </th>
                <th className="px-3 py-3 text-right">Comp Excess</th>
                <th className="px-3 py-3 text-right">Net Pay</th>
                <th className="px-3 py-3 text-center">Payslip</th>
              </tr>
            </thead>
            <tbody>
              {d.payslips.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 text-gray-900">
                  <td className="px-4 py-4">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs text-gray-500">{r.staffId} | {r.department}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">{naira(r.basic)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">{naira(r.allowances)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">{naira(r.overtime)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">{naira(r.bonus)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right font-bold">{naira(r.gross)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">{naira(r.paye)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">{naira(r.pensionEmployee)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">
                    <span className="inline-flex items-center gap-1.5 text-blue-600">
                      {naira(r.otherTotal)}
                      <button type="button" aria-label={`Show deductions for ${r.name}`} onClick={() => setBreakdown(r)}>
                        <Eye className="h-4 w-4" />
                      </button>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-right text-red-600">{naira(r.compExcess)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right font-bold text-green-600">{naira(r.net)}</td>
                  <td className="px-3 py-4 text-center">
                    <Link to={`/finance/payroll/${id}/payslip/${r.id}`} aria-label={`Payslip for ${r.name}`} className="inline-block text-purple-600 hover:text-purple-800">
                      <FileText className="h-5 w-5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {breakdown && <DeductionsModal row={breakdown} variant="all" rates={rates} onClose={() => setBreakdown(null)} />}
    </div>
  );
}