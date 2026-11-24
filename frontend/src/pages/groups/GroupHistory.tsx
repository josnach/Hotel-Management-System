import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, FileText } from 'lucide-react';

import { useGet } from '@/lib/hooks';
import { money } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { balanceClass, fmtDate, fmtTime, n } from './shared';

type FolioRow = {
  id: string; folioNo: string; guestId: string | null; guestName: string | null; room: string | null;
  checkIn: string | null; checkOut: string | null; balance: number | string;
  status: 'ACTIVE' | 'CHECKED_OUT' | 'SETTLED';
};

type History = {
  group: { name: string; contact: string | null; phone: string | null; notes: string | null };
  stats: { totalMembers: number; checkedInMembers: number; totalFolios: number; balance: number | string; status: 'Active' | 'Inactive' };
  folios: FolioRow[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
  statusDistribution: { CHECKED_IN: number; CHECKED_OUT: number; SETTLED: number };
  totals: { billed: number | string; paid: number | string; balance: number | string };
};

const FOLIO_BADGE: Record<FolioRow['status'], { label: string; cls: string }> = {
  ACTIVE: { label: 'Checked in', cls: 'bg-green-100 text-green-700' },
  CHECKED_OUT: { label: 'Checked out', cls: 'bg-yellow-100 text-yellow-800' },
  SETTLED: { label: 'Settled', cls: 'bg-slate-100 text-slate-700' },
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium">{children}</span>
  </div>
);

export default function GroupHistory() {
  const { id = '' } = useParams();
  const [page, setPage] = useState(1);
  const { data } = useGet<History>(`/groups/${id}/history`, { page });

  if (!data) return <div className="py-12 text-center text-muted-foreground">Loading…</div>;

  const { group, stats, folios, pagination, statusDistribution: dist, totals } = data;
  const from = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const to = Math.min(pagination.page * pagination.pageSize, pagination.total);

  return (
    <div className="mx-auto max-w-6xl">
      <Card className="p-0">
        <div className="flex items-start justify-between border-b p-6">
          <div>
            <h1 className="text-2xl font-bold">Group History - {group.name}</h1>
            <p className="text-sm text-muted-foreground">Complete history and financial overview</p>
          </div>
          <div className="flex gap-2">
            <Link to="/folios"><Button><FileText className="mr-2 h-4 w-4" />VIEW ALL FOLIOS</Button></Link>
            <Link to="/groups"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />BACK TO GROUPS</Button></Link>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-slate-50 p-5">
              <h2 className="mb-2 text-lg font-semibold">Group Information</h2>
              <Row label="Group Name:">{group.name}</Row>
              <Row label="Contact Person:">{group.contact || '—'}</Row>
              <Row label="Contact Phone:">{group.phone || '—'}</Row>
              <Row label="Notes:">{group.notes || '-'}</Row>
            </div>

            <div className="rounded-lg border bg-slate-50 p-5">
              <h2 className="mb-2 text-lg font-semibold">Group Statistics</h2>
              <Row label="Total Members:">{stats.totalMembers}</Row>
              <Row label="Checked-in Members:">
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">{stats.checkedInMembers}</span>
              </Row>
              <Row label="Total Folios:">{stats.totalFolios}</Row>
              <Row label="Group Balance:">
                <span className={`font-bold ${balanceClass(n(stats.balance))}`}>{money(n(stats.balance))}</span>
              </Row>
              <Row label="Current Status:">
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">{stats.status}</span>
              </Row>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between">
              <h2 className="text-lg font-semibold">Group Folios History</h2>
              <span className="text-sm text-muted-foreground">{pagination.total} total folios</span>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Folio ID</th><th className="px-4 py-3">Guest</th>
                    <th className="px-4 py-3">Room</th><th className="px-4 py-3">Check-in</th>
                    <th className="px-4 py-3">Check-out</th><th className="px-4 py-3">Balance</th>
                    <th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!folios.length && (
                    <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No folios yet.</td></tr>
                  )}
                  {folios.map((f) => {
                    const badge = FOLIO_BADGE[f.status];
                    return (
                      <tr key={f.id} className="border-t">
                        <td className="px-4 py-3 font-semibold">{f.folioNo}</td>
                        <td className="px-4 py-3">
                          {f.guestId
                            ? <Link to={`/guests/${f.guestId}`} className="text-blue-600 hover:underline">{f.guestName}</Link>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">{f.room ?? '—'}</td>
                        <td className="px-4 py-3">{fmtDate(f.checkIn)}<div className="text-xs text-muted-foreground">{fmtTime(f.checkIn)}</div></td>
                        <td className="px-4 py-3">{fmtDate(f.checkOut)}<div className="text-xs text-muted-foreground">{fmtTime(f.checkOut)}</div></td>
                        <td className={`px-4 py-3 font-medium ${balanceClass(n(f.balance))}`}>{money(n(f.balance))}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${badge.cls}`}>{badge.label}</span></td>
                        <td className="px-4 py-3">
                          <Link to={`/folios/${f.id}`} title="View folio"><Eye className="h-4 w-4 text-blue-600" /></Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Showing {from} to {to} of {pagination.total} results</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button>
                {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
                  <Button key={p} size="sm" variant={p === page ? 'default' : 'outline'} onClick={() => setPage(p)}>{p}</Button>
                ))}
                <Button variant="outline" size="sm" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}>›</Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-5">
              <h2 className="mb-2 text-lg font-semibold">Financial Summary</h2>
              <Row label="Total Billed:"><span className="text-red-600">{money(n(totals.billed))}</span></Row>
              <Row label="Total Paid:"><span className="text-green-600">{money(n(totals.paid))}</span></Row>
              <Row label="Group Balance:">
                <span className={`font-bold ${balanceClass(n(totals.balance))}`}>{money(n(totals.balance))}</span>
              </Row>
            </div>
            <div className="rounded-lg border p-5">
              <h2 className="mb-2 text-lg font-semibold">Status Distribution</h2>
              <Row label="Checked In:">{dist.CHECKED_IN}</Row>
              <Row label="Checked Out:">{dist.CHECKED_OUT}</Row>
              <Row label="Settled:">{dist.SETTLED}</Row>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}