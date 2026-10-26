import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { cn, money } from '@/lib/utils';
import { Field, PageHeader, Stat } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString('en', { month: 'long' }));
const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function MonthControls({ y, m, set }: { y: number; m: number; set: (y: number, m: number) => void }) {
  const [yy, setYY] = useState(y); const [mm, setMM] = useState(m);
  const shift = (n: number) => { const d = new Date(y, m - 1 + n, 1); set(d.getFullYear(), d.getMonth() + 1); setYY(d.getFullYear()); setMM(d.getMonth() + 1); };
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => shift(-1)}>‹ Previous</Button>
      <NativeSelect className="w-32" value={mm} onChange={(e) => setMM(Number(e.target.value))}>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</NativeSelect>
      <NativeSelect className="w-24" value={yy} onChange={(e) => setYY(Number(e.target.value))}>{[y - 1, y, y + 1, y + 2].map((n) => <option key={n}>{n}</option>)}</NativeSelect>
      <Button onClick={() => set(yy, mm)}>Go</Button>
      <Button variant="outline" onClick={() => { const n = new Date(); set(n.getFullYear(), n.getMonth() + 1); setYY(n.getFullYear()); setMM(n.getMonth() + 1); }}>Today</Button>
      <Button variant="outline" onClick={() => shift(1)}>Next ›</Button>
    </div>
  );
}

