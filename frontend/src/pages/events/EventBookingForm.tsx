import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Card, FieldBox, PageTitle, inputCls, naira } from '@/components/reports/ui';
import { EVENT_TYPES, FormBtn, FormPage, LinkBtn, Req, SectionTitle, dailyOf, hourlyOf, textareaCls, type Facility } from '@/components/events/ui';

type Rental = 'HOURLY' | 'HALF_DAY' | 'FULL_DAY';
interface Line { key: number; facilityId: string; rentalType: Rental; quantity: string }
interface Client { id: string; name: string; isActive: boolean }

const RENTAL: [Rental, string][] = [['HOURLY', 'Hourly'], ['HALF_DAY', 'Half Day'], ['FULL_DAY', 'Full Day']];
const STATUSES: [string, string][] = [['INQUIRY', 'Inquiry'], ['QUOTED', 'Quoted'], ['CONFIRMED', 'Confirmed']];
const METHODS: [string, string][] = [['CASH', 'Cash'], ['CARD', 'POS / Card'], ['TRANSFER', 'Transfer']];

const rateFor = (f: Facility | undefined, t: Rental) =>
  !f ? 0 : t === 'HOURLY' ? hourlyOf(f) ?? 0 : t === 'HALF_DAY' ? Number(f.halfDayRate ?? 0) : dailyOf(f) ?? 0;

