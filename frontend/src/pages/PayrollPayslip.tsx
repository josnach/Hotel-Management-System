import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Mail, Printer } from 'lucide-react';
import { api, openPdf } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/common';
import { errText, methodLabel, naira, shortDate, SlipView, ui } from '@/lib/payrollUi';

interface Detail {
  slip: SlipView;
  email: string;
  period: { id: string; name: string; startDate: string; endDate: string; paymentDate: string | null; status: string };
  hotel: { name: string; address: string; phone: string };
}

const Info = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-sm text-gray-500">{label}</div>
    <div className="font-semibold text-gray-900">{value || '—'}</div>
  </div>
);

const Line = ({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) => (
  <div className="flex items-center justify-between py-1.5 text-sm">
    <span className="text-gray-600">{label}</span>
    <span className={`font-semibold ${tone}`}>{naira(value)}</span>
  </div>
);

export default function PayrollPayslip() {
  const { id = '', slipId = '' } = useParams();
  const { user } = useAuth();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const q = useQuery({
    queryKey: ['payslip', slipId],
    queryFn: () => api.get(`/finance/payroll/payslips/${slipId}`) as Promise<Detail>,
  });

  const email = useMutation({
    mutationFn: () => api.post(`/finance/payroll/payslips/${slipId}/email`) as Promise<{ to: string }>,
    onSuccess: (r) => {
      setError('');
      setNotice(`Payslip emailed to ${r.to}.`);
    },
    onError: (e) => {
      setNotice('');
      setError(errText(e));
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{errText(q.error)}</p>;

  const { slip: s, period: p, hotel } = q.data;
  const generatedAt = new Date()
    .toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    .replace(/, (\d{1,2}:\d{2}\s[AP]M)$/, ' $1');

  const onEmail = () => {
    if (window.confirm(`Email this payslip to ${q.data.email || 'the employee'}?`)) email.mutate();
  };

  const download = async () => {
    try {
      await openPdf(`/finance/payroll/payslips/${slipId}/pdf?download=1`, `Payslip-${p.name}-${s.name}.pdf`);
    } catch (e) {
      setError(errText(e));
    }
  };

  const earnings: [string, number][] = [
    ['Basic Salary', s.basic], ['Meal Allowance', s.meal], ['Transport Allowance', s.transport], ['Housing Allowance', s.housing],
    ['Other Allowances', s.otherAllow], ['Overtime', s.overtime], ['Bonus', s.bonus],
  ];
  const deductions: [string, number][] = [
    ['PAYE Tax', s.paye], ['Pension (Employee)', s.pensionEmployee], ['NHF', s.nhf],
    ['Other Deductions', s.otherDeductions], ['Complimentary Excess', s.compExcess],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex flex-wrap justify-end gap-3">
        <Link to={`/finance/payroll/${id}`} className="inline-flex items-center rounded-lg bg-gray-500 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600">
          ← Back to Payroll
        </Link>
        <button type="button" className={ui.btnBlue} onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </button>
        <button type="button" className={ui.btnGreen} onClick={download}>
          <Download className="h-4 w-4" />
          Download PDF
        </button>
        <button type="button" className={ui.btnPurple} disabled={email.isPending} onClick={onEmail}>
          <Mail className="h-4 w-4" />
          Email Payslip
        </button>
      </div>

      {notice && <p className="no-print rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{notice}</p>}
      {error && <p className="no-print rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="flex items-start justify-between bg-slate-900 px-7 py-6 text-white">
          <div>
            <div className="text-2xl font-bold">PAYSLIP</div>
            <div className="text-sm text-gray-300">Payroll Period: {p.name}</div>
          </div>
          <div className="text-right text-sm">
            <div className="text-lg font-bold">{hotel.name}</div>
            {hotel.address && <div className="text-gray-300">{hotel.address}</div>}
            {hotel.phone && <div className="text-gray-300">Tel: {hotel.phone}</div>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-x-6 gap-y-4 border-b border-gray-100 px-7 py-6">
          <Info label="Employee Name" value={s.name} />
          <Info label="Employee ID" value={s.staffId} />
          <Info label="Department" value={s.department} />
          <Info label="Position" value={s.position} />
          <Info label="Pay Period" value={`${shortDate(p.startDate)} - ${shortDate(p.endDate)}`} />
          <Info label="Payment Date" value={shortDate(p.paymentDate)} />
        </div>

        <div className="grid gap-8 px-7 py-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 border-b border-gray-100 pb-2 font-semibold text-gray-900">Earnings</h3>
            {earnings.filter(([k, v]) => v > 0 || k === 'Basic Salary').map(([k, v]) => <Line key={k} label={k} value={v} />)}
            <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
              <span className="font-bold text-gray-900">Total Earnings</span>
              <span className="font-bold text-green-600">{naira(s.gross)}</span>
            </div>
          </div>
          <div>
            <h3 className="mb-2 border-b border-gray-100 pb-2 font-semibold text-gray-900">Deductions</h3>
            {deductions.filter(([k, v]) => v > 0 || k === 'PAYE Tax' || k === 'Pension (Employee)').map(([k, v]) => <Line key={k} label={k} value={v} />)}
            <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
              <span className="font-bold text-gray-900">Total Deductions</span>
              <span className="font-bold text-red-600">{naira(s.deductions)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between bg-gray-50 px-7 py-5">
          <div>
            <div className="text-lg font-bold text-gray-900">Net Pay</div>
            <div className="text-sm text-gray-500">Amount payable to employee</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-green-600">{naira(s.net)}</div>
            <div className="text-xs text-gray-500">{methodLabel(s.paymentMethod)}</div>
          </div>
        </div>

        <div className="px-7 py-6">
          <h3 className="mb-3 font-semibold text-gray-900">Payment Information</h3>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <Info label="Payment Method" value={methodLabel(s.paymentMethod)} />
            <Info label="Bank" value={s.bankName} />
            <Info label="Account Number" value={s.accountNumber} />
          </div>
        </div>

        <div className="border-t border-gray-100 px-7 py-4 text-center text-xs text-gray-500">
          <div>This is a computer-generated document. No signature is required.</div>
          <div>Generated on {generatedAt} by {user?.fullName ?? user?.username}</div>
        </div>
      </div>
    </div>
  );
}