/** Builds Monday-first grid cells for a month. */
function useGrid(y: number, m: number) {
  return useMemo(() => {
    const first = new Date(y, m - 1, 1); const lead = (first.getDay() + 6) % 7; const days = new Date(y, m, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [y, m]);
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function ReservationCalendar() {
  const n = new Date(); const [{ y, m }, setYM] = useState({ y: n.getFullYear(), m: n.getMonth() + 1 });
  const { data } = useGet('/reservations/calendar', { year: y, month: m });
  const cells = useGrid(y, m);
  const k = data?.kpis;
  return (
    <>
      <PageHeader title="Reservation Calendar"><MonthControls y={y} m={m} set={(yy, mm) => setYM({ y: yy, m: mm })} /></PageHeader>
      <div className="mb-4 grid gap-3 md:grid-cols-4"><Stat label="Total Reservations" value={<span className="text-blue-700">{k?.totalReservations ?? 0}</span>} sub={`for ${MONTHS[m - 1]} ${y}`} /><Stat label="Total Rooms" value={k?.totalRooms ?? 0} sub="available rooms" /><Stat label="Peak Occupancy" value={<span className="text-red-600">{k?.peakOccupancy ?? 0}</span>} sub="rooms reserved on peak day" /><Stat label="Availability" value={<span className="text-green-600">{k?.availability ?? 0}</span>} sub="rooms available on peak day" /></div>
      <Card className="overflow-hidden"><div className="grid grid-cols-7 border-b bg-slate-50 text-center text-sm font-medium">{DOW.map((d) => <div key={d} className="p-2">{d}</div>)}</div>
        <div className="grid grid-cols-7">{cells.map((d, i) => { const day = d && data?.days?.find((x: any) => x.date === iso(y, m, d)); return (
          <div key={i} className="min-h-[88px] border-b border-r p-2">{d && <><div className="text-sm font-semibold">{d}</div>{day?.reserved ? <div className="mt-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">{day.reserved} reserved</div> : <div className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-muted-foreground">Available</div>}</>}</div>); })}</div></Card>
    </>
  );
}

const LEGEND: [string, string][] = [['Confirmed', 'bg-green-500'], ['In Progress', 'bg-blue-500'], ['Inquiry', 'bg-yellow-400'], ['Quoted', 'bg-orange-500'], ['Completed', 'bg-slate-500'], ['Cancelled', 'bg-red-500']];
const dot: Record<string, string> = { CONFIRMED: 'bg-green-500', IN_PROGRESS: 'bg-blue-500', INQUIRY: 'bg-yellow-400', QUOTED: 'bg-orange-500', COMPLETED: 'bg-slate-500', CANCELLED: 'bg-red-500' };

export function EventCalendar() {
  const n = new Date(); const [{ y, m }, setYM] = useState({ y: n.getFullYear(), m: n.getMonth() + 1 });
  const [facilityId, setFacilityId] = useState('');
  const [open, setOpen] = useState(false);
  const { data } = useGet('/events/calendar', { year: y, month: m, facilityId });
  const { data: facilities } = useGet<any[]>('/events/facilities');
  const cells = useGrid(y, m);
  const k = data?.kpis;
  return (
    <>
      <PageHeader title="Event Calendar">
        <MonthControls y={y} m={m} set={(yy, mm) => setYM({ y: yy, m: mm })} />
        <Button variant="purple" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New Event</Button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">Filter by Facility</span>
        {[{ id: '', name: 'All Facilities' }, ...(facilities ?? [])].map((f) => <Button key={f.id} size="sm" variant={facilityId === f.id ? 'purple' : 'outline'} onClick={() => setFacilityId(f.id)}>{f.name}</Button>)}</div>
      <div className="mb-4 grid gap-3 md:grid-cols-5"><Stat tone="purple" label="Total Events" value={k?.totalEvents ?? 0} sub={`for ${MONTHS[m - 1]} ${y}`} /><Stat tone="blue" label="Expected Guests" value={k?.expectedGuests ?? 0} sub="total attendees" /><Stat tone="green" label="Total Quoted" value={money(k?.totalQuoted)} sub="revenue potential" /><Stat tone="red" label="Balance Due" value={money(k?.balanceDue)} sub="pending payments" /><Stat tone="orange" label="Upcoming (7 days)" value={k?.upcoming7d ?? 0} sub="confirmed events" /></div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs"><b>Status Legend:</b>{LEGEND.map(([l, c]) => <span key={l} className="flex items-center gap-1"><span className={cn('h-2.5 w-2.5 rounded-full', c)} />{l}</span>)}</div>
      <Card className="overflow-hidden"><div className="grid grid-cols-7 border-b bg-slate-50 text-center text-sm font-medium">{DOW.map((d) => <div key={d} className="p-2">{d}</div>)}</div>
        <div className="grid grid-cols-7">{cells.map((d, i) => { const evs = d ? (data?.events ?? []).filter((e: any) => e.startsAt.slice(0, 10) === iso(y, m, d)) : []; return (
          <div key={i} className="min-h-[96px] border-b border-r p-2">{d && <><div className="text-sm font-semibold">{d}</div>{evs.length ? evs.map((e: any) => <div key={e.id} className="mt-1 flex items-center gap-1 truncate rounded bg-slate-50 px-1 text-xs"><span className={cn('h-2 w-2 shrink-0 rounded-full', dot[e.status])} />{e.title}</div>) : <div className="mt-1 text-xs text-muted-foreground">No events</div>}</>}</div>); })}</div></Card>
      {open && <EventDialog facilities={facilities ?? []} onClose={() => setOpen(false)} />}
    </>
  );
}

function EventDialog({ facilities, onClose }: { facilities: any[]; onClose: () => void }) {
  const [f, setF] = useState<any>({ title: '', clientName: '', clientPhone: '', facilityId: '', startsAt: '', endsAt: '', expectedGuests: 0, quoted: 0, paid: 0, status: 'INQUIRY' });
  const save = useAction(() => api.post('/events', { ...f, startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(), expectedGuests: Number(f.expectedGuests), quoted: Number(f.quoted), paid: Number(f.paid) }), { success: 'Event saved', invalidate: ['/events/calendar'], onSuccess: onClose });
  const s = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>New event</DialogTitle></DialogHeader>
      <Field label="Event title"><Input value={f.title} onChange={s('title')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client name"><Input value={f.clientName} onChange={s('clientName')} /></Field><Field label="Client phone"><Input value={f.clientPhone} onChange={s('clientPhone')} /></Field>
        <Field label="Facility"><NativeSelect value={f.facilityId} onChange={s('facilityId')}><option value="">Select</option>{facilities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect></Field>
        <Field label="Status"><NativeSelect value={f.status} onChange={s('status')}>{['INQUIRY', 'QUOTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}</NativeSelect></Field>
        <Field label="Starts"><Input type="datetime-local" value={f.startsAt} onChange={s('startsAt')} /></Field><Field label="Ends"><Input type="datetime-local" value={f.endsAt} onChange={s('endsAt')} /></Field>
        <Field label="Expected guests"><Input type="number" value={f.expectedGuests} onChange={s('expectedGuests')} /></Field><Field label="Quoted (₦)"><Input type="number" value={f.quoted} onChange={s('quoted')} /></Field>
      </div>
      <Button onClick={() => save.mutate(undefined)} disabled={save.isPending || !f.facilityId || !f.startsAt || !f.endsAt}>Save event</Button>
    </DialogContent></Dialog>
  );
}
