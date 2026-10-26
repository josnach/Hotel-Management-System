import { useState } from 'react';
import { Field, PageHeader, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { money, today } from '@/lib/utils';

type Tab = 'log' | 'buy' | 'report' | 'setup';
const KEYS = ['/power/day', '/power/purchases', '/power/report', '/power/generators'];
const litres = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString('en-NG', { maximumFractionDigits: 1 })} L`);
const ago = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };

export default function PowerCosts() {
  const { user } = useAuth();
  const accountant = user?.role !== 'MAINTENANCE'; // maintenance staff only enter the daily readings
  const [tab, setTab] = useState<Tab>('log');
  return (
    <>
      <PageHeader title="Power & Diesel" subtitle="Generator hours, tank readings and what diesel costs per occupied room" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={tab === 'log' ? 'default' : 'outline'} onClick={() => setTab('log')}>Daily readings</Button>
        {accountant && <Button variant={tab === 'buy' ? 'default' : 'outline'} onClick={() => setTab('buy')}>Diesel purchases</Button>}
        {accountant && <Button variant={tab === 'report' ? 'default' : 'outline'} onClick={() => setTab('report')}>Report</Button>}
        {accountant && <Button variant={tab === 'setup' ? 'default' : 'outline'} onClick={() => setTab('setup')}>Generators</Button>}
      </div>
      {tab === 'log' && <Daily />}
      {tab === 'buy' && accountant && <Purchases />}
      {tab === 'report' && accountant && <Report />}
      {tab === 'setup' && accountant && <Setup />}
    </>
  );
}

function Daily() {
  const [date, setDate] = useState(today());
  const gens = useGet<any[]>('/power/generators');
  const day = useGet<any>('/power/day', { date });
  if (!gens.data || !day.data) return <p className="text-sm">Loading…</p>;
  return <DailyForm key={date + JSON.stringify(day.data)} date={date} setDate={setDate} gens={gens.data.filter((g) => g.isActive)} day={day.data} />;
}
function DailyForm({ date, setDate, gens, day }: { date: string; setDate: (d: string) => void; gens: any[]; day: any }) {
  const [hours, setHours] = useState<Record<string, string>>(Object.fromEntries(day.runs.map((r: any) => [r.generatorId, String(r.hours)])));
  const [tank, setTank] = useState(day.tankLitres === null ? '' : String(day.tankLitres));
  const save = useAction(() => api.post('/power/day', { date, runs: gens.filter((g) => hours[g.id] !== undefined && hours[g.id] !== '').map((g) => ({ generatorId: g.id, hours: Number(hours[g.id]) })), tankLitres: tank === '' ? null : Number(tank) }), { success: 'Readings saved', invalidate: KEYS });
  return (
    <Card className="max-w-lg space-y-3 p-4">
      <Field label="Date"><Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      {gens.length === 0 && <p className="text-sm text-muted-foreground">No generators have been set up yet. Ask the accountant to add them under Generators.</p>}
      {gens.map((g) => <Field key={g.id} label={`${g.name}: hours run`}><Input inputMode="decimal" value={hours[g.id] ?? ''} onChange={(e) => setHours({ ...hours, [g.id]: e.target.value })} /></Field>)}
      <Field label="Diesel left in the tank (litres)" hint="Measure with the dip stick or gauge, at the same time each day"><Input inputMode="decimal" value={tank} onChange={(e) => setTank(e.target.value)} /></Field>
      <Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save readings</Button>
    </Card>
  );
}

function Purchases() {
  const [from, setFrom] = useState(ago(30)); const [to, setTo] = useState(today());
  const rows = useGet<any[]>('/power/purchases', { from, to });
  const [f, setF] = useState({ date: today(), litres: '', pricePerLitre: '', supplier: '', paidFrom: 'BANK', reference: '' });
  const total = Number(f.litres || 0) * Number(f.pricePerLitre || 0);
  const add = useAction(() => api.post('/power/purchases', { ...f, litres: Number(f.litres), pricePerLitre: Number(f.pricePerLitre), supplier: f.supplier || undefined, reference: f.reference || undefined }), { success: 'Purchase recorded in the books', invalidate: KEYS, onSuccess: () => setF({ ...f, litres: '', reference: '' }) });
  return (
    <>
      <Card className="mb-4 max-w-3xl p-4">
        <div className="mb-3 font-semibold">Record a diesel purchase</div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Date"><Input type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Litres bought"><Input inputMode="decimal" value={f.litres} onChange={(e) => setF({ ...f, litres: e.target.value })} /></Field>
          <Field label="Price per litre (₦)"><Input inputMode="decimal" value={f.pricePerLitre} onChange={(e) => setF({ ...f, pricePerLitre: e.target.value })} /></Field>
          <Field label="Supplier"><Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
          <Field label="Paid from"><NativeSelect value={f.paidFrom} onChange={(e) => setF({ ...f, paidFrom: e.target.value })}><option value="BANK">Bank</option><option value="CASH">Cash</option></NativeSelect></Field>
          <Field label="Receipt / reference"><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        </div>
        <div className="mt-3 flex items-center gap-4"><Button disabled={!Number(f.litres) || !Number(f.pricePerLitre) || add.isPending} onClick={() => add.mutate(undefined)}>Record purchase</Button>{total > 0 && <span className="text-sm">Total {money(total)}</span>}</div>
      </Card>
      <div className="mb-3 flex gap-3"><Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
      <ListCard rows={rows.data} loading={rows.isLoading} error={rows.error} empty="No purchases in this period." cols={[
        { header: 'Date', cell: (p: any) => p.date }, { header: 'Litres', cell: (p: any) => litres(p.litres) }, { header: 'Price', cell: (p: any) => money(p.pricePerLitre) }, { header: 'Total', cell: (p: any) => money(p.total) },
        { header: 'Supplier', cell: (p: any) => p.supplier ?? '' }, { header: 'Paid from', cell: (p: any) => p.paidFrom }, { header: 'Reference', cell: (p: any) => p.reference ?? '' },
      ]} />
    </>
  );
}

function Report() {
  const [from, setFrom] = useState(ago(29)); const [to, setTo] = useState(today());
  const { data: r, isLoading, error } = useGet<any>('/power/report', { from, to });
  return (
    <>
      <div className="mb-3 flex gap-3"><Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
      {isLoading && <p className="text-sm">Loading…</p>}{error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {r && (<div className="space-y-4">
        {!r.measured && <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">Tank readings are needed on two different days (before and at the end of the period) to work out how much diesel was really used. Until then, costs show what was bought.</div>}
        {r.measured && <p className="text-xs text-muted-foreground">Covers {r.window.from} to {r.window.to}, the days between your tank readings.</p>}
        {r.variance.flagged && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"><b>More diesel went out than the generators explain.</b> {litres(r.variance.litres)} extra ({r.variance.pct}% above what the running hours should burn){r.variance.value !== null ? `, worth about ${money(r.variance.value)}` : ''}. Check deliveries, the tank reading and who has access to the fuel.</div>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Fuel cost" value={money(r.fuelCost)} /><Stat label="Cost per occupied room night" value={r.costPerOccupiedRoomNight === null ? '—' : money(r.costPerOccupiedRoomNight)} />
          <Stat label="Cost per running hour" value={r.costPerRunningHour === null ? '—' : money(r.costPerRunningHour)} /><Stat label="Hours run" value={r.hoursRun} />
          <Stat label="Diesel bought" value={`${litres(r.purchases.litres)} (${money(r.purchases.cost)})`} /><Stat label="Diesel used (tank)" value={litres(r.litresUsed)} />
          <Stat label="Expected from hours" value={litres(r.expectedLitres)} /><Stat label="Litres per hour (actual)" value={r.litresPerHour ?? '—'} tone={r.variance.flagged ? 'red' : 'white'} />
        </div>
        {r.missingRate.length > 0 && <p className="text-xs text-amber-700">Set litres per hour for {r.missingRate.join(', ')} under Generators so missing diesel can be spotted.</p>}
        <ListCard rows={r.byGenerator} empty="" cols={[{ header: 'Generator', cell: (g: any) => g.name }, { header: 'Litres/hour (set)', cell: (g: any) => g.litresPerHour ?? <Badge variant="yellow">Not set</Badge> }, { header: 'Hours run', cell: (g: any) => g.hours }]} />
        <ListCard rows={r.days} empty="" cols={[{ header: 'Day', cell: (x: any) => x.date }, { header: 'Hours run', cell: (x: any) => x.hours }, { header: 'Expected litres', cell: (x: any) => x.expectedLitres }, { header: 'Rooms occupied', cell: (x: any) => x.occupied }]} />
      </div>)}
    </>
  );
}

function Setup() {
  const gens = useGet<any[]>('/power/generators');
  const cfg = useGet<any>('/power/config');
  const [name, setName] = useState(''); const [lph, setLph] = useState('');
  const add = useAction(() => api.post('/power/generators', { name, litresPerHour: lph === '' ? null : Number(lph) }), { success: 'Generator added', invalidate: KEYS, onSuccess: () => { setName(''); setLph(''); } });
  const edit = useAction((v: { id: string; litresPerHour?: number | null; isActive?: boolean }) => api.put(`/power/generators/${v.id}`, { litresPerHour: v.litresPerHour, isActive: v.isActive }), { invalidate: KEYS });
  const [tol, setTol] = useState<string | null>(null);
  const saveTol = useAction(() => api.put('/power/config', { tolerancePct: Number(tol) }), { success: 'Saved', invalidate: ['/power/config', '/power/report'] });
  return (
    <div className="max-w-3xl space-y-4">
      <Card className="p-4"><div className="mb-3 font-semibold">Add a generator</div>
        <div className="grid gap-3 md:grid-cols-3"><Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 100 kVA main" /></Field><Field label="Litres burned per hour" hint="Normal load. Check the manual or time a day's use"><Input inputMode="decimal" value={lph} onChange={(e) => setLph(e.target.value)} /></Field><div className="flex items-end"><Button disabled={!name || add.isPending} onClick={() => add.mutate(undefined)}>Add</Button></div></div></Card>
      <ListCard rows={gens.data} loading={gens.isLoading} empty="No generators yet." cols={[
        { header: 'Generator', cell: (g: any) => g.name }, { header: 'Litres per hour', cell: (g: any) => g.litresPerHour ?? 'Not set' },
        { header: '', cell: (g: any) => <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { const v = prompt('Litres burned per hour', g.litresPerHour ?? ''); if (v !== null && v.trim() !== '' && Number(v) >= 0) edit.mutate({ id: g.id, litresPerHour: Number(v) }); }}>Set litres per hour</Button><Button size="sm" variant="outline" onClick={() => edit.mutate({ id: g.id, isActive: !g.isActive })}>{g.isActive ? 'Retire' : 'Use again'}</Button></div> },
      ]} />
      <Card className="p-4"><Field label="Flag a variance above (%)" hint="How far real diesel use may exceed what the running hours explain"><Input inputMode="decimal" value={tol ?? cfg.data?.tolerancePct ?? ''} onChange={(e) => setTol(e.target.value)} /></Field><Button className="mt-3" disabled={tol === null || saveTol.isPending} onClick={() => saveTol.mutate(undefined)}>Save</Button></Card>
    </div>
  );
}