export default function EventBookingForm() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const clients = useGet<{ clients: Client[] }>('/events/clients');
  const facilities = useGet<Facility[]>('/events/facilities');
  const activeFacilities = (facilities.data ?? []).filter((x) => x.isActive);

  const [f, setF] = useState({
    clientId: sp.get('client') ?? '', eventType: '', title: '', description: '', startsAt: '', endsAt: '',
    expectedGuests: '', eventManager: '', status: 'INQUIRY', specialRequirements: '', depositAmount: '0', depositMethod: '',
  });
  const [lines, setLines] = useState<Line[]>([{ key: 1, facilityId: sp.get('facility') ?? '', rentalType: 'HOURLY', quantity: '1' }]);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const setLine = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const amountOf = (l: Line) => rateFor(activeFacilities.find((x) => x.id === l.facilityId), l.rentalType) * (Number(l.quantity) || 0);
  const subtotal = lines.reduce((t, l) => t + amountOf(l), 0);
  const hours = f.startsAt && f.endsAt ? Math.max(0, (new Date(f.endsAt).getTime() - new Date(f.startsAt).getTime()) / 3_600_000) : 0;

  const problem = () => {
    if (!f.clientId) return 'Select a client.';
    if (!f.eventType) return 'Select an event type.';
    if (!f.title.trim()) return 'Enter an event title.';
    if (!f.startsAt || !f.endsAt) return 'Enter the start and end date & time.';
    if (new Date(f.endsAt) <= new Date(f.startsAt)) return 'The event must end after it starts.';
    if (lines.some((l) => !l.facilityId)) return 'Select a facility for every row, or remove the empty row.';
    if (new Set(lines.map((l) => l.facilityId)).size !== lines.length) return 'A facility can only be added once.';
    if (lines.some((l) => !(Number(l.quantity) > 0))) return 'Hours must be greater than zero.';
    if (Number(f.depositAmount) < 0) return 'Deposit cannot be negative.';
    if (Number(f.depositAmount) > 0 && !f.depositMethod) return 'Select a payment method for the deposit.';
    return '';
  };

  const save = useAction(
    () =>
      api.post('/events', {
        title: f.title.trim(), clientId: f.clientId, eventType: f.eventType,
        description: f.description.trim() || null,
        startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(),
        expectedGuests: Number(f.expectedGuests) || 0, eventManager: f.eventManager.trim() || null,
        status: f.status, specialRequirements: f.specialRequirements.trim() || null,
        facilities: lines.map((l) => ({ facilityId: l.facilityId, rateType: l.rentalType, quantity: Number(l.quantity) })),
        deposit: Number(f.depositAmount) > 0 ? { amount: Number(f.depositAmount), method: f.depositMethod } : undefined,
      }),
    { success: 'Event booking created', invalidate: ['/events/bookings', '/events/dashboard', '/events/calendar'], onSuccess: () => nav('/events/bookings') },
  );

  const submit = () => {
    const p = problem();
    setError(p);
    if (!p) save.mutate(undefined);
  };

  return (
    <FormPage>
      <PageTitle title="Create Event Booking"><LinkBtn to="/events/bookings" tone="grey">Back to Bookings</LinkBtn></PageTitle>
      <Card className="p-6">
        <SectionTitle>Event Information</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldBox label={<>Client <Req /></>}>
            <select className={inputCls} value={f.clientId} onChange={set('clientId')}>
              <option value="">Select Client</option>
              {(clients.data?.clients ?? []).filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FieldBox>
          <FieldBox label={<>Event Type <Req /></>}>
            <select className={inputCls} value={f.eventType} onChange={set('eventType')}>
              <option value="">Select Event Type</option>
              {EVENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FieldBox>
        </div>
        <div className="mt-4"><FieldBox label={<>Event Title <Req /></>}>
          <input className={inputCls} placeholder="e.g., Annual Corporate Conference, Smith Wedding Reception" value={f.title} onChange={set('title')} />
        </FieldBox></div>
        <div className="mt-4"><FieldBox label="Event Description">
          <textarea className={textareaCls} rows={3} placeholder="Brief description of the event..." value={f.description} onChange={set('description')} />
        </FieldBox></div>

        <SectionTitle>Date & Time</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldBox label={<>Start Date & Time <Req /></>}><input type="datetime-local" className={inputCls} value={f.startsAt} onChange={set('startsAt')} /></FieldBox>
          <FieldBox label={<>End Date & Time <Req /></>}><input type="datetime-local" className={inputCls} value={f.endsAt} onChange={set('endsAt')} /></FieldBox>
          <FieldBox label="Expected Number of Guests"><input type="number" min="0" className={inputCls} placeholder="e.g., 100" value={f.expectedGuests} onChange={set('expectedGuests')} /></FieldBox>
          <FieldBox label="Event Manager"><input className={inputCls} placeholder="Staff member assigned" value={f.eventManager} onChange={set('eventManager')} /></FieldBox>
        </div>

        <SectionTitle right={
          <FormBtn tone="green" className="h-8" onClick={() => setLines([...lines, { key: Date.now(), facilityId: '', rentalType: 'HOURLY', quantity: '1' }])}>
            <Plus className="h-4 w-4" /> Add Facility
          </FormBtn>
        }>Facilities & Venues</SectionTitle>
        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l.key} className="grid items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1.3fr_1fr_1fr_1fr_auto]">
              <FieldBox label="Facility">
                <select className={inputCls} value={l.facilityId} onChange={(e) => setLine(l.key, { facilityId: e.target.value })}>
                  <option value="">Select Facility</option>
                  {activeFacilities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </FieldBox>
              <FieldBox label="Rental Type">
                <select className={inputCls} value={l.rentalType} onChange={(e) => setLine(l.key, { rentalType: e.target.value as Rental })}>
                  {RENTAL.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </FieldBox>
              <FieldBox label={l.rentalType === 'HOURLY' ? 'Hours' : 'Days'}>
                <input type="number" min="0.5" step="0.5" className={inputCls} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
              </FieldBox>
              <FieldBox label="Amount"><div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-100 px-3 text-sm text-slate-600">{naira(amountOf(l))}</div></FieldBox>
              <button type="button" aria-label="Remove facility" disabled={lines.length === 1} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-40">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <SectionTitle>Additional Information</SectionTitle>
        <FieldBox label={<>Booking Status <Req /></>}>
          <select className={inputCls} value={f.status} onChange={set('status')}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </FieldBox>
        <div className="mt-4"><FieldBox label="Special Requirements">
          <textarea className={textareaCls} rows={3} placeholder="Any special setup requirements, catering needs, audio-visual requirements, etc." value={f.specialRequirements} onChange={set('specialRequirements')} />
        </FieldBox></div>

        <SectionTitle>Deposit Information</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div><FieldBox label="Deposit Amount (₦)"><input type="number" min="0" className={inputCls} value={f.depositAmount} onChange={set('depositAmount')} /></FieldBox>
            <p className="mt-1 text-xs text-slate-500">Amount paid as deposit (if any)</p></div>
          <div><FieldBox label="Payment Method">
            <select className={inputCls} value={f.depositMethod} onChange={set('depositMethod')}>
              <option value="">Select Payment Method</option>
              {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></FieldBox>
            <p className="mt-1 text-xs text-slate-500">Required if deposit amount is greater than 0</p></div>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-900">Booking Summary</div>
          <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-3">
            <div>Selected Facilities: <b className="text-slate-900">{lines.length}</b></div>
            <div>Estimated Total: <b className="text-green-600">{naira(subtotal)}</b></div>
            <div>Event Duration: <b className="text-slate-900">{Math.round(hours * 10) / 10} hours</b></div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">VAT and service charge are added when the booking is saved.</p>
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <LinkBtn to="/events/bookings" tone="grey">Cancel</LinkBtn>
          <FormBtn tone="blue" disabled={save.isPending} onClick={submit}>{save.isPending ? 'Creating…' : 'Create Booking'}</FormBtn>
        </div>
      </Card>
    </FormPage>
  );
}