// src/pages/StaffDetail.tsx   (route: /staff/:id)
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/common';
import { EMPLOYMENT_LABELS, Staff, staffApi } from '@/lib/staffApi';

// The recording shows an "Employee #" (e.g. EMP-2026-00003). The current staff DTO does not
// return it yet, so it is read defensively and falls back to "—" until the backend adds it.
type StaffWithEmployeeNo = Staff & { employeeNumber?: string };

const naira = (n: number) =>
  '₦' + (n ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// hireDate arrives as YYYY-MM-DD. Parse as local time so the day never shifts by timezone.
const formatDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(+d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const initials = (s: Staff) => {
  const first = s.firstName || s.fullName.split(' ')[0] || '';
  const last = s.lastName || s.fullName.split(' ').slice(1).pop() || '';
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase() || '?';
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white shadow">
      <h2 className="border-b px-6 py-4 text-lg font-semibold text-gray-900">{title}</h2>
      <div className="grid gap-x-8 gap-y-4 p-6 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, value, className = '', valueClass = 'text-gray-900' }: {
  label: string; value?: string | number | null; className?: string; valueClass?: string;
}) {
  return (
    <div className={className}>
      <div className="text-sm text-gray-600">{label}</div>
      <div className={`font-semibold ${valueClass}`}>{value === '' || value == null ? '—' : value}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="text-right font-semibold text-gray-900">{children}</span>
    </div>
  );
}

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'MANAGER'; // matches the backend

  const query = useQuery({
    queryKey: ['staff', id],
    queryFn: () => staffApi.get(id!) as Promise<StaffWithEmployeeNo>,
    enabled: Boolean(id),
  });

  if (query.isLoading) return <Loading />;

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-5xl p-6 sm:p-10">
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {(query.error as Error | null)?.message || 'Staff member not found.'}
        </div>
        <button className="mt-4 rounded-lg bg-gray-700 px-4 py-2 font-medium text-white hover:bg-gray-800" onClick={() => nav('/staff')}>
          Back to List
        </button>
      </div>
    );
  }

  const s = query.data;
  const usedPct = s.compLimit > 0 ? Math.min(100, Math.max(0, (s.compUsed / s.compLimit) * 100)) : 0;
  const active = s.status === 'Active';

  return (
    <div className="mx-auto max-w-5xl p-6 sm:p-10">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Staff Details</h1>
          <p className="mt-1 text-gray-600">View complete staff information</p>
        </div>
        <div className="flex gap-3">
          {canWrite && (
            <Link to={`/staff/${s.id}/edit`} className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
              Edit Staff
            </Link>
          )}
          <Link to="/staff" className="rounded-lg bg-gray-700 px-4 py-2 font-medium text-white hover:bg-gray-800">
            Back to List
          </Link>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        {/* Left column */}
        <div className="space-y-6">
          <section className="rounded-xl bg-white p-6 shadow">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-purple-100 text-3xl font-bold text-purple-700" aria-hidden="true">
                {initials(s)}
              </div>
              <h2 className="mt-4 text-xl font-bold text-gray-900">{s.fullName}</h2>
              <p className="text-gray-600">{s.position || '—'}</p>
              <p className="text-sm text-gray-500">{s.department || '—'}</p>
            </div>

            <div className="mt-5 border-t pt-4">
              <Row label="Staff ID">{s.staffId || '—'}</Row>
              <Row label="Employee #">{s.employeeNumber || '—'}</Row>
              <Row label="Status">
                <span className={`rounded-full px-2.5 py-1 text-xs font-normal ${active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {s.status}
                </span>
              </Row>
              <Row label="Employment Type">{EMPLOYMENT_LABELS[s.employmentType] ?? s.employmentType}</Row>
              <Row label="Hire Date">{formatDate(s.hireDate)}</Row>
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="mb-3 font-semibold text-gray-900">Complimentary Allowance</h2>
            <Row label="Monthly Limit:">{naira(s.compLimit)}</Row>
            <Row label="Used This Month:"><span className="text-orange-600">{naira(s.compUsed)}</span></Row>
            <Row label="Remaining:"><span className="text-green-600">{naira(s.compRemaining)}</span></Row>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200" role="progressbar"
              aria-label="Complimentary allowance used this month" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedPct)}>
              <div className="h-full rounded-full bg-orange-500" style={{ width: `${usedPct}%` }} />
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card title="Contact Information">
            <Field label="Email" value={s.email} />
            <Field label="Phone" value={s.phone} />
            <Field label="Address" value={s.address} className="sm:col-span-2" />
          </Card>

          <Card title="Compensation Details">
            <Field label="Basic Salary" value={naira(s.basicSalary)} valueClass="text-green-600" />
            <Field label="Hourly Rate" value={naira(s.hourlyRate)} />
            <Field label="Meal Allowance" value={naira(s.mealAllowance)} />
            <Field label="Transport Allowance" value={naira(s.transportAllowance)} />
            <Field label="Housing Allowance" value={naira(s.housingAllowance)} />
          </Card>

          <Card title="Bank Information">
            <Field label="Bank Name" value={s.bankName} />
            <Field label="Account Number" value={s.accountNumber} />
            <Field label="Account Name" value={s.accountName} />
          </Card>

          <Card title="Emergency Contact">
            <Field label="Name" value={s.emergencyName} />
            <Field label="Phone" value={s.emergencyPhone} />
            <Field label="Relationship" value={s.emergencyRelationship} />
          </Card>
        </div>
      </div>
    </div>
  );
}