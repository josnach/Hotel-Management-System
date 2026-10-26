import { useState } from 'react';
import { Field, PageHeader, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { dt, money, today } from '@/lib/utils';

type Tab = 'drawer' | 'shifts' | 'audit';
const KEYS = ['/shifts/current', '/shifts', '/night-audit/status', '/night-audit/preview', '/night-audit/history'];

export default function NightAudit() {
  const { user } = useAuth();
  const supervisor = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [tab, setTab] = useState<Tab>('drawer');
  return (
    <>
      <PageHeader title="Cash Drawer & Night Audit" subtitle="Count your drawer at the end of a shift; managers close the business date" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={tab === 'drawer' ? 'default' : 'outline'} onClick={() => setTab('drawer')}>My cash drawer</Button>
        {supervisor && <Button variant={tab === 'shifts' ? 'default' : 'outline'} onClick={() => setTab('shifts')}>All shifts</Button>}
        {supervisor && <Button variant={tab === 'audit' ? 'default' : 'outline'} onClick={() => setTab('audit')}>Night audit</Button>}
      </div>
      {tab === 'drawer' && <Drawer />}
      {tab === 'shifts' && supervisor && <Shifts />}
      {tab === 'audit' && supervisor && <Audit />}
    </>
  );
}

const Row = ({ k, v, bold }: { k: string; v: React.ReactNode; bold?: boolean }) => <div className={`flex justify-between gap-4 border-b py-1.5 text-sm last:border-0 ${bold ? 'font-semibold' : ''}`}><span className="text-muted-foreground">{k}</span><span>{v}</span></div>;
const tone = (v: number) => (v < 0 ? 'text-red-600 font-medium' : v > 0 ? 'text-amber-600 font-medium' : 'text-green-700');
const label = (v: number) => (v === 0 ? 'Balanced' : v < 0 ? `Short ${money(Math.abs(v))}` : `Over ${money(v)}`);

// ───────── Cashier: open and close my drawer ─────────
function Drawer() {
  const cur = useGet<any>('/shifts/current');
  const [float, setFloat] = useState('');
  const [declared, setDeclared] = useState('');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const open = useAction(() => api.post('/shifts/open', { openingFloat: Number(float || 0) }), { success: 'Shift opened', invalidate: KEYS, onSuccess: () => { setFloat(''); setResult(null); } });
  const close = useAction(() => api.post(`/shifts/${cur.data.id}/close`, { declaredCash: Number(declared), notes: notes || undefined }), { success: 'Shift closed', invalidate: KEYS, onSuccess: (r: any) => { setResult(r); setDeclared(''); setNotes(''); } });

  if (result) return (
    <Card className="max-w-md p-4">
      <div className="mb-2 text-lg font-semibold">Shift closed</div>
      <Row k="Opening float" v={money(result.openingFloat)} /><Row k="Cash received" v={money(result.cashReceived)} /><Row k="Cash paid out" v={money(result.cashPaidOut)} />
      <Row k="Expected in drawer" v={money(result.expectedCash)} /><Row k="You counted" v={money(result.declaredCash)} />
      <Row bold k="Result" v={<span className={tone(result.overShort)}>{label(result.overShort)}</span>} />
      <Row k="Card and transfer received" v={money(result.cardAndTransfer)} />
      <Button className="mt-3" variant="outline" onClick={() => setResult(null)}>Done</Button>
    </Card>
  );
  if (cur.isLoading) return null;
  if (!cur.data) return (
    <Card className="max-w-md space-y-3 p-4">
      <div className="font-semibold">Start your shift</div>
      <Field label="Opening float (cash already in the drawer)"><Input inputMode="decimal" value={float} onChange={(e) => setFloat(e.target.value)} placeholder="0" /></Field>
      <Button disabled={open.isPending} onClick={() => open.mutate(undefined)}>Open shift</Button>
    </Card>
  );
  return (
    <Card className="max-w-md space-y-3 p-4">
      <div className="flex items-center justify-between"><div className="font-semibold">{cur.data.name[0] + cur.data.name.slice(1).toLowerCase()} shift</div><Badge variant="green">Open</Badge></div>
      <Row k="Opened" v={dt(cur.data.openedAt)} /><Row k="Opening float" v={money(cur.data.openingFloat)} />
      <div className="rounded-md bg-slate-50 p-3 text-xs text-muted-foreground">Count the cash in your drawer, including the opening float, and enter the total. The system shows what it expected only after you submit.</div>
      <Field label="Cash counted in drawer"><Input inputMode="decimal" value={declared} onChange={(e) => setDeclared(e.target.value)} /></Field>
      <Field label="Notes (required if the count is not exact)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Button disabled={declared === '' || close.isPending} onClick={() => confirm('Submit the count and close this shift?') && close.mutate(undefined)}>Count and close shift</Button>
    </Card>
  );
}

// ───────── Manager: shifts for a date ─────────
function Shifts() {
  const [date, setDate] = useState(today());
  const { data, isLoading, error } = useGet<any[]>('/shifts', { date });
  const [counts, setCounts] = useState<Record<string, string>>({});
  const close = useAction((id: string) => api.post(`/shifts/${id}/close`, { declaredCash: Number(counts[id]), notes: 'Closed by manager' }), { success: 'Shift closed', invalidate: KEYS });
  return (
    <>
      <div className="mb-3 max-w-xs"><Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      <ListCard rows={data} loading={isLoading} error={error} empty="No shifts on this date." cols={[
        { header: 'Shift', cell: (r: any) => `${r.name[0] + r.name.slice(1).toLowerCase()}` },
        { header: 'Cashier', cell: (r: any) => r.cashier },
        { header: 'Opened', cell: (r: any) => dt(r.openedAt) },
        { header: 'Float', cell: (r: any) => money(r.openingFloat) },
        { header: 'Expected', cell: (r: any) => money(r.expectedCash) },
        { header: 'Counted', cell: (r: any) => (r.declaredCash === null ? '—' : money(r.declaredCash)) },
        { header: 'Result', cell: (r: any) => (r.status === 'OPEN' ? <Badge variant="yellow">Open</Badge> : <span className={tone(r.overShort)}>{label(r.overShort)}</span>) },
        { header: 'Notes', cell: (r: any) => r.notes ?? '' },
        { header: '', cell: (r: any) => r.status === 'OPEN' ? <div className="flex gap-2"><Input className="w-28" placeholder="Counted" inputMode="decimal" value={counts[r.id] ?? ''} onChange={(e) => setCounts({ ...counts, [r.id]: e.target.value })} /><Button size="sm" variant="outline" disabled={!counts[r.id]} onClick={() => close.mutate(r.id)}>Close</Button></div> : null },
      ]} />
    </>
  );
}

// ───────── Manager: night audit ─────────
function Audit() {
  const status = useGet<any>('/night-audit/status');
  const [date, setDate] = useState('');
  const d = date || status.data?.nextToClose || '';
  const preview = useGet<any>('/night-audit/preview', { date: d }, !!d);
  const history = useGet<any[]>('/night-audit/history');
  const [notes, setNotes] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const stored = useGet<any>(`/night-audit/report/${viewing}`, undefined, !!viewing);
  const close = useAction(() => api.post('/night-audit/close', { date: d, notes: notes || undefined }), { success: 'Business date closed', invalidate: KEYS, onSuccess: () => { setNotes(''); setDate(''); } });
  const r = viewing ? stored.data?.report : preview.data;
  return (
    <>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat label="Last closed date" value={status.data?.lastClosed ?? 'None yet'} />
        <Stat label="Current business date" value={status.data?.businessDate ?? ''} />
        <Field label="Report for date"><Input type="date" value={viewing ?? d} onChange={(e) => { setViewing(null); setDate(e.target.value); }} /></Field>
      </div>
      {viewing && <div className="mb-3 flex items-center gap-3 text-sm"><Badge variant="blue">Closed report</Badge>Closed {dt(stored.data?.closedAt)}<Button size="sm" variant="outline" onClick={() => setViewing(null)}>Back to current</Button></div>}
      {r && (
        <div className="mb-6 space-y-4">
          {!viewing && r.blockers?.length > 0 && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"><div className="mb-1 font-semibold">Cannot close yet</div>{r.blockers.map((b: string) => <div key={b}>• {b}</div>)}</div>}
          {r.warnings?.length > 0 && <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800"><div className="mb-1 font-semibold">Check before closing</div>{r.warnings.map((b: string) => <div key={b}>• {b}</div>)}</div>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card className="p-4"><div className="mb-2 font-semibold">Revenue</div>
              <Row k="Rooms" v={money(r.revenue.rooms)} /><Row k="Food & beverage" v={money(r.revenue.fnb)} /><Row k="Other" v={money(r.revenue.other)} /><Row bold k="Total" v={money(r.revenue.total)} />
              <Row k="VAT collected" v={money(r.revenue.vat)} /><Row k="Service charge" v={money(r.revenue.serviceCharge)} /><Row k="Complimentary given" v={money(r.revenue.complimentaryValue)} /></Card>
            <Card className="p-4"><div className="mb-2 font-semibold">Rooms</div>
              <Row k="Occupancy" v={`${r.rooms.occupancyPct}% (${r.rooms.occupied}/${r.rooms.total})`} /><Row k="Arrivals" v={r.rooms.arrivals} /><Row k="Departures" v={r.rooms.departures} />
              <Row k="Average daily rate" v={money(r.rooms.adr)} /><Row k="Revenue per available room" v={money(r.rooms.revPar)} /></Card>
            <Card className="p-4"><div className="mb-2 font-semibold">Money in</div>
              <Row k="Cash received" v={money(r.collections.cash)} /><Row k="Cash paid out" v={money(r.collections.cashPaidOut)} /><Row k="Bank, card and transfer" v={money(r.collections.bankAndCard)} />
              <Row bold k="Cash over / short" v={<span className={tone(r.cashOverShort)}>{label(r.cashOverShort)}</span>} />
              <Row k="Guest balances owing" v={`${money(r.balances.inHouseAndUnsettled)} (${r.balances.foliosOwing})`} /><Row k="City ledger" v={money(r.balances.cityLedger)} /></Card>
            <Card className="p-4"><div className="mb-2 font-semibold">Exceptions</div>
              <Row k="Voided orders" v={`${r.exceptions.voids} (${money(r.exceptions.voidValue)})`} /><Row k="Complimentary orders" v={r.exceptions.complimentaryOrders} /><Row k="Staff-credit orders" v={r.exceptions.staffCreditOrders} />
              <Row k="Cash variances" v={r.exceptions.cashVariances} /><Row k="High-risk flags open" v={r.exceptions.openHighRiskFlags} /></Card>
          </div>
          <ListCard rows={r.shifts} empty="No shifts were run on this date." cols={[
            { header: 'Shift', cell: (s: any) => s.name }, { header: 'Cashier', cell: (s: any) => s.cashier }, { header: 'Expected', cell: (s: any) => (s.expectedCash === null ? '—' : money(s.expectedCash)) },
            { header: 'Counted', cell: (s: any) => (s.declaredCash === null ? '—' : money(s.declaredCash)) },
            { header: 'Result', cell: (s: any) => (s.status === 'OPEN' ? <Badge variant="yellow">Open</Badge> : <span className={tone(s.overShort)}>{label(s.overShort)}</span>) }, { header: 'Notes', cell: (s: any) => s.notes ?? '' },
          ]} />
          {r.unshiftedCash?.length > 0 && <Card className="p-4"><div className="mb-2 font-semibold text-amber-700">Cash taken without a shift</div>{r.unshiftedCash.map((u: any) => <Row key={u.userId} k={u.name} v={money(u.cash)} />)}</Card>}
          {!viewing && (
            <Card className="space-y-3 p-4">
              <Field label="Manager's notes (optional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              <Button disabled={!r.canClose || close.isPending} onClick={() => confirm(`Close business date ${d}? Entries dated on or before it will be locked.`) && close.mutate(undefined)}>Close business date {d}</Button>
            </Card>
          )}
        </div>
      )}
      <div className="mb-2 font-semibold">Closed dates</div>
      <ListCard rows={history.data} loading={history.isLoading} empty="No dates closed yet." cols={[
        { header: 'Date', cell: (a: any) => a.date }, { header: 'Revenue', cell: (a: any) => money(a.revenue) }, { header: 'Occupancy', cell: (a: any) => `${a.occupancyPct}%` },
        { header: 'Cash over/short', cell: (a: any) => <span className={tone(a.cashOverShort)}>{label(a.cashOverShort)}</span> }, { header: 'Closed', cell: (a: any) => dt(a.closedAt) },
        { header: '', cell: (a: any) => <Button size="sm" variant="outline" onClick={() => setViewing(a.date)}>View report</Button> },
      ]} />
    </>
  );
}
