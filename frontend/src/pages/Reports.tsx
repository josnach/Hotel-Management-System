import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { d, dt, money, monthStart, num, today } from '@/lib/utils';
import { Field, PageHeader, PrintButton, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';

const DateBar = ({ date, setDate }: { date: string; setDate: (v: string) => void }) => <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />;
const bucketCards = (dist: Record<string, number> | undefined, defs: [string, string, string][]) => <div className="mb-4 grid gap-3 md:grid-cols-4">{defs.map(([k, l, h]) => <Card key={k} className="p-3"><div className="flex justify-between text-sm"><b>{l}</b><Badge variant="blue">{dist?.[k] ?? 0}</Badge></div><div className="text-xs text-muted-foreground">{h}</div></Card>)}</div>;

export function CheckInReport() {
  const [date, setDate] = useState(today()); const { data } = useGet('/reports/check-in', { date });
  return (<Card className="mx-auto max-w-5xl p-6"><PageHeader title="Check-in Report" subtitle={`Report Date: ${date}`}><DateBar date={date} setDate={setDate} /><PrintButton /></PageHeader>
    <div className="mb-4 grid gap-3 md:grid-cols-4"><Stat tone="blue" label="Total Check-ins" value={data?.totalCheckIns ?? 0} /><Stat tone="green" label="Individual" value={data?.individual ?? 0} /><Stat tone="purple" label="Group" value={data?.group ?? 0} /><Stat tone="yellow" label="Total Guests" value={data?.totalGuests ?? 0} /></div>
    <h3 className="mb-2 font-semibold">Check-in Time Distribution</h3>{bucketCards(data?.distribution, [['morning', 'Morning', '06:00 - 11:59'], ['afternoon', 'Afternoon', '12:00 - 17:59'], ['evening', 'Evening', '18:00 - 23:59'], ['night', 'Night', '00:00 - 05:59']])}
    <h3 className="mb-2 font-semibold">Check-in Details</h3><ListCard rows={data?.rows} empty="No check-ins found for this date" cols={[{ header: 'Time', cell: (s: any) => new Date(s.checkInAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) }, { header: 'Guest Name', cell: (s: any) => `${s.guest.firstName} ${s.guest.lastName}` }, { header: 'Room', cell: (s: any) => s.room.number }, { header: 'Type', cell: (s: any) => (s.group ? 'Group' : 'Individual') }, { header: 'Group', cell: (s: any) => s.group?.name ?? '—' }, { header: 'Guests', cell: (s: any) => s.numGuests }]} /></Card>);
}

export function CheckOutReport() {
  const [date, setDate] = useState(today()); const { data } = useGet('/reports/check-out', { date });
  return (<Card className="mx-auto max-w-5xl p-6"><PageHeader title="Check-out Report" subtitle={`Report Date: ${date}`}><DateBar date={date} setDate={setDate} /><PrintButton /></PageHeader>
    <div className="mb-4 grid gap-3 md:grid-cols-4"><Stat tone="red" label="Total Check-outs" value={data?.totalCheckOuts ?? 0} /><Stat tone="green" label="Individual" value={data?.individual ?? 0} /><Stat tone="purple" label="Group" value={data?.group ?? 0} /><Stat tone="yellow" label="Rooms Vacated" value={data?.roomsVacated ?? 0} /></div>
    <h3 className="mb-2 font-semibold">Check-out Time Distribution</h3>{bucketCards(data?.distribution, [['earlyMorning', 'Early Morning', '00:00 - 05:59'], ['morning', 'Morning', '06:00 - 11:59'], ['afternoon', 'Afternoon', '12:00 - 17:59'], ['evening', 'Evening', '18:00 - 23:59']])}
    <Card className="mb-4 bg-blue-50 p-4"><b className="text-blue-800">Financial Summary</b><div className="mt-2 grid grid-cols-3 text-center"><div><div className="text-xs">Total Revenue</div><b>{money(data?.financial?.totalRevenue)}</b></div><div><div className="text-xs">Total Payments</div><b className="text-green-600">{money(data?.financial?.totalPayments)}</b></div><div><div className="text-xs">Net Balance</div><b>{money(data?.financial?.netBalance)}</b></div></div></Card>
    <ListCard rows={data?.rows} empty="No check-outs found for this date" cols={[{ header: 'Time', cell: (s: any) => new Date(s.checkOutAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) }, { header: 'Guest', cell: (s: any) => `${s.guest.firstName} ${s.guest.lastName}` }, { header: 'Room', cell: (s: any) => s.room.number }, { header: 'Type', cell: (s: any) => (s.group ? 'Group' : 'Individual') }]} /></Card>);
}

export function OccupancyReport() {
  const [date, setDate] = useState(today()); const { data } = useGet('/reports/occupancy'); const st = data?.status;
  return (<Card className="mx-auto max-w-5xl p-6"><PageHeader title="Occupancy Report" subtitle={`Date: ${date}`}><DateBar date={date} setDate={setDate} /><PrintButton /></PageHeader>
    <div className="mb-4 grid gap-3 md:grid-cols-4"><Stat tone="blue" label="Occupancy Rate" value={`${num(data?.occupancyRate, 1)}%`} sub={`${data?.occupied ?? 0}/${data?.totalRooms ?? 0} rooms`} /><Stat tone="green" label="Average Daily Rate" value={money(data?.adr)} sub="Per occupied room" /><Stat tone="purple" label="RevPAR" value={money(data?.revPar)} sub="Revenue per available room" /><Stat tone="yellow" label="Total Revenue" value={money(data?.totalRevenue)} /></div>
    <h3 className="mb-2 font-semibold">Room Status Overview</h3><div className="mb-4 grid gap-3 md:grid-cols-5"><Stat label="Total Rooms" value={st?.total ?? 0} /><Stat tone="red" label="Occupied" value={st?.occupied ?? 0} /><Stat tone="green" label="Available" value={st?.available ?? 0} /><Stat tone="blue" label="Reserved" value={st?.reserved ?? 0} /><Stat tone="yellow" label="Maintenance" value={st?.maintenance ?? 0} /></div>
    <h3 className="mb-2 font-semibold">Room Type Analysis</h3><ListCard rows={data?.byRoomType} cols={[{ header: 'Room Type', cell: (r: any) => r.roomType }, { header: 'Total Rooms', cell: (r: any) => r.total }, { header: 'Occupied', cell: (r: any) => r.occupied }, { header: 'Available', cell: (r: any) => r.available }, { header: 'Occupancy Rate', cell: (r: any) => `${num(r.occupancyRate, 1)}%` }, { header: 'Average Rate', cell: (r: any) => money(r.averageRate) }]} /></Card>);
}

export function SalesSummary() {
  const [f, setF] = useState({ start: today(), end: today(), method: '', salesPointIds: [] as string[] }); const [ap, setAp] = useState<any>({ start: today(), end: today() });
  const { data: sps } = useGet<any[]>('/sales-points'); const { data } = useGet('/reports/sales-summary', { ...ap, salesPointIds: ap.salesPointIds?.join(',') });
  const toggle = (id: string) => setF({ ...f, salesPointIds: f.salesPointIds.includes(id) ? f.salesPointIds.filter((x) => x !== id) : [...f.salesPointIds, id] });
  return (<>
    <PageHeader title="Detailed Sales Summary" subtitle="Detailed sales report grouped by sales point with itemized breakdown"><PrintButton /></PageHeader>
    <Card className="mb-4 space-y-3 p-4"><div className="grid gap-3 md:grid-cols-3"><Field label="Start Date"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field><Field label="End Date"><Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field><Field label="Payment Method"><NativeSelect value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="">All Methods</option>{['CASH', 'CARD', 'TRANSFER', 'ROOM_CHARGE', 'CITY_LEDGER'].map((m) => <option key={m}>{m}</option>)}</NativeSelect></Field></div>
      <div><div className="mb-1 flex gap-3 text-sm font-medium">Sales Points <button className="text-xs text-blue-700" onClick={() => setF({ ...f, salesPointIds: sps?.map((s) => s.id) ?? [] })}>Select All</button><button className="text-xs text-blue-700" onClick={() => setF({ ...f, salesPointIds: [] })}>Clear All</button></div><div className="flex flex-wrap gap-4 text-sm">{sps?.map((s) => <label key={s.id} className="flex items-center gap-1.5"><input type="checkbox" checked={f.salesPointIds.includes(s.id)} onChange={() => toggle(s.id)} />{s.name}</label>)}</div></div>
      <Button onClick={() => setAp(f)}>Generate Report</Button></Card>
    <Stat tone="green" label="Grand Total" value={money(data?.grandTotal)} className="mb-4" />
    {data?.groups?.map((g: any) => <Card key={g.salesPoint} className="mb-4 overflow-hidden"><div className="flex justify-between bg-slate-100 px-4 py-2 font-semibold"><span>{g.salesPoint}</span><span>{money(g.total)}</span></div><table className="w-full text-sm"><tbody>{g.orders.map((o: any) => <tr key={o.id} className="border-b"><td className="px-4 py-2">{dt(o.createdAt)}</td><td>{o.orderNo}</td><td>{o.items.map((i: any) => `${i.quantity}× ${i.item.name}`).join(', ')}</td><td>{o.paymentMethod}</td><td>{o.staff.username}</td><td className="px-4 text-right font-medium">{money(o.total)}</td></tr>)}</tbody></table></Card>)}
    {!data?.groups?.length && <Card className="p-10 text-center text-sm text-muted-foreground">No transactions found for the selected criteria.</Card>}
  </>);
}

export function Complimentary() {
  const [f, setF] = useState({ start: monthStart(), end: today() }); const [ap, setAp] = useState(f); const { data } = useGet('/reports/complimentary', ap);
  const list = (t: string, rows: any[] | undefined) => <Card className="p-4"><b>{t}</b>{!rows?.length ? <p className="py-6 text-center text-sm text-muted-foreground">No data</p> : rows.map((r) => <div key={r.name} className="flex justify-between border-b py-1 text-sm"><span>{r.name}</span><b>{r.count}</b></div>)}</Card>;
  return (<>
    <PageHeader title="Complimentary Stay Report" subtitle="Track and analyze complimentary stays across the hotel" />
    <Card className="mb-4 flex items-end gap-3 p-4"><Field label="Start Date"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field><Field label="End Date"><Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field><Button variant="purple" onClick={() => setAp(f)}>Apply Filter</Button></Card>
    <div className="mb-4 grid gap-3 md:grid-cols-4"><Stat tone="purple" label="Total Complimentary Stays" value={data?.totalStays ?? 0} /><Stat tone="green" label="Total Comp Value" value={money(data?.totalValue)} /><Stat tone="blue" label="Average Comp Value" value={money(data?.averageValue)} /><Stat tone="yellow" label="Period" value={<span className="text-base">{d(ap.start)} – {d(ap.end)}</span>} /></div>
    <div className="grid gap-4 md:grid-cols-2">{list('Complimentary Stays by Reason', data?.byReason)}{list('Complimentary Stays by Authorizer', data?.byAuthorizer)}</div></>);
}

export function Shifts() {
  const [sp] = useSearchParams(); const combined = sp.get('combined'); const [date, setDate] = useState(today()); const { data } = useGet('/reports/shifts', { date });
  return (<>
    <PageHeader title={combined ? 'Combined Shifts Report' : 'Shift Report'}><DateBar date={date} setDate={setDate} /><PrintButton /></PageHeader>
    {combined && <div className="mb-4 grid gap-3 md:grid-cols-3"><Stat tone="red" label="Billings" value={money(data?.combined?.billings)} /><Stat tone="green" label="Payments" value={money(data?.combined?.payments)} /><Stat tone="blue" label="Transactions" value={data?.combined?.transactions ?? 0} /></div>}
    {data?.shifts?.map((s: any) => <Card key={s.name} className="mb-4 p-4"><div className="mb-3 flex justify-between"><div className="font-semibold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-green-500" />{s.name[0] + s.name.slice(1).toLowerCase()} Shift <span className="text-xs font-normal text-muted-foreground">{s.label}</span></div><span className="text-xs text-muted-foreground">{s.transactions} transactions</span></div>
      <div className="mb-3 grid gap-3 md:grid-cols-4"><Stat tone="red" label="Billings" value={money(s.billings)} /><Stat tone="green" label="Payments" value={money(s.payments)} /><Stat tone="blue" label="Collection Rate" value={`${num(s.collectionRate, 1)}%`} /><Stat label="Avg. Transaction" value={money(s.averageTransaction)} /></div>
      {!combined && <ListCard rows={s.rows} empty={`No transactions for this shift on ${date}`} cols={[{ header: 'Time', cell: (t: any) => new Date(t.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) }, { header: 'Guest / Room', cell: (t: any) => `${t.folio.guest?.firstName ?? ''} ${t.folio.guest?.lastName ?? ''} ${t.folio.stay?.room?.number ? `(${t.folio.stay.room.number})` : ''}` }, { header: 'Description', cell: (t: any) => t.description }, { header: 'Billing', cell: (t: any) => (Number(t.bill) ? money(t.bill) : '') }, { header: 'Payment', cell: (t: any) => (Number(t.payment) ? money(t.payment) : '') }]} />}</Card>)}</>);
}

export function SecurityReport() {
  const [f, setF] = useState({ start: '', end: '', guestStatus: '', securityStatus: '' }); const [ap, setAp] = useState({}); const { data } = useGet('/security/dss', ap);
  const flag = useAction((v: { id: string; status: string }) => api.post(`/security/guests/${v.id}/report`, v), { success: 'Security status updated', invalidate: ['/security/dss'] });
  return (<>
    <PageHeader title="Easy-Security Report" subtitle="Comprehensive security analysis of hotel guests and activities"><PrintButton label="PDF" /></PageHeader>
    <Card className="mb-4 p-4"><div className="grid gap-3 md:grid-cols-4"><Field label="Start Date"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field><Field label="End Date"><Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field><Field label="Guest Status"><NativeSelect value={f.guestStatus} onChange={(e) => setF({ ...f, guestStatus: e.target.value })}><option value="">All Guests</option><option value="CHECKED_IN">Checked in</option><option value="CHECKED_OUT">Checked out</option></NativeSelect></Field><Field label="Security Status"><NativeSelect value={f.securityStatus} onChange={(e) => setF({ ...f, securityStatus: e.target.value })}><option value="">All Statuses</option><option>PENDING</option><option>VERIFIED</option><option>FLAGGED</option></NativeSelect></Field></div><Button className="mt-3" onClick={() => setAp(f)}>Apply</Button></Card>
    <div className="mb-4 grid gap-3 md:grid-cols-4"><Stat tone="blue" label="Total Guests" value={data?.totalGuests ?? 0} /><Stat tone="green" label="Currently Checked-in" value={data?.currentlyCheckedIn ?? 0} /><Stat tone="yellow" label="Foreign Guests" value={data?.foreignGuests ?? 0} /><Stat tone="red" label="Without ID" value={data?.withoutId ?? 0} /></div>
    <ListCard rows={data?.rows} cols={[{ header: 'Guest', cell: (g: any) => `${g.firstName} ${g.lastName}` }, { header: 'ID', cell: (g: any) => (g.idNumber ? `${g.idType ?? ''} ${g.idNumber}` : <Badge variant="red">No ID</Badge>) }, { header: 'Nationality', cell: (g: any) => g.nationality ?? 'Not specified' }, { header: 'Status', cell: (g: any) => <Badge variant={statusVariant(g.securityStatus)}>{g.securityStatus}</Badge> }, { header: 'Actions', cell: (g: any) => <div className="flex gap-2"><Button size="sm" variant="success" onClick={() => flag.mutate({ id: g.id, status: 'VERIFIED' })}>Verify</Button><Button size="sm" variant="destructive" onClick={() => flag.mutate({ id: g.id, status: 'FLAGGED' })}>Flag</Button></div> }]} /></>);
}

export function GuestsInfo() {
  const [q, setQ] = useState(''); const [page, setPage] = useState(1); const { data } = useGet('/security/guests-info', { q, page });
  return (<Card className="mx-auto max-w-5xl p-6"><div className="mb-3 flex items-start justify-between"><div><h1 className="text-xl font-bold">Guest Contact Information</h1><p className="text-sm text-muted-foreground">All guest contact details in one place</p></div><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="w-64 pl-8" placeholder="Search by name, email, phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div></div>
    <p className="mb-2 text-xs text-muted-foreground">Showing {data?.rows?.length ?? 0} of {data?.total ?? 0} guests</p>
    <ListCard rows={data?.rows} cols={[{ header: 'Name', cell: (g: any) => <div><b>{g.firstName} {g.lastName}</b>{g.checkedIn && <Badge variant="green" className="ml-2">Checked In</Badge>}</div> }, { header: 'Contact Info', cell: (g: any) => <div className="text-xs text-blue-700">{g.email}<br />{g.phone}</div> }, { header: 'Identification', cell: (g: any) => (g.idNumber ? <div className="text-xs">{g.idType}<br /><span className="text-muted-foreground">{g.idNumber}</span></div> : <i className="text-xs text-muted-foreground">Not provided</i>) }, { header: 'Nationality', cell: (g: any) => g.nationality ?? 'Not specified' }, { header: 'Status', cell: (g: any) => <Badge variant={statusVariant(g.securityStatus)}>{g.securityStatus}</Badge> }]} />
    <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={(data?.rows?.length ?? 0) < 20} onClick={() => setPage(page + 1)}>Next</Button></div></Card>);
}
