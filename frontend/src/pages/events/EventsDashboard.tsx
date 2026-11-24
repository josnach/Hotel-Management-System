import { Link } from 'react-router-dom';
import { BarChart3, Building2, CalendarCheck, CalendarDays, CalendarX, HelpCircle, Users, type LucideIcon } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { ErrorBox, Loading } from '@/components/common';
import { Card, DataTable, PageTitle, Pill, ReportPage, Td, naira } from '@/components/reports/ui';
import { BorderStat, EVENT_STATUS, LinkBtn, eventWhen, type BookingRow } from '@/components/events/ui';

interface Dash {
  stats: { upcomingEvents: number; activeClients: number; totalRevenue: number | string; pendingInquiries: number };
  upcoming: BookingRow[];
}

const LINKS: { title: string; sub: string; to: string; icon: LucideIcon; tone: string }[] = [
  { title: 'Event Bookings', sub: 'Manage all events', to: '/events/bookings', icon: CalendarCheck, tone: 'bg-blue-100 text-blue-600' },
  { title: 'Clients', sub: 'Manage event clients', to: '/events/clients', icon: Users, tone: 'bg-green-100 text-green-600' },
  { title: 'Facilities', sub: 'Manage venues & facilities', to: '/events/facilities', icon: Building2, tone: 'bg-purple-100 text-purple-600' },
  { title: 'Reports', sub: 'View event analytics', to: '/events/reports', icon: BarChart3, tone: 'bg-orange-100 text-orange-600' },
];

export default function EventsDashboard() {
  const q = useGet<Dash>('/events/dashboard');
  const d = q.data;
  return (
    <ReportPage wide>
      <PageTitle title="Events Management">
        <LinkBtn to="/events/bookings/new" tone="blue">New Booking</LinkBtn>
        <LinkBtn to="/events/clients/new" tone="green">New Client</LinkBtn>
      </PageTitle>
      {q.error && <ErrorBox error={q.error} />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BorderStat label="Upcoming Events" value={d?.stats.upcomingEvents ?? 0} border="border-[#4280ef]" circle="bg-blue-100 text-blue-600" icon={CalendarDays} />
        <BorderStat label="Active Clients" value={d?.stats.activeClients ?? 0} border="border-[#3bcc67]" circle="bg-green-100 text-green-600" icon={Users} />
        <BorderStat label="Total Revenue" value={naira(d?.stats.totalRevenue)} border="border-[#9e42eb]" circle="bg-purple-100 text-purple-600" icon={({ className }) => <span className={`${className} text-center text-lg font-bold leading-5`}>₦</span>} />
        <BorderStat label="Pending Inquiries" value={d?.stats.pendingInquiries ?? 0} border="border-[#e56b1e]" circle="bg-orange-100 text-orange-600" icon={HelpCircle} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {LINKS.map(({ title, sub, to, icon: Icon, tone }) => (
          <Link key={to} to={to} className="flex items-center gap-3 rounded-lg border border-transparent bg-white p-4 shadow-md transition hover:border-blue-300">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full ${tone}`}><Icon className="h-5 w-5" /></span>
            <span><span className="block font-semibold text-slate-900">{title}</span><span className="block text-sm text-slate-500">{sub}</span></span>
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <h2 className="text-lg font-semibold text-slate-900">Upcoming Events</h2>
          <Link to="/events/bookings" className="text-sm font-medium text-blue-600 hover:underline">View All Events</Link>
        </div>
        {!d ? <Loading /> : (
          <>
            <DataTable cols={[{ label: 'Event' }, { label: 'Client' }, { label: 'Date & Time' }, { label: 'Facilities' }, { label: 'Status' }, { label: 'Actions' }]}>
              {d.upcoming.map((b) => (
                <tr key={b.id}>
                  <Td className="font-medium">{b.title}</Td>
                  <Td>{b.clientName}</Td>
                  <Td className="whitespace-nowrap">{eventWhen(b.startsAt, b.endsAt)}</Td>
                  <Td>{b.facilities.join(', ') || '—'}</Td>
                  <Td><Pill tone={EVENT_STATUS[b.status]?.tone}>{EVENT_STATUS[b.status]?.label ?? b.status}</Pill></Td>
                  <Td><Link to={`/events/bookings/${b.id}`} className="text-sm font-medium text-blue-600 hover:underline">View</Link></Td>
                </tr>
              ))}
            </DataTable>
            {d.upcoming.length === 0 && (
              <div className="flex flex-col items-center py-12 text-slate-500">
                <CalendarX className="h-8 w-8 text-slate-400" />
                <div className="mt-3">No upcoming events found</div>
              </div>
            )}
          </>
        )}
      </Card>
    </ReportPage>
  );
}