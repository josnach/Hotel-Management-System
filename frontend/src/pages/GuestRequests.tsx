import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { PageHeader, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { dt, money } from '@/lib/utils';

type Tab = 'requests' | 'feedback' | 'qr';
const KIND: Record<string, string> = { CLEAN_ROOM: 'Clean the room', TOWELS: 'Extra towels', TOILETRIES: 'Toiletries', MAINTENANCE: 'Problem to fix', LATE_CHECKOUT: 'Late checkout', OTHER: 'Other' };
const KEYS = ['/guest-requests', '/guest-requests/credentials', '/guest-requests/feedback'];

export default function GuestRequests() {
  const { user } = useAuth();
  const manager = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [tab, setTab] = useState<Tab>('requests');
  return (
    <>
      <PageHeader title="Guest Requests" subtitle="Orders and requests from the room QR code, feedback, and the cards to put in rooms" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={tab === 'requests' ? 'default' : 'outline'} onClick={() => setTab('requests')}>Requests</Button>
        {manager && <Button variant={tab === 'feedback' ? 'default' : 'outline'} onClick={() => setTab('feedback')}>Feedback</Button>}
        <Button variant={tab === 'qr' ? 'default' : 'outline'} onClick={() => setTab('qr')}>Room QR codes & PINs</Button>
      </div>
      {tab === 'requests' && <Requests />}
      {tab === 'feedback' && manager && <Feedback />}
      {tab === 'qr' && <Credentials manager={manager} />}
    </>
  );
}

function Requests() {
  // Refreshes by itself so a new guest order shows up without anyone pressing reload.
  const { data, isLoading, error } = useQuery<any[]>({ queryKey: ['/guest-requests', 'open'], queryFn: () => api.get('/guest-requests', { scope: 'open' }), refetchInterval: 20_000 });
  const rows = data ?? [];
  const accept = useAction((id: string) => api.post(`/guest-requests/${id}/accept`), { success: 'Charged to the room', invalidate: KEYS });
  const done = useAction((id: string) => api.post(`/guest-requests/${id}/done`), { invalidate: KEYS });
  const decline = useAction((v: { id: string; reason: string }) => api.post(`/guest-requests/${v.id}/decline`, { reason: v.reason }), { success: 'Declined', invalidate: KEYS });
  const fresh = rows.filter((r) => r.status === 'NEW').length;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:max-w-md"><Stat label="Waiting for you" value={fresh} tone={fresh ? 'yellow' : 'white'} /><Stat label="Being delivered" value={rows.length - fresh} /></div>
      <ListCard rows={rows} loading={isLoading} error={error} empty="Nothing waiting." cols={[
        { header: 'Room', cell: (r: any) => <div><div className="font-bold">{r.room}</div><div className="text-xs text-muted-foreground">{r.guest}</div></div> },
        { header: 'Request', cell: (r: any) => r.type === 'ORDER'
          ? <div><div className="font-medium">Food order · {money(r.estimatedTotal)} before tax</div><div className="text-xs">{(r.items ?? []).map((i: any) => `${i.quantity} × ${i.name}`).join(', ')}</div>{r.text && <div className="text-xs italic">{r.text}</div>}</div>
          : <div><div className="font-medium">{KIND[r.kind] ?? r.kind}</div>{r.text && <div className="text-xs italic">{r.text}</div>}</div> },
        { header: 'Asked', cell: (r: any) => <span className="whitespace-nowrap text-xs">{dt(r.createdAt)}</span> },
        { header: 'Status', cell: (r: any) => <Badge variant={r.status === 'NEW' ? 'yellow' : 'blue'}>{r.status === 'NEW' ? 'New' : 'Accepted'}</Badge> },
        { header: '', cell: (r: any) => (
          <div className="flex flex-wrap gap-2">
            {r.type === 'ORDER' && r.status === 'NEW' && <Button size="sm" disabled={!r.stayActive || accept.isPending} onClick={() => accept.mutate(r.id)}>Accept and charge room</Button>}
            {(r.type === 'SERVICE' || r.status === 'ACCEPTED') && <Button size="sm" variant="outline" onClick={() => done.mutate(r.id)}>{r.type === 'ORDER' ? 'Delivered' : 'Done'}</Button>}
            {r.status === 'NEW' && <Button size="sm" variant="outline" onClick={() => { const reason = prompt('Why can this not be done? The guest will see this.'); if (reason && reason.trim().length > 1) decline.mutate({ id: r.id, reason: reason.trim() }); }}>Decline</Button>}
          </div>) },
      ]} />
    </>
  );
}

function Feedback() {
  const { data, isLoading, error } = useGet<any>('/guest-requests/feedback');
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:max-w-md"><Stat label="Average rating" value={data?.average ?? '—'} /><Stat label="Ratings received" value={data?.count ?? 0} /></div>
      <ListCard rows={data?.rows} loading={isLoading} error={error} empty="No feedback yet." cols={[
        { header: 'Room', cell: (r: any) => r.room }, { header: 'Guest', cell: (r: any) => r.guest },
        { header: 'Rating', cell: (r: any) => <span className={r.rating <= 2 ? 'font-medium text-red-600' : ''}>{'★'.repeat(r.rating ?? 0)}{'☆'.repeat(5 - (r.rating ?? 0))}</span> },
        { header: 'Comment', cell: (r: any) => r.text ?? '' }, { header: 'When', cell: (r: any) => dt(r.createdAt) },
      ]} />
    </>
  );
}

function Qr({ value }: { value: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(value, { width: 220, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc); }, [value]);
  return src ? <img src={src} alt="QR code" className="h-32 w-32" /> : <div className="h-32 w-32" />;
}

function Credentials({ manager }: { manager: boolean }) {
  const { data, isLoading, error } = useGet<any[]>('/guest-requests/credentials');
  const [q, setQ] = useState('');
  const rotate = useAction((id: string) => api.post(`/guest-requests/rooms/${id}/rotate-qr`), { success: 'New QR code created. Print the new card.', invalidate: KEYS });
  const rooms = (data ?? []).filter((r) => !q || r.number.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="mb-3 flex items-center gap-3 print:hidden">
        <Input className="max-w-xs" placeholder="Find a room" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="outline" onClick={() => window.print()}>Print cards</Button>
        <span className="text-xs text-muted-foreground">Each room keeps the same QR card. Only the PIN changes with each guest, and it is shown below for the front desk.</span>
      </div>
      {isLoading && <p className="text-sm">Loading…</p>}
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 print:grid-cols-3">
        {rooms.map((r) => (
          <Card key={r.id} className="flex flex-col items-center p-3 text-center print:break-inside-avoid">
            <div className="text-lg font-bold">Room {r.number}</div>
            <div className="mb-1 text-xs text-muted-foreground">Scan to order food, request service or see your bill</div>
            <Qr value={r.url} />
            <div className="mt-2 text-xs print:hidden">{r.guest ? <>Guest: {r.guest}<div className="text-base font-bold tracking-widest">PIN {r.pin}</div></> : <span className="text-muted-foreground">Vacant</span>}</div>
            {manager && <button className="mt-1 text-xs text-red-600 underline print:hidden" onClick={() => confirm(`Replace the QR code for room ${r.number}? The printed card stops working.`) && rotate.mutate(r.id)}>Replace QR code</button>}
          </Card>))}
      </div>
    </>
  );
}
