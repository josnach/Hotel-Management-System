import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, ChevronsRight, ClipboardCheck, Edit, Eye, FileDown, Globe, LogIn, LogOut, Brush, Loader2, UserCheck, UserX, Wrench, Check } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { ErrorBox, Loading } from '@/components/common';
import { exportReportPdf, pdfMoney } from '@/components/reports/pdf';
import { Btn, Card, DataTable, EmptyRow, FieldBox, PageTitle, Pill, ReportPage, SectionCard, Td, Tile, TotalRow, daysAgo, dShort, dtShort, inputCls, naira, tShort, titleCase, useFilters } from '@/components/reports/ui';

const pct = (n: number) => `${Number(n ?? 0).toFixed(1)}%`;
const monthStartStr = () => `${daysAgo(0).slice(0, 7)}-01`;
const linkBtn = 'inline-flex h-7 items-center rounded px-3 text-xs font-medium text-white hover:brightness-95';

/* ─────────── Room Status Dashboard ─────────── */
interface RS {
  counts: { occupied: number; available: number; reserved: number; maintenance: number; cleaning: number };
  rooms: { id: string; number: string; floor: number; type: string; status: string; rate: number; guestName: string | null; guestId: string | null }[];
}
const ROOM_STYLE: Record<string, { card: string; pill: 'red' | 'green' | 'cyan' | 'orange' | 'yellow'; label: string }> = {
  OCCUPIED: { card: 'border-[#e03347]', pill: 'red', label: 'Occupied' },
  AVAILABLE: { card: 'border-[#30dc62]', pill: 'green', label: 'Available' },
  RESERVED: { card: 'border-[#15c7d1]', pill: 'cyan', label: 'Reserved' },
  MAINTENANCE: { card: 'border-[#eb9e12]', pill: 'orange', label: 'Maintenance' },
  CLEANING: { card: 'border-[#e3b90f]', pill: 'yellow', label: 'Cleaning' },
};

export function RoomStatusDashboard() {
  const q = useGet<RS>('/reports/room-status');
  const d = q.data;
  const floors = new Map<number, RS['rooms']>();
  (d?.rooms ?? []).forEach((r) => floors.set(r.floor, [...(floors.get(r.floor) ?? []), r]));

  return (
    <ReportPage>
      <PageTitle title="Room Status Dashboard (Real-time)" />
      {q.error && <ErrorBox error={q.error} />}
      {!d ? <Loading /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Tile tone="blue" value={d.counts.occupied} label="Occupied" icon={Building2} />
            <Tile tone="green" value={d.counts.available} label="Available" icon={CheckCircle2} />
            <Tile tone="cyan" value={d.counts.reserved} label="Reserved" icon={ClipboardCheck} />
            <Tile tone="amber" value={d.counts.maintenance} label="Maintenance" icon={Wrench} />
          </div>

          {[...floors.entries()].sort((a, b) => a[0] - b[0]).map(([floor, rooms]) => (
            <Card key={floor} className="overflow-hidden">
              <h2 className="border-b border-slate-100 px-5 py-4 text-base font-semibold text-slate-900">Floor {floor}</h2>
              <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
                {rooms.map((r) => {
                  const s = ROOM_STYLE[r.status] ?? ROOM_STYLE.AVAILABLE;
                  return (
                    <div key={r.id} className={cn('rounded-md border-2 bg-white p-3 text-center', s.card)}>
                      <div className="text-sm font-semibold text-slate-900">Room {r.number}</div>
                      <div className="my-1.5"><Pill tone={s.pill}>{s.label}</Pill></div>
                      {r.guestName && <div className="truncate text-xs text-slate-600">{r.guestName}</div>}
                      <div className="text-xs font-semibold text-slate-900">{naira(r.rate)}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

          <SectionCard title="Detailed Room Status">
            <DataTable cols={[{ label: 'Room Number' }, { label: 'Room Type' }, { label: 'Status' }, { label: 'Rate' }, { label: 'Guest Name' }, { label: 'Actions' }]}>
              {d.rooms.map((r) => {
                const s = ROOM_STYLE[r.status] ?? ROOM_STYLE.AVAILABLE;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td className="font-semibold">{r.number}</Td>
                    <Td className="text-slate-600">{r.type}</Td>
                    <Td><Pill tone={s.pill}>{s.label}</Pill></Td>
                    <Td>{naira(r.rate)}</Td>
                    <Td className="text-slate-600">{r.guestName ?? '-'}</Td>
                    <Td>
                      <Link to={r.guestId ? `/guests/${r.guestId}` : '/rooms'} title="View Details" className="text-blue-600 hover:text-blue-800"><Eye className="h-4 w-4" /></Link>
                    </Td>
                  </tr>
                );
              })}
            </DataTable>
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}

/* ─────────── Arrival / Departure Schedule ─────────── */
interface AD {
  date: string;
  stats: { arrivals: number; departures: number; earlyCheckouts: number; noShows: number };
  arrivals: { id: string; guestName: string | null; room: string; expectedCheckIn: string; nights: number; status: string }[];
  departures: { stayId: string; guestName: string | null; room: string; expectedCheckOut: string; nightsStayed: number; balanceDue: number }[];
  earlyCheckouts: { stayId: string; guestName: string | null; room: string; actualCheckOut: string; expectedCheckOut: string; earlyByDays: number }[];
  noShows: { id: string; guestName: string | null; room: string; expectedCheckIn: string; contact: string }[];
  extendedStays: { stayId: string; guestName: string | null; room: string; expectedCheckOut: string; extendedNights: number }[];
}

export function ArrivalDepartureReport() {
  const f = useFilters({ date: daysAgo(0) });
  const q = useGet<AD>('/reports/arrival-departure', f.applied);
  const d = q.data;

  const exportPdf = () => d && exportReportPdf({
    title: 'Arrival/Departure Schedule', subtitle: `Date: ${d.date}`, filename: `arrival-departure-${d.date}.pdf`,
    stats: [['Arrivals', d.stats.arrivals], ['Departures', d.stats.departures], ['Early Check-outs', d.stats.earlyCheckouts], ['No-shows', d.stats.noShows]],
    sections: [
      { title: "Today's Arrivals", head: ['Guest', 'Room', 'Expected Check-in', 'Nights', 'Status'], body: d.arrivals.map((r) => [r.guestName ?? '', r.room, dtShort(r.expectedCheckIn), r.nights, titleCase(r.status)]) },
      { title: "Today's Departures", head: ['Guest', 'Room', 'Expected Check-out', 'Nights Stayed', 'Balance'], body: d.departures.map((r) => [r.guestName ?? '', r.room, dtShort(r.expectedCheckOut), r.nightsStayed, pdfMoney(r.balanceDue)]) },
      { title: 'Early Check-outs', head: ['Guest', 'Room', 'Actual', 'Expected', 'Early By'], body: d.earlyCheckouts.map((r) => [r.guestName ?? '', r.room, dtShort(r.actualCheckOut), dtShort(r.expectedCheckOut), `${r.earlyByDays} day(s)`]) },
      { title: 'No-shows', head: ['Guest', 'Room', 'Expected Check-in', 'Contact'], body: d.noShows.map((r) => [r.guestName ?? '', r.room, dtShort(r.expectedCheckIn), r.contact]) },
      { title: 'Extended Stays', head: ['Guest', 'Room', 'Expected Check-out', 'Extended By'], body: d.extendedStays.map((r) => [r.guestName ?? '', r.room, dShort(r.expectedCheckOut), `${r.extendedNights} night(s)`]) },
    ],
  });

  const statusTone = (s: string) => (s === 'CONFIRMED' ? 'blue' : s === 'CHECKED_IN' ? 'green' : 'yellow');

  return (
    <ReportPage>
      <PageTitle title="Arrival/Departure Schedule" />
      <Card className="p-5">
        <div className="grid items-end gap-3.5 md:grid-cols-3">
          <FieldBox label="Select Date"><input type="date" className={inputCls} value={f.draft.date} onChange={(e) => f.setDraft({ date: e.target.value })} /></FieldBox>
          <Btn onClick={f.apply} disabled={!f.draft.date}>Generate Report</Btn>
          <Btn variant="green" onClick={exportPdf} disabled={!d}><FileDown className="h-4 w-4" /> Export PDF</Btn>
        </div>
      </Card>
      {q.error && <ErrorBox error={q.error} />}
      {!d ? <Loading /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Tile tone="cyan" value={d.stats.arrivals} label="Today's Arrivals" icon={LogIn} />
            <Tile tone="amber" value={d.stats.departures} label="Today's Departures" icon={LogOut} />
            <Tile tone="green" value={d.stats.earlyCheckouts} label="Early Check-outs" icon={ChevronsRight} />
            <Tile tone="red" value={d.stats.noShows} label="No-shows" icon={UserX} />
          </div>

          <SectionCard title="Today's Arrivals">
            <DataTable cols={[{ label: 'Guest Name' }, { label: 'Room' }, { label: 'Expected Check-in' }, { label: 'Nights' }, { label: 'Status' }, { label: 'Actions' }]}>
              {d.arrivals.length === 0 && <EmptyRow span={6}>No arrivals scheduled for today</EmptyRow>}
              {d.arrivals.map((r) => (
                <tr key={r.id}><Td className="font-medium">{r.guestName}</Td><Td>{r.room}</Td><Td>{dtShort(r.expectedCheckIn)}</Td><Td>{r.nights}</Td>
                  <Td><Pill tone={statusTone(r.status)}>{titleCase(r.status)}</Pill></Td>
                  <Td><Link to={`/reservations/${r.id}`} className={cn(linkBtn, 'bg-[#4282f0]')}>View</Link></Td></tr>
              ))}
            </DataTable>
          </SectionCard>

          <SectionCard title="Today's Departures">
            <DataTable cols={[{ label: 'Guest Name' }, { label: 'Room' }, { label: 'Expected Check-out' }, { label: 'Nights Stayed' }, { label: 'Balance' }, { label: 'Actions' }]}>
              {d.departures.length === 0 && <EmptyRow span={6}>No departures scheduled for today</EmptyRow>}
              {d.departures.map((r) => (
                <tr key={r.stayId}><Td className="font-medium">{r.guestName}</Td><Td>{r.room}</Td><Td>{dtShort(r.expectedCheckOut)}</Td><Td>{r.nightsStayed}</Td>
                  <Td className={r.balanceDue > 0 ? 'font-medium text-red-600' : ''}>{naira(r.balanceDue)}</Td>
                  <Td><Link to="/in-house" className={cn(linkBtn, 'bg-[#eb9e12]')}>Check out</Link></Td></tr>
              ))}
            </DataTable>
          </SectionCard>

          <SectionCard title="Early Check-outs">
            <DataTable cols={[{ label: 'Guest Name' }, { label: 'Room' }, { label: 'Actual Check-out' }, { label: 'Expected Check-out' }, { label: 'Early By' }]}>
              {d.earlyCheckouts.length === 0 && <EmptyRow span={5}>No early check-outs today</EmptyRow>}
              {d.earlyCheckouts.map((r) => (
                <tr key={r.stayId}><Td className="font-medium">{r.guestName}</Td><Td>{r.room}</Td><Td>{dtShort(r.actualCheckOut)}</Td><Td>{dtShort(r.expectedCheckOut)}</Td><Td>{r.earlyByDays} day(s)</Td></tr>
              ))}
            </DataTable>
          </SectionCard>

          <SectionCard title="No-shows">
            <DataTable cols={[{ label: 'Guest Name' }, { label: 'Room' }, { label: 'Expected Check-in' }, { label: 'Contact' }, { label: 'Actions' }]}>
              {d.noShows.length === 0 && <EmptyRow span={5}>No no-shows today</EmptyRow>}
              {d.noShows.map((r) => (
                <tr key={r.id}><Td className="font-medium">{r.guestName}</Td><Td>{r.room}</Td><Td>{dtShort(r.expectedCheckIn)}</Td><Td>{r.contact}</Td>
                  <Td><Link to={`/reservations/${r.id}`} className={cn(linkBtn, 'bg-[#4282f0]')}>View</Link></Td></tr>
              ))}
            </DataTable>
          </SectionCard>

          <SectionCard title="Extended Stays">
            <DataTable cols={[{ label: 'Guest Name' }, { label: 'Room' }, { label: 'Expected Check-out' }, { label: 'Extended By' }, { label: 'Actions' }]}>
              {d.extendedStays.length === 0 && <EmptyRow span={5}>No extended stays</EmptyRow>}
              {d.extendedStays.map((r) => (
                <tr key={r.stayId}><Td className="font-semibold">{r.guestName}</Td><Td>{r.room}</Td><Td>{dShort(r.expectedCheckOut)}</Td>
                  <Td><Pill tone="amber">{r.extendedNights} night(s)</Pill></Td>
                  <Td><Link to="/in-house" className={cn(linkBtn, 'bg-[#15c7d1]')}>Update Stay</Link></Td></tr>
              ))}
            </DataTable>
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}

/* ─────────── Room Type Distribution & Performance ─────────── */
interface RT {
  range: { start: string; end: string };
  inventory: { roomType: string; totalRooms: number; occupied: number; available: number; occupancyRate: number; averageRate: number }[];
  inventoryTotal: { totalRooms: number; occupied: number; available: number; occupancyRate: number; averageRate: number };
  metrics: { roomType: string; nightsSold: number; totalRevenue: number; adr: number; revPar: number; revenueContribution: number }[];
  metricsTotal: { nightsSold: number; totalRevenue: number; adr: number; revPar: number; revenueContribution: number };
  forecast: { roomType: string; totalBookings: number; uniqueRoomsBooked: number; bookingRate: number; availableRooms: number }[];
}

export function RoomTypePerformanceReport() {
  const f = useFilters({ start: monthStartStr(), end: daysAgo(0) });
  const q = useGet<RT>('/reports/room-type-performance', f.applied);
  const d = q.data;

  const exportPdf = () => d && exportReportPdf({
    title: 'Room Type Distribution & Performance', subtitle: `${d.range.start} to ${d.range.end}`, filename: `room-type-performance-${d.range.start}-to-${d.range.end}.pdf`,
    sections: [
      { title: 'Room Type Inventory Summary', head: ['Room Type', 'Total Rooms', 'Occupied', 'Available', 'Occupancy', 'Avg Rate'], body: [...d.inventory.map((r) => [r.roomType, r.totalRooms, r.occupied, r.available, pct(r.occupancyRate), pdfMoney(r.averageRate)]), ['Total', d.inventoryTotal.totalRooms, d.inventoryTotal.occupied, d.inventoryTotal.available, pct(d.inventoryTotal.occupancyRate), pdfMoney(d.inventoryTotal.averageRate)]] },
      { title: 'Room Type Performance Metrics', head: ['Room Type', 'Nights Sold', 'Revenue', 'ADR', 'RevPAR', 'Contribution'], body: [...d.metrics.map((r) => [r.roomType, r.nightsSold, pdfMoney(r.totalRevenue), pdfMoney(r.adr), pdfMoney(r.revPar), pct(r.revenueContribution)]), ['Total/Average', d.metricsTotal.nightsSold, pdfMoney(d.metricsTotal.totalRevenue), pdfMoney(d.metricsTotal.adr), pdfMoney(d.metricsTotal.revPar), '100%']] },
      { title: 'Future Availability Forecast (next 30 days)', head: ['Room Type', 'Bookings', 'Unique Rooms Booked', 'Booking Rate', 'Available Rooms'], body: d.forecast.map((r) => [r.roomType, r.totalBookings, r.uniqueRoomsBooked, pct(r.bookingRate), r.availableRooms]) },
    ],
  });

  return (
    <ReportPage>
      <PageTitle title="Room Type Distribution & Performance" />
      <Card className="p-5">
        <div className="grid items-end gap-3.5 md:grid-cols-4">
          <FieldBox label="Start Date"><input type="date" className={inputCls} value={f.draft.start} onChange={(e) => f.setDraft({ ...f.draft, start: e.target.value })} /></FieldBox>
          <FieldBox label="End Date"><input type="date" className={inputCls} value={f.draft.end} onChange={(e) => f.setDraft({ ...f.draft, end: e.target.value })} /></FieldBox>
          <Btn onClick={f.apply} disabled={!f.draft.start || !f.draft.end}>Generate Report</Btn>
          <Btn variant="green" onClick={exportPdf} disabled={!d}><FileDown className="h-4 w-4" /> Export PDF</Btn>
        </div>
      </Card>
      {q.error && <ErrorBox error={q.error} />}
      {!d ? <Loading /> : (
        <>
          <SectionCard title="Room Type Inventory Summary">
            <DataTable cols={[{ label: 'Room Type' }, { label: 'Total Rooms', right: true }, { label: 'Currently Occupied', right: true }, { label: 'Currently Available', right: true }, { label: 'Occupancy Rate', right: true }, { label: 'Average Rate', right: true }]}>
              {d.inventory.map((r) => (
                <tr key={r.roomType}><Td className="font-semibold">{r.roomType}</Td><Td right>{r.totalRooms}</Td><Td right>{r.occupied}</Td><Td right>{r.available}</Td><Td right>{pct(r.occupancyRate)}</Td><Td right>{naira(r.averageRate)}</Td></tr>
              ))}
              <TotalRow><Td>Total</Td><Td right>{d.inventoryTotal.totalRooms}</Td><Td right>{d.inventoryTotal.occupied}</Td><Td right>{d.inventoryTotal.available}</Td><Td right>{pct(d.inventoryTotal.occupancyRate)}</Td><Td right>{naira(d.inventoryTotal.averageRate)}</Td></TotalRow>
            </DataTable>
          </SectionCard>
          <SectionCard title="Room Type Performance Metrics">
            <DataTable cols={[{ label: 'Room Type' }, { label: 'Nights Sold', right: true }, { label: 'Total Revenue', right: true }, { label: 'Average Daily Rate', right: true }, { label: 'RevPAR', right: true }, { label: 'Revenue Contribution', right: true }]}>
              {d.metrics.map((r) => (
                <tr key={r.roomType}><Td className="font-semibold">{r.roomType}</Td><Td right>{r.nightsSold}</Td><Td right>{naira(r.totalRevenue)}</Td><Td right>{naira(r.adr)}</Td><Td right>{naira(r.revPar)}</Td><Td right>{pct(r.revenueContribution)}</Td></tr>
              ))}
              <TotalRow><Td>Total/Average</Td><Td right>{d.metricsTotal.nightsSold}</Td><Td right>{naira(d.metricsTotal.totalRevenue)}</Td><Td right>{naira(d.metricsTotal.adr)}</Td><Td right>{naira(d.metricsTotal.revPar)}</Td><Td right>100%</Td></TotalRow>
            </DataTable>
          </SectionCard>
          <SectionCard title="Future Availability Forecast">
            <DataTable cols={[{ label: 'Room Type' }, { label: 'Total Bookings', right: true }, { label: 'Unique Rooms Booked', right: true }, { label: 'Booking Rate', right: true }, { label: 'Available Rooms', right: true }]}>
              {d.forecast.map((r) => (
                <tr key={r.roomType}><Td className="font-semibold">{r.roomType}</Td><Td right>{r.totalBookings}</Td><Td right>{r.uniqueRoomsBooked}</Td><Td right>{pct(r.bookingRate)}</Td><Td right>{r.availableRooms}</Td></tr>
              ))}
            </DataTable>
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}

/* ─────────── Guest Movement ─────────── */
interface Move { date: string; count: number; guests: { name: string | null; room: string; time: string }[] }
interface GM {
  range: { start: string; end: string };
  stats: { totalCheckIns: number; totalCheckOuts: number; completedStays: number; nationalities: number };
  checkIns: Move[]; checkOuts: Move[];
  stayDurations: { guestName: string | null; checkIn: string; checkOut: string; nights: number }[];
  nationalities: { nationality: string; guests: number; percentage: number }[];
  nationalityTotal: number;
  durationStats: { average: number; longest: number; shortest: number; totalRoomNights: number };
}

const Timeline = ({ title, rows, countLabel }: { title: string; rows: Move[]; countLabel: string }) => (
  <SectionCard title={title}>
    <DataTable cols={[{ label: 'Date' }, { label: countLabel, right: true }, { label: 'Guest Details' }]}>
      {rows.length === 0 && <EmptyRow span={3}>Nothing recorded in this period</EmptyRow>}
      {rows.map((r) => (
        <tr key={r.date}>
          <Td className="whitespace-nowrap font-semibold">{dShort(r.date)}</Td>
          <Td right>{r.count}</Td>
          <Td>
            <div className="flex flex-wrap gap-2">
              {r.guests.map((g, i) => (
                <span key={i} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{g.name} - Room {g.room} ({tShort(g.time)})</span>
              ))}
            </div>
          </Td>
        </tr>
      ))}
    </DataTable>
  </SectionCard>
);

export function GuestMovementReport() {
  const f = useFilters({ start: daysAgo(3), end: daysAgo(0) });
  const q = useGet<GM>('/reports/guest-movement', f.applied);
  const d = q.data;

  const exportPdf = () => d && exportReportPdf({
    title: 'Guest Movement Report', subtitle: `${d.range.start} to ${d.range.end}`, filename: `guest-movement-${d.range.start}-to-${d.range.end}.pdf`,
    stats: [['Check-ins', d.stats.totalCheckIns], ['Check-outs', d.stats.totalCheckOuts], ['Completed Stays', d.stats.completedStays], ['Nationalities', d.stats.nationalities]],
    sections: [
      { title: 'Check-ins Timeline', head: ['Date', 'Check-ins', 'Guests'], body: d.checkIns.map((r) => [dShort(r.date), r.count, r.guests.map((g) => `${g.name} (Room ${g.room})`).join(', ')]) },
      { title: 'Check-outs Timeline', head: ['Date', 'Check-outs', 'Guests'], body: d.checkOuts.map((r) => [dShort(r.date), r.count, r.guests.map((g) => `${g.name} (Room ${g.room})`).join(', ')]) },
      { title: 'Stay Duration Patterns', head: ['Guest', 'Check-in', 'Check-out', 'Nights'], body: d.stayDurations.map((r) => [r.guestName ?? '', dShort(r.checkIn), dShort(r.checkOut), r.nights]) },
      { title: 'Guest Nationalities', head: ['Nationality', 'Guests', 'Percentage'], body: d.nationalities.map((r) => [r.nationality, r.guests, pct(r.percentage)]) },
    ],
  });

  return (
    <ReportPage>
      <PageTitle title="Guest Movement Report" />
      <Card className="p-5">
        <div className="grid items-end gap-3.5 md:grid-cols-4">
          <FieldBox label="Start Date"><input type="date" className={inputCls} value={f.draft.start} onChange={(e) => f.setDraft({ ...f.draft, start: e.target.value })} /></FieldBox>
          <FieldBox label="End Date"><input type="date" className={inputCls} value={f.draft.end} onChange={(e) => f.setDraft({ ...f.draft, end: e.target.value })} /></FieldBox>
          <Btn onClick={f.apply} disabled={!f.draft.start || !f.draft.end}>Generate Report</Btn>
          <Btn variant="green" onClick={exportPdf} disabled={!d}><FileDown className="h-4 w-4" /> Export PDF</Btn>
        </div>
      </Card>
      {q.error && <ErrorBox error={q.error} />}
      {!d ? <Loading /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Tile tone="cyan" value={d.stats.totalCheckIns} label="Total Check-ins" icon={LogIn} />
            <Tile tone="amber" value={d.stats.totalCheckOuts} label="Total Check-outs" icon={LogOut} />
            <Tile tone="green" value={d.stats.completedStays} label="Completed Stays" icon={UserCheck} />
            <Tile tone="blue" value={d.stats.nationalities} label="Nationalities" icon={Globe} />
          </div>
          <Timeline title="Check-ins Timeline" rows={d.checkIns} countLabel="Check-ins" />
          <Timeline title="Check-outs Timeline" rows={d.checkOuts} countLabel="Check-outs" />
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="Stay Duration Patterns">
              <DataTable cols={[{ label: 'Guest Name' }, { label: 'Check-in' }, { label: 'Check-out' }, { label: 'Nights', right: true }]}>
                {d.stayDurations.length === 0 && <EmptyRow span={4}>No completed stays</EmptyRow>}
                {d.stayDurations.map((r, i) => (
                  <tr key={i}><Td className="font-semibold">{r.guestName}</Td><Td className="text-slate-500">{dShort(r.checkIn)}</Td><Td className="text-slate-500">{dShort(r.checkOut)}</Td><Td right>{r.nights}</Td></tr>
                ))}
              </DataTable>
            </SectionCard>
            <SectionCard title="Guest Nationalities">
              <DataTable cols={[{ label: 'Nationality' }, { label: 'Guests', right: true }, { label: 'Percentage', right: true }]}>
                {d.nationalities.map((r) => (<tr key={r.nationality}><Td>{r.nationality}</Td><Td right>{r.guests}</Td><Td right>{pct(r.percentage)}</Td></tr>))}
                <TotalRow><Td>Total</Td><Td right>{d.nationalityTotal}</Td><Td right>100%</Td></TotalRow>
              </DataTable>
            </SectionCard>
          </div>
          <SectionCard title="Stay Duration Statistics">
            <div className="grid gap-3 px-5 pb-5 md:grid-cols-4">
              {([['Average Stay (Nights)', d.durationStats.average, 'text-blue-600'], ['Longest Stay (Nights)', d.durationStats.longest, 'text-green-600'], ['Shortest Stay (Nights)', d.durationStats.shortest, 'text-cyan-600'], ['Total Room Nights', d.durationStats.totalRoomNights, 'text-amber-600']] as const).map(([label, v, c]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 py-5 text-center">
                  <div className={cn('text-2xl font-bold', c)}>{v}</div>
                  <div className="mt-1 text-sm text-slate-600">{label}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}

/* ─────────── Housekeeping Status ─────────── */
interface HK {
  stats: { cleanAndReady: number; dirty: number; inProgress: number; inspected: number };
  rooms: { roomId: string; number: string; roomType: string; roomStatus: string; cleaningStatus: string; guestName: string | null; lastUpdated: string | null }[];
  maintenance: { id: string; room: string | null; roomType: string | null; issueType: string; title: string; reportedBy: string | null; reportedAt: string; status: string }[];
  recentlyCleaned: { id: string; room: string; roomType: string; cleaningStatus: string; cleanedBy: string; lastUpdated: string; roomStatus: string }[];
  progress: { totalRooms: number; completionRate: number; pendingMaintenance: number };
}
const CLEAN_PILL: Record<string, { tone: 'green' | 'red' | 'yellow' | 'blue'; label: string }> = {
  CLEAN: { tone: 'green', label: 'Clean' }, DIRTY: { tone: 'red', label: 'Dirty' },
  IN_PROGRESS: { tone: 'yellow', label: 'In Progress' }, AWAITING_INSPECTION: { tone: 'blue', label: 'Awaiting Inspection' },
};
const roomPill = (s: string) => (ROOM_STYLE[s] ?? ROOM_STYLE.AVAILABLE);

export function HousekeepingStatusReport() {
  const q = useGet<HK>('/reports/housekeeping-status');
  const d = q.data;
  return (
    <ReportPage wide>
      <PageTitle title="Housekeeping Status Report" />
      {q.error && <ErrorBox error={q.error} />}
      {!d ? <Loading /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Tile tone="green" value={d.stats.cleanAndReady} label="Clean & Ready" icon={Check} />
            <Tile tone="red" value={d.stats.dirty} label="Dirty" icon={Brush} />
            <Tile tone="yellow" value={d.stats.inProgress} label="In Progress" icon={Loader2} />
            <Tile tone="blue" value={d.stats.inspected} label="Inspected" icon={ClipboardCheck} />
          </div>

          <SectionCard title="Room Cleaning Status">
            <DataTable cols={[{ label: 'Room Number' }, { label: 'Room Type' }, { label: 'Room Status' }, { label: 'Cleaning Status' }, { label: 'Guest Name' }, { label: 'Last Updated' }, { label: 'Actions' }]}>
              {d.rooms.map((r) => {
                const c = CLEAN_PILL[r.cleaningStatus] ?? CLEAN_PILL.CLEAN;
                return (
                  <tr key={r.roomId}>
                    <Td className="font-semibold">{r.number}</Td>
                    <Td className="text-slate-600">{r.roomType}</Td>
                    <Td><Pill tone={roomPill(r.roomStatus).pill}>{roomPill(r.roomStatus).label}</Pill></Td>
                    <Td><Pill tone={c.tone}>{c.label}</Pill></Td>
                    <Td className="text-slate-600">{r.guestName ?? '-'}</Td>
                    <Td className="whitespace-nowrap text-slate-600">{dtShort(r.lastUpdated)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Link to="/housekeeping" title="Open housekeeping board" className="text-blue-600 hover:text-blue-800"><Edit className="h-4 w-4" /></Link>
                        <Link to="/rooms" title="View room" className="text-slate-800 hover:text-black"><Eye className="h-4 w-4" /></Link>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </DataTable>
          </SectionCard>

          <SectionCard title="Maintenance Requests">
            <DataTable cols={[{ label: 'Room Number' }, { label: 'Room Type' }, { label: 'Issue Type' }, { label: 'Reported By' }, { label: 'Reported At' }, { label: 'Status' }, { label: 'Actions' }]}>
              {d.maintenance.length === 0 && <EmptyRow span={7}>No maintenance requests</EmptyRow>}
              {d.maintenance.map((m) => (
                <tr key={m.id}>
                  <Td className="font-semibold">{m.room ?? '—'}</Td><Td className="text-slate-600">{m.roomType ?? '—'}</Td>
                  <Td>{titleCase(m.issueType)}</Td><Td className="text-slate-600">{m.reportedBy ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-slate-600">{dtShort(m.reportedAt)}</Td>
                  <Td><Pill tone={m.status === 'IN_PROGRESS' ? 'yellow' : 'red'}>{titleCase(m.status)}</Pill></Td>
                  <Td><Link to="/maintenance/requests" title="View request" className="text-blue-600 hover:text-blue-800"><Eye className="h-4 w-4" /></Link></Td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>

          <SectionCard title="Recently Cleaned Rooms">
            <DataTable cols={[{ label: 'Room Number' }, { label: 'Room Type' }, { label: 'Cleaning Status' }, { label: 'Cleaned By' }, { label: 'Last Updated' }, { label: 'Room Status' }]}>
              {d.recentlyCleaned.length === 0 && <EmptyRow span={6}>No rooms cleaned yet</EmptyRow>}
              {d.recentlyCleaned.map((r) => (
                <tr key={r.id}>
                  <Td className="font-semibold">{r.room}</Td><Td className="text-slate-600">{r.roomType}</Td>
                  <Td><Pill tone="green">Clean</Pill></Td><Td>{r.cleanedBy}</Td>
                  <Td className="whitespace-nowrap text-slate-600">{dtShort(r.lastUpdated)}</Td>
                  <Td><Pill tone={roomPill(r.roomStatus).pill}>{roomPill(r.roomStatus).label}</Pill></Td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>

          <SectionCard title="Housekeeping Progress">
            <div className="grid gap-3 px-5 pb-5 md:grid-cols-3">
              {([[d.progress.totalRooms, 'Total Rooms', 'text-blue-600'], [`${pct(d.progress.completionRate)}`, 'Cleaning Completion Rate', 'text-green-600'], [d.progress.pendingMaintenance, 'Pending Maintenance', 'text-amber-600']] as const).map(([v, label, c]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 py-5 text-center">
                  <div className={cn('text-2xl font-bold', c)}>{v}</div>
                  <div className="mt-1 text-sm text-slate-600">{label}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}