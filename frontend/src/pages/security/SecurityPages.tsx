import { type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, Clock, Eye, FileText, Globe, List, PlusCircle, Shield, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { ErrorBox, Loading } from '@/components/common';
import { Card, PageTitle, Pill, ReportPage, daysAgo, dShort, dtShort, inputCls } from '@/components/reports/ui';

interface DssReport { id: string; reportNo: string; guestId: string; guestName: string; nationality: string; passportId: string | null; status: 'PENDING' | 'SUBMITTED' | 'FLAGGED'; submittedAt: string | null; room: string }
interface LogRow { id: string; action: string; user: string | null; at: string; detail: string }
interface DssData { date: string; stats: { totalGuests: number; foreignGuests: number; submitted: number; pending: number }; reports: DssReport[]; logs: LogRow[] }
interface Dash {
  date: string;
  stats: { dssReports: number; submitted: number; submissionRate: number; securityIncidents: number; securityLogs: number };
  pendingReports: { id: string; reportNo: string; guestId: string; guestName: string; room: string; checkInAt: string }[];
}

const dLong = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const STATUS = { PENDING: { tone: 'yellow', label: 'Pending' }, SUBMITTED: { tone: 'green', label: 'Submitted' }, FLAGGED: { tone: 'red', label: 'Flagged' } } as const;
const KEYS = ['/security/dss-reports', '/security/dashboard'];

function BorderStat({ label, value, sub, border, title, circle, icon, upper }: {
  label: string; value: ReactNode; sub?: string; border: string; title?: string; circle: string; icon: ReactNode; upper?: boolean;
}) {
  return (
    <div className={cn('flex items-start justify-between rounded-lg border-l-4 bg-white p-5 shadow-md', border)}>
      <div>
        <div className={cn(upper ? 'text-xs font-bold uppercase tracking-wide' : 'text-sm text-slate-700', title)}>{label}</div>
        <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
        {sub && <div className="mt-2 text-xs text-slate-500">{sub}</div>}
      </div>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', circle)}>{icon}</div>
    </div>
  );
}

const pageBtn = 'inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-white hover:brightness-95';

/* ───────────── DSS Reports ───────────── */
export function DssReports() {
  const [date, setDate] = useState(daysAgo(0));
  const q = useGet<DssData>('/security/dss-reports', { date });
  const d = q.data;
  const submit = useAction((v: { id: string }) => api.post(`/security/guests/${v.id}/report`, { status: 'VERIFIED' }), { success: 'DSS report submitted', invalidate: KEYS });

  return (
    <ReportPage wide>
      <PageTitle title="DSS Reports" sub="Department of State Services reporting and management">
        <input type="date" className={cn(inputCls, 'h-10 w-44')} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <Link to={`/security/dss-reports/daily?date=${date}`} className={cn(pageBtn, 'h-10 bg-blue-600')}><CalendarDays className="h-4 w-4" /> Daily Report</Link>
      </PageTitle>

      {q.error && <ErrorBox error={q.error} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BorderStat label="Total Guests Today" value={d?.stats.totalGuests ?? 0} border="border-blue-500" circle="bg-blue-100 text-blue-600" icon={<Users className="h-5 w-5" />} />
        <BorderStat label="Foreign Guests" value={d?.stats.foreignGuests ?? 0} border="border-yellow-400" circle="bg-yellow-100 text-yellow-600" icon={<Globe className="h-5 w-5" />} />
        <BorderStat label="Submitted Reports" value={d?.stats.submitted ?? 0} border="border-green-500" circle="bg-green-100 text-green-600" icon={<CheckCircle2 className="h-5 w-5" />} />
        <BorderStat label="Pending Reports" value={d?.stats.pending ?? 0} border="border-red-500" circle="bg-red-100 text-red-600" icon={<Clock className="h-5 w-5" />} />
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 pb-4 pt-5">
          <h2 className="text-lg font-semibold text-slate-900">Recent DSS Reports</h2>
          <p className="text-sm text-slate-600">Reports created for {dLong(date)}</p>
        </div>
        {!d ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  {['Report #', 'Guest', 'Nationality', 'Passport/ID', 'Status', 'Submitted', 'Actions'].map((h) => <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {d.reports.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-mono text-xs font-semibold">{r.reportNo}</td>
                    <td className="px-5 py-3"><div className="font-medium">{r.guestName}</div><div className="text-xs text-slate-500">Room {r.room}</div></td>
                    <td className="px-5 py-3 text-slate-600">{r.nationality}</td>
                    <td className="px-5 py-3">{r.passportId ?? <i className="text-slate-400">Not provided</i>}</td>
                    <td className="px-5 py-3"><Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill></td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">{r.submittedAt ? dtShort(r.submittedAt) : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Link to={`/guests/${r.guestId}`} title="View guest" className="text-blue-600 hover:text-blue-800"><Eye className="h-4 w-4" /></Link>
                        {r.status !== 'SUBMITTED' && (
                          <button type="button" disabled={submit.isPending} onClick={() => submit.mutate({ id: r.guestId })} className="rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60">Submit</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.reports.length === 0 && (
              <div className="flex flex-col items-center py-12 text-center">
                <FileText className="h-8 w-8 text-slate-400" />
                <div className="mt-3 text-lg text-slate-400">No DSS reports found for today</div>
                <div className="mt-1 text-sm text-slate-400">Create a DSS report for a guest to get started</div>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-start justify-between bg-yellow-50 px-5 py-4">
            <div><h2 className="text-base font-semibold text-slate-900">Recent Security Incidents</h2><p className="text-sm text-slate-600">Today's reported incidents</p></div>
            <Link to="/security/incidents" className="text-sm font-medium text-amber-700 hover:underline">View All</Link>
          </div>
          <div className="flex flex-col items-center py-8 text-sm text-slate-500"><CheckCircle2 className="mb-2 h-6 w-6 text-slate-500" />No security incidents reported today</div>
        </Card>
        <Card className="overflow-hidden">
          <div className="flex items-start justify-between bg-blue-50 px-5 py-4">
            <div><h2 className="text-base font-semibold text-slate-900">Recent Security Logs</h2><p className="text-sm text-slate-600">Today's security activity</p></div>
            <Link to="/security/logs" className="text-sm font-medium text-blue-700 hover:underline">View All</Link>
          </div>
          {d?.logs.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.logs.map((l) => <li key={l.id} className="px-5 py-2.5"><div>{l.detail}</div><div className="text-xs text-slate-500">{l.user ?? 'System'} · {dtShort(l.at)}</div></li>)}
            </ul>
          ) : (
            <div className="flex flex-col items-center py-8 text-sm text-slate-500"><ClipboardList className="mb-2 h-6 w-6 text-slate-500" />No security logs recorded today</div>
          )}
        </Card>
      </div>
    </ReportPage>
  );
}

/* ───────────── Security Dashboard ───────────── */
export function SecurityDashboard() {
  const q = useGet<Dash>('/security/dashboard');
  const d = q.data;
  const today = d?.date ?? daysAgo(0);

  return (
    <ReportPage wide>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-800 px-5 py-4 text-white">
          <Shield className="h-6 w-6" /><h1 className="text-2xl font-bold">Security Dashboard</h1>
        </div>
        <div className="space-y-5 p-5">
          {q.error && <ErrorBox error={q.error} />}
          <h2 className="text-base font-medium text-slate-700">Today's Statistics ({dLong(today)})</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <BorderStat upper label="DSS Reports" value={d?.stats.dssReports ?? 0} border="border-blue-500" title="text-blue-700" circle="bg-blue-100 text-blue-600" icon={<FileText className="h-5 w-5" />} />
            <BorderStat upper label="Submitted Reports" value={d?.stats.submitted ?? 0} sub={`${d?.stats.submissionRate ?? 0}% submission rate`} border="border-green-500" title="text-green-600" circle="bg-green-100 text-green-600" icon={<CheckCircle2 className="h-5 w-5" />} />
            <BorderStat upper label="Security Incidents" value={d?.stats.securityIncidents ?? 0} border="border-amber-500" title="text-amber-700" circle="bg-yellow-100 text-yellow-600" icon={<AlertTriangle className="h-5 w-5" />} />
            <BorderStat upper label="Security Logs" value={d?.stats.securityLogs ?? 0} sub="Activity logs recorded" border="border-cyan-500" title="text-cyan-700" circle="bg-cyan-100 text-cyan-600" icon={<ClipboardList className="h-5 w-5" />} />
          </div>

          <div>
            <h2 className="mb-3 text-base font-medium text-slate-700">Quick Actions</h2>
            <div className="flex flex-wrap gap-2">
              <Link to="/security/dss-reports" className={cn(pageBtn, 'h-8 bg-blue-600')}><FileText className="h-4 w-4" /> DSS Reports</Link>
              <Link to="/security/dss-reports" className={cn(pageBtn, 'h-8 bg-green-600')}><PlusCircle className="h-4 w-4" /> New DSS Report</Link>
              <Link to="/security/incidents" className={cn(pageBtn, 'h-8 bg-[#c8920b]')}><AlertTriangle className="h-4 w-4" /> Report Incident</Link>
              <Link to="/security/logs" className={cn(pageBtn, 'h-8 bg-[#139fb0]')}><ClipboardList className="h-4 w-4" /> View Logs</Link>
              <Link to={`/security/dss-reports/daily?date=${today}`} className={cn(pageBtn, 'h-8 bg-slate-600')}><CalendarDays className="h-4 w-4" /> Daily Report</Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 bg-gradient-to-r from-yellow-500 to-amber-600 px-4 py-3 font-semibold text-white"><AlertTriangle className="h-4 w-4" /> Recent Security Incidents (Last 7 Days)</div>
              <div className="flex flex-col items-center py-12 text-sm text-slate-500">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600"><CheckCircle2 className="h-6 w-6" /></span>No recent security incidents
              </div>
              <div className="bg-slate-50 px-4 py-3"><Link to="/security/incidents" className={cn(pageBtn, 'h-8 bg-[#c8920b]')}>View All Incidents</Link></div>
            </Card>
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-red-700 px-4 py-3 font-semibold text-white"><Clock className="h-4 w-4" /> Pending DSS Reports (Last 3 Days)</div>
              {d?.pendingReports.length ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {d.pendingReports.map((r) => (
                    <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
                      <div><div className="font-medium">{r.guestName}</div><div className="text-xs text-slate-500">Room {r.room} · {r.reportNo}</div></div>
                      <Link to={`/guests/${r.guestId}`} className="text-blue-600"><Eye className="h-4 w-4" /></Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center py-12 text-sm text-slate-500">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600"><CheckCircle2 className="h-6 w-6" /></span>All DSS reports are submitted
                </div>
              )}
              <div className="bg-slate-50 px-4 py-3"><Link to="/security/dss-reports" className={cn(pageBtn, 'h-8 bg-slate-600')}><List className="h-4 w-4" /> All DSS Reports</Link></div>
            </Card>
          </div>
        </div>
      </Card>
    </ReportPage>
  );
}

/* ───────────── Placeholders (as in the original) ───────────── */
function Placeholder({ title, sub, icon, heading, text, right, children }: { title: string; sub: string; icon: ReactNode; heading: string; text: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <ReportPage wide>
      <PageTitle title={title} sub={sub}>{right}</PageTitle>
      <Card className="px-6 py-10 text-center">
        <div className="mb-3 flex justify-center">{icon}</div>
        <h2 className="text-lg font-semibold text-slate-900">{heading}</h2>
        <p className="mt-1 text-sm text-slate-600">{text}</p>
        {children}
        <Link to="/security/dashboard" className={cn(pageBtn, 'mt-5 bg-blue-600')}><ArrowLeft className="h-4 w-4" /> Back to Security Dashboard</Link>
      </Card>
    </ReportPage>
  );
}

export function SecurityIncidents() {
  return (
    <Placeholder
      title="Security Incidents" sub="Report and manage security incidents"
      icon={<AlertTriangle className="h-8 w-8 text-yellow-500" />}
      heading="Security Incidents Management" text="This section is under development. You can view and manage security incidents here."
      right={<button type="button" onClick={() => toast.info('Incident reporting is not available yet.')} className={cn(pageBtn, 'h-10 bg-[#c8920b]')}><PlusCircle className="h-4 w-4" /> Report Incident</button>}
    />
  );
}

export function SecurityLogs() {
  return (
    <Placeholder
      title="Security Logs" sub="View security activity logs"
      icon={<ClipboardList className="h-8 w-8 text-blue-600" />}
      heading="Security Logs" text="This section is under development. You can view all security activity logs here."
    />
  );
}

export function DailyDssReport() {
  const [sp, setSp] = useSearchParams();
  const date = sp.get('date') ?? daysAgo(0);
  const q = useGet<DssData>('/security/dss-reports', { date });
  const s = q.data?.stats;
  const tiles = [
    ['Total Reports', q.data?.reports.length ?? 0, 'bg-blue-50 text-blue-600'],
    ['Submitted', s?.submitted ?? 0, 'bg-green-50 text-green-600'],
    ['Foreign Guests', s?.foreignGuests ?? 0, 'bg-yellow-50 text-yellow-700'],
    ['Pending', s?.pending ?? 0, 'bg-red-50 text-red-600'],
  ] as const;
  return (
    <Placeholder
      title="Daily DSS Report" sub={`Comprehensive report for ${dLong(date)}`}
      icon={<FileText className="h-8 w-8 text-green-500" />}
      heading="Daily DSS Report" text="This section is under development. You can view and print daily DSS reports here."
      right={<>
        <input type="date" className={cn(inputCls, 'h-10 w-44')} value={date} onChange={(e) => e.target.value && setSp({ date: e.target.value })} />
        <button type="button" onClick={() => window.print()} className={cn(pageBtn, 'h-10 bg-red-600')}><FileText className="h-4 w-4" /> Print PDF</button>
      </>}
    >
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {tiles.map(([label, v, c]) => (
          <div key={label} className={cn('rounded-lg py-3', c)}><div className="text-sm">{label}</div><div className="text-xl font-bold text-slate-900">{v}</div></div>
        ))}
      </div>
    </Placeholder>
  );
}