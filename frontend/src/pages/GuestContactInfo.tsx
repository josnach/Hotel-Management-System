import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Eye, FileDown, FileSpreadsheet, FileText, Mail, Phone, Search } from 'lucide-react';
import { openPdf } from '@/lib/api';
import { useGet } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { ErrorBox, Loading } from '@/components/common';
import { Card, ReportPage, dShort } from '@/components/reports/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface G {
  id: string; firstName: string; lastName: string; email: string | null; phone: string; idType: string | null; idNumber: string | null;
  nationality: string | null; securityStatus: 'PENDING' | 'VERIFIED' | 'FLAGGED'; securityAt: string | null; checkedIn: boolean;
}
interface Resp {
  total: number; page: number; pageSize: number; pages: number;
  stats: { totalGuests: number; checkedIn: number; withEmail: number; withPhone: number };
  rows: G[];
}

const STATUS = {
  PENDING: { label: 'Pending', cls: 'bg-yellow-100 text-yellow-800' },
  VERIFIED: { label: 'Reviewed', cls: 'bg-green-100 text-green-800' },
  FLAGGED: { label: 'Flagged', cls: 'bg-red-100 text-red-800' },
} as const;

const pageWindow = (current: number, pages: number) => {
  const start = Math.max(1, Math.min(current - 2, pages - 5));
  return Array.from({ length: Math.min(6, pages) }, (_, i) => start + i);
};

export default function GuestContactInfo() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const query = useGet<Resp>('/security/guests-info', { q, page });
  const d = query.data;
  const from = d && d.total ? (d.page - 1) * d.pageSize + 1 : 0;
  const to = d ? Math.min(d.total, d.page * d.pageSize) : 0;

  const download = async (format: 'xlsx' | 'csv') => {
    try { await openPdf(`/security/guests-info/export?format=${format}&q=${encodeURIComponent(q)}`, `guest-contact-info.${format}`); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <ReportPage>
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Guest Contact Information</h1>
            <p className="mt-1 text-sm text-slate-600">All guest contact details in one place</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="h-9 w-60 rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Search by name, email, phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {query.error && <ErrorBox error={query.error} />}
        {!d ? <Loading /> : (
          <>
            <p className="mb-3 text-sm text-slate-700">Showing {from} - {to} of {d.total} guests</p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    {['Name', 'Contact Info', 'Identification', 'Nationality', 'Status', 'Actions'].map((h) => <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No guests match your search</td></tr>}
                  {d.rows.map((g) => {
                    const st = STATUS[g.securityStatus];
                    return (
                      <tr key={g.id}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">{`${g.firstName[0] ?? ''}${g.lastName[0] ?? ''}`.toUpperCase()}</span>
                            <div>
                              <div className="font-semibold text-slate-900">{g.firstName} {g.lastName}</div>
                              {g.checkedIn && <div className="flex items-center gap-1 text-xs text-green-600"><span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Checked In</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {g.email && <a href={`mailto:${g.email}`} className="flex items-center gap-1.5 text-blue-600 hover:underline"><Mail className="h-3.5 w-3.5 text-slate-400" />{g.email}</a>}
                          <a href={`tel:${g.phone}`} className="flex items-center gap-1.5 text-blue-600 hover:underline"><Phone className="h-3.5 w-3.5 text-slate-400" />{g.phone}</a>
                        </td>
                        <td className="px-4 py-3">
                          {g.idNumber ? <><div className="font-semibold text-slate-900">{g.idType ?? 'ID'}</div><div className="text-[11px] uppercase text-slate-500">{g.idNumber}</div></> : <i className="text-xs text-slate-500">Not provided</i>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{g.nationality?.trim() || 'Not specified'}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-block rounded px-2 py-0.5 text-xs font-medium', st.cls)}>{st.label}</span>
                          <div className="mt-0.5 text-xs text-slate-500">Updated: {g.securityAt ? dShort(g.securityAt) : 'Never'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Link to={`/guests/${g.id}`} title="View guest" className="inline-flex h-8 w-9 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700"><Eye className="h-4 w-4" /></Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-slate-600">Showing {from} to {to} of {d.total} results</span>
              <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm">
                <button type="button" disabled={d.page <= 1} onClick={() => setPage(d.page - 1)} className="px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                {pageWindow(d.page, d.pages).map((n) => (
                  <button key={n} type="button" onClick={() => setPage(n)} className={cn('border-l border-slate-300 px-3.5 py-1.5', n === d.page ? 'bg-slate-200 font-semibold' : 'hover:bg-slate-50')}>{n}</button>
                ))}
                <button type="button" disabled={d.page >= d.pages} onClick={() => setPage(d.page + 1)} className="border-l border-slate-300 px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <span className="text-sm text-slate-600">Last updated: {new Date(query.dataUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })} {new Date(query.dataUpdatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 outline-none hover:bg-slate-50 data-[state=open]:border-blue-500 data-[state=open]:ring-2 data-[state=open]:ring-blue-200">
                  <FileDown className="h-4 w-4" /> Export Data <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem className="justify-between gap-2" onSelect={() => void download('xlsx')}>
                    <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Export as Excel (.xlsx)</span>
                    <span className="text-xs text-slate-400">Recommended</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onSelect={() => void download('csv')}>
                    <FileSpreadsheet className="h-4 w-4 text-blue-600" /> Export as CSV (.csv)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-xs text-slate-500">Exports every guest matching the current search.</div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {([
                ['Total Guests', d.stats.totalGuests, 'border-blue-100 bg-blue-50 text-blue-700'],
                ['Checked In', d.stats.checkedIn, 'border-green-100 bg-green-50 text-green-700'],
                ['With Email', d.stats.withEmail, 'border-purple-100 bg-purple-50 text-purple-700'],
                ['With Phone', d.stats.withPhone, 'border-amber-100 bg-amber-50 text-amber-700'],
              ] as const).map(([label, v, c]) => (
                <div key={label} className={cn('rounded-lg border p-4', c)}>
                  <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{v}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </ReportPage>
  );
}