import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarX } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { ErrorBox, Loading } from '@/components/common';
import { Card, DataTable, FieldBox, PageTitle, Pill, ReportPage, SectionCard, Td, dtShort, inputCls, naira } from '@/components/reports/ui';
import { EVENT_STATUS, LinkBtn, eventTypeLabel, eventWhen, type BookingRow } from '@/components/events/ui';

const FILTERS: [string, string][] = [['upcoming', 'Upcoming Events'], ['active', 'All Active'], ['inquiries', 'Inquiries'], ['confirmed', 'Confirmed'], ['all', 'All Bookings']];

export default function EventBookings() {
  const [filter, setFilter] = useState('upcoming');
  const q = useGet<{ bookings: BookingRow[] }>('/events/bookings', { filter });
  const rows = q.data?.bookings ?? [];
  return (
    <ReportPage wide>
      <PageTitle title="Event Bookings"><LinkBtn to="/events/bookings/new" tone="blue">New Booking</LinkBtn></PageTitle>

      <Card className="p-5">
        <FieldBox label="Status Filter">
          <select className={`${inputCls} h-10 w-72`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </FieldBox>
      </Card>

      {q.error && <ErrorBox error={q.error} />}
      <Card className="overflow-hidden">
        {q.isLoading ? <Loading /> : (
          <>
            <DataTable cols={[{ label: 'Event Details' }, { label: 'Client' }, { label: 'Date & Time' }, { label: 'Facilities' }, { label: 'Quoted Amount' }, { label: 'Status' }, { label: 'Actions' }]}>
              {rows.map((b) => (
                <tr key={b.id}>
                  <Td><div className="font-medium">{b.title}</div><div className="text-xs text-slate-500">{eventTypeLabel(b.eventType)}</div></Td>
                  <Td>{b.clientName}</Td>
                  <Td className="whitespace-nowrap">{eventWhen(b.startsAt, b.endsAt)}</Td>
                  <Td>{b.facilities.join(', ') || '—'}</Td>
                  <Td><div className="font-medium">{naira(b.total)}</div><div className="text-xs text-slate-500">Paid {naira(b.paid)}</div></Td>
                  <Td><Pill tone={EVENT_STATUS[b.status]?.tone}>{EVENT_STATUS[b.status]?.label ?? b.status}</Pill></Td>
                  <Td><Link to={`/events/bookings/${b.id}`} className="text-sm font-medium text-blue-600 hover:underline">View</Link></Td>
                </tr>
              ))}
            </DataTable>
            {rows.length === 0 && (
              <div className="flex flex-col items-center py-14 text-center">
                <CalendarX className="h-9 w-9 text-slate-400" />
                <div className="mt-3 text-lg text-slate-500">No event bookings found</div>
                <div className="mt-1 text-sm text-slate-400">Get started by creating your first event booking</div>
                <LinkBtn to="/events/bookings/new" tone="blue" className="mt-4">Create Booking</LinkBtn>
              </div>
            )}
          </>
        )}
      </Card>
    </ReportPage>
  );
}

/* Read-only booking details (the video never opens a booking, so this page is my own design). */
export function EventBookingDetail() {
  const { id } = useParams();
  const q = useGet<{ booking: any }>(`/events/bookings/${id}`, undefined, Boolean(id));
  const b = q.data?.booking;
  if (q.error) return <ReportPage><ErrorBox error={q.error} /></ReportPage>;
  if (!b) return <Loading />;
  const st = EVENT_STATUS[b.status];
  const balance = Number(b.total) - Number(b.paid);
  return (
    <ReportPage>
      <PageTitle title={b.title} sub={`${eventTypeLabel(b.eventType)} • ${b.client?.name ?? b.clientName}`}>
        <LinkBtn to="/events/bookings" tone="grey">Back to Bookings</LinkBtn>
      </PageTitle>
      <Card className="grid gap-4 p-5 text-sm md:grid-cols-4">
        <div><div className="text-slate-500">Status</div><Pill tone={st?.tone}>{st?.label ?? b.status}</Pill></div>
        <div><div className="text-slate-500">When</div><div className="font-medium">{eventWhen(b.startsAt, b.endsAt)}</div></div>
        <div><div className="text-slate-500">Expected Guests</div><div className="font-medium">{b.expectedGuests}</div></div>
        <div><div className="text-slate-500">Event Manager</div><div className="font-medium">{b.eventManager ?? '—'}</div></div>
        {b.description && <div className="md:col-span-4"><div className="text-slate-500">Description</div><div>{b.description}</div></div>}
        {b.specialRequirements && <div className="md:col-span-4"><div className="text-slate-500">Special Requirements</div><div>{b.specialRequirements}</div></div>}
      </Card>
      <SectionCard title="Facilities">
        <DataTable cols={[{ label: 'Facility' }, { label: 'Rental' }, { label: 'Quantity', right: true }, { label: 'Rate', right: true }, { label: 'Amount', right: true }]}>
          {b.facilities.map((f: any) => (
            <tr key={f.id}><Td className="font-medium">{f.facility.name}</Td><Td>{String(f.rateType).replace('_', ' ')}</Td><Td right>{Number(f.quantity)}</Td><Td right>{naira(f.unitRate)}</Td><Td right>{naira(f.quotedAmount)}</Td></tr>
          ))}
        </DataTable>
      </SectionCard>
      <Card className="grid gap-3 p-5 text-sm md:grid-cols-5">
        {([['Subtotal', b.baseAmount], ['VAT', b.vatAmount], ['Service Charge', b.serviceChargeAmount], ['Total', b.total], ['Paid', b.paid]] as const).map(([l, v]) => (
          <div key={l}><div className="text-slate-500">{l}</div><div className="font-semibold">{naira(v)}</div></div>
        ))}
        <div className="md:col-span-5 font-semibold text-red-600">Balance due: {naira(balance)}</div>
      </Card>
      {!!b.payments.length && (
        <SectionCard title="Payments">
          <DataTable cols={[{ label: 'Date' }, { label: 'Type' }, { label: 'Method' }, { label: 'Description' }, { label: 'Amount', right: true }]}>
            {b.payments.map((p: any) => (
              <tr key={p.id}><Td>{dtShort(p.createdAt)}</Td><Td>{p.type}</Td><Td>{p.method}</Td><Td>{p.description ?? '—'}</Td><Td right>{naira(p.amount)}</Td></tr>
            ))}
          </DataTable>
        </SectionCard>
      )}
    </ReportPage>
  );
}