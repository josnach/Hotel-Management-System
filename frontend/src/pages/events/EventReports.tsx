import { Banknote, CalendarCheck, CalendarDays, Wallet } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { ErrorBox, Loading } from '@/components/common';
import { Btn, Card, DataTable, EmptyRow, FieldBox, PageTitle, ReportPage, SectionCard, StatCard, Td, daysAgo, inputCls, naira, useFilters } from '@/components/reports/ui';
import { EVENT_STATUS, LinkBtn, typeInfo } from '@/components/events/ui';

interface Data {
  range: { start: string; end: string };
  stats: { totalEvents: number; completedEvents: number; totalRevenue: number | string; outstanding: number | string };
  byStatus: { status: string; count: number }[];
  facilityUsage: { facilityId: string; name: string; type: string; bookings: number; revenue: number | string }[];
  topClients: { id: string; name: string; events: number; revenue: number | string }[];
}

export default function EventReports() {
  const f = useFilters({ start: `${daysAgo(0).slice(0, 7)}-01`, end: daysAgo(0) });
  const q = useGet<Data>('/events/reports', f.applied);
  const d = q.data;
  return (
    <ReportPage>
      <PageTitle title="Event Reports" sub="Revenue and usage for events starting in the selected period">
        <LinkBtn to="/events" tone="grey">Back to Events</LinkBtn>
      </PageTitle>
      <Card className="p-5">
        <div className="grid items-end gap-3.5 md:grid-cols-3">
          <FieldBox label="Start Date"><input type="date" className={inputCls} value={f.draft.start} onChange={(e) => f.setDraft({ ...f.draft, start: e.target.value })} /></FieldBox>
          <FieldBox label="End Date"><input type="date" className={inputCls} value={f.draft.end} onChange={(e) => f.setDraft({ ...f.draft, end: e.target.value })} /></FieldBox>
          <Btn onClick={f.apply} disabled={!f.draft.start || !f.draft.end}>Generate Report</Btn>
        </div>
      </Card>
      {q.error && <ErrorBox error={q.error} />}
      {!d ? <Loading /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Events" value={d.stats.totalEvents} icon={<CalendarDays className="h-5 w-5 text-blue-500" />} />
            <StatCard label="Completed Events" value={d.stats.completedEvents} icon={<CalendarCheck className="h-5 w-5 text-green-500" />} />
            <StatCard label="Total Revenue" value={naira(d.stats.totalRevenue)} icon={<Banknote className="h-5 w-5 text-purple-500" />} />
            <StatCard label="Outstanding Balance" value={naira(d.stats.outstanding)} icon={<Wallet className="h-5 w-5 text-orange-500" />} />
          </div>
          <SectionCard title="Facility Usage (completed events)">
            <DataTable cols={[{ label: 'Facility' }, { label: 'Type' }, { label: 'Bookings', right: true }, { label: 'Rental Revenue', right: true }]}>
              {d.facilityUsage.length === 0 && <EmptyRow span={4}>No completed events in this period</EmptyRow>}
              {d.facilityUsage.map((r) => (
                <tr key={r.facilityId}><Td className="font-medium">{r.name}</Td><Td>{typeInfo(r.type).label}</Td><Td right>{r.bookings}</Td><Td right>{naira(r.revenue)}</Td></tr>
              ))}
            </DataTable>
          </SectionCard>
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="Events by Status">
              <DataTable cols={[{ label: 'Status' }, { label: 'Events', right: true }]}>
                {d.byStatus.length === 0 && <EmptyRow span={2}>No events in this period</EmptyRow>}
                {d.byStatus.map((r) => <tr key={r.status}><Td>{EVENT_STATUS[r.status]?.label ?? r.status}</Td><Td right>{r.count}</Td></tr>)}
              </DataTable>
            </SectionCard>
            <SectionCard title="Top Clients">
              <DataTable cols={[{ label: 'Client' }, { label: 'Events', right: true }, { label: 'Revenue', right: true }]}>
                {d.topClients.length === 0 && <EmptyRow span={3}>No completed events in this period</EmptyRow>}
                {d.topClients.map((r) => <tr key={r.id}><Td className="font-medium">{r.name}</Td><Td right>{r.events}</Td><Td right>{naira(r.revenue)}</Td></tr>)}
              </DataTable>
            </SectionCard>
          </div>
        </>
      )}
    </ReportPage>
  );
}