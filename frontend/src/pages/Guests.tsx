import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Eye, LogOut, Search } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { d, money } from '@/lib/utils';
import { PageHeader, PrintButton } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CheckoutDialog } from './InHouse';
import { GuestCrmCard } from '@/components/GuestCrmCard';

export default function Guests() {
  const [sp] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(sp.get('status') ?? 'CHECKED_IN');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<any>(null);
  const { data, isLoading } = useGet('/guests', { q, status: status === 'ALL' ? undefined : status, page });
  const filters = [['CHECKED_IN', 'Checked In'], ['ALL', 'All Guests'], ['CHECKED_OUT', 'Checked Out']];
  return (
    <>
      <PageHeader title="Guests Management" subtitle="Manage all guest information and status" />
      <Card className="mb-4 flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-[280px] flex-1"><label className="mb-1 block text-xs font-medium">Search by Name, Room, or Group</label>
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search guest name, room number, or group…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div></div>
        <div><label className="mb-1 block text-xs font-medium">Filter by Status</label>
          <div className="flex gap-2">{filters.map(([v, l]) => <Button key={v} size="sm" variant={status === v ? 'success' : 'outline'} onClick={() => { setStatus(v); setPage(1); }}>{l}</Button>)}</div></div>
      </Card>
      <p className="mb-2 text-sm text-muted-foreground">Showing {data?.rows?.length ?? 0} of {data?.total ?? 0} guests</p>
      <ListCard rows={data?.rows} loading={isLoading} cols={[
        { header: 'Guest Name', cell: (g: any) => <div><div className="font-semibold uppercase">{g.firstName} {g.lastName} {g.isVip && <Badge variant="yellow">VIP</Badge>} {g.isBlacklisted && <Badge variant="red">Blacklisted</Badge>}</div><div className="text-xs text-muted-foreground">{g.idNumber}</div></div> },
        { header: 'Contact', cell: (g: any) => g.phone },
        { header: 'Room', cell: (g: any) => g.room ? <Badge variant="green">{g.room}</Badge> : '—' },
        { header: 'Group', cell: (g: any) => g.group ?? '—' },
        { header: 'Status', cell: (g: any) => g.status ? <Badge variant={statusVariant(g.status)}>{g.status === 'CHECKED_IN' ? 'Checked In' : 'Checked Out'}</Badge> : '—' },
        { header: 'Balance', cell: (g: any) => <span className="font-semibold text-red-600">{money(g.balance)}</span> },
        { header: 'Actions', cell: (g: any) => <div className="flex gap-3"><Link to={`/guests/${g.id}`} className="text-blue-700"><Eye className="h-4 w-4" /></Link>{g.status === 'CHECKED_IN' && <button className="text-orange-600" onClick={() => setTarget({ id: g.stayId, guest: g, room: { number: g.room } })}><LogOut className="h-4 w-4" /></button>}</div> },
      ]} />
      <div className="mt-3 flex justify-end gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(data?.rows?.length ?? 0) < 20} onClick={() => setPage(page + 1)}>Next</Button></div>
      <CheckoutDialog stay={target} onClose={() => setTarget(null)} />
    </>
  );
}

export function GuestDetail() {
  const { id } = useParams();
  const { data: g } = useGet(`/guests/${id}`);
  if (!g) return null;
  const cur = g.stays?.[0];
  const Row = ({ k, v }: { k: string; v: any }) => <div><div className="text-xs text-muted-foreground">{k}</div><div className="font-medium">{v || 'Not provided'}</div></div>;
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white">
        <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 font-bold">{g.firstName[0]}{g.lastName[0]}</div><div><div className="text-xl font-bold">{g.firstName} {g.lastName}</div><div className="text-sm opacity-80">Guest Details</div></div></div>
        <Button variant="secondary" asChild><Link to="/guests">Back to Guests</Link></Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <Card><CardHeader><CardTitle>Guest Information</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-4"><Row k="Full Name" v={`${g.firstName} ${g.lastName}`} /><Row k="ID Type" v={g.idType} /><Row k="Email" v={g.email} /><Row k="ID Number" v={g.idNumber} /><Row k="Phone" v={g.phone} /><Row k="Address" v={g.address} /></CardContent></Card>
          <Card><CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader><CardContent>
            <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="py-1 text-left">Date</th><th className="text-left">Description</th><th className="text-left">Type</th><th className="text-right">Amount</th></tr></thead><tbody>
              {g.recentTransactions.map((t: any) => <tr key={t.id} className="border-t"><td className="py-2">{d(t.createdAt)}</td><td>{t.description}</td><td><Badge variant={t.type === 'CREDIT' ? 'green' : 'red'}>{t.type === 'CREDIT' ? 'Credit' : 'Debit'}</Badge></td><td className="text-right">{money(t.bill || t.payment)}</td></tr>)}</tbody></table>
          </CardContent></Card>
        </div>
        <div className="space-y-4">
          <GuestCrmCard id={g.id} />
          <Card><CardHeader><CardTitle>Guest Status</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Check-in Status</span><Badge>{g.checkInStatus === 'CHECKED_IN' ? 'Checked In' : 'Checked Out'}</Badge></div><div className="flex justify-between"><span className="text-muted-foreground">Group Status</span><Badge>{g.groupStatus}</Badge></div><div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{d(g.createdAt)}</span></div></CardContent></Card>
          <Card><CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader><CardContent className="space-y-2">
            {cur?.folio && <Button className="w-full" asChild><Link to={`/folios/${cur.folio.id}`}>View Folio</Link></Button>}
            <PrintButton label="Print Folio" />
            <Button variant="secondary" className="w-full bg-yellow-100 text-yellow-800">Edit Guest</Button>
            <Button className="w-full" asChild><Link to="/reports/security">Create Security Report</Link></Button>
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}
