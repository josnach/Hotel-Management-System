import { ArrowDown, ArrowLeftRight, ArrowUp, Banknote, BedDouble, FileDown, Flower2, Package, Percent, PiggyBank, PieChart, Scale, TrendingUp, User, Users, Utensils } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { ErrorBox, Loading } from '@/components/common';
import { exportReportPdf, pdfMoney } from '@/components/reports/pdf';
import { Btn, Card, DataTable, EmptyRow, FieldBox, PageTitle, ReportPage, SectionCard, StatCard, Td, Tile, TotalRow, daysAgo, dShort, inputCls, naira, useFilters } from '@/components/reports/ui';

const pct = (n: number) => `${Number(n ?? 0).toFixed(1)}%`;

/* ─────────── Daily Financial ─────────── */
interface Daily {
  date: string;
  stats: { totalRevenue: number; outstandingBalances: number; advancePayments: number; transactions: number };
  revenueBreakdown: { category: string; amount: number; percentage: number }[];
  cityLedger: { credits: number; debits: number; net: number };
  transactionSummary: { totalVolume: number; count: number; average: number };
}

export function DailyFinancialReport() {
  const f = useFilters({ date: daysAgo(0) });
  const q = useGet<Daily>('/reports/daily-financial', f.applied);
  const d = q.data;

  const exportPdf = () => d && exportReportPdf({
    title: 'Daily Financial Reconciliation & Operations Summary', subtitle: `Date: ${d.date}`, filename: `daily-financial-${d.date}.pdf`,
    stats: [['Total Revenue', pdfMoney(d.stats.totalRevenue)], ['Outstanding', pdfMoney(d.stats.outstandingBalances)], ['Advance Payments', pdfMoney(d.stats.advancePayments)], ['Transactions', d.stats.transactions]],
    sections: [
      { title: 'Revenue Breakdown', head: ['Category', 'Amount', 'Percentage'], body: d.revenueBreakdown.map((r) => [r.category, pdfMoney(r.amount), `${r.percentage}%`]) },
      { title: 'City Ledger Movements', head: ['Type', 'Amount'], body: [['Credits', pdfMoney(d.cityLedger.credits)], ['Debits', pdfMoney(d.cityLedger.debits)], ['Net Movement', pdfMoney(d.cityLedger.net)]] },
      { title: 'Transaction Summary', head: ['Metric', 'Value'], body: [['Total Transaction Volume', pdfMoney(d.transactionSummary.totalVolume)], ['Number of Transactions', d.transactionSummary.count], ['Average Transaction Value', pdfMoney(d.transactionSummary.average)]] },
    ],
  });

  return (
    <ReportPage>
      <PageTitle title="Daily Financial Reconciliation & Operations Summary" />
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
            <StatCard label="Total Revenue" value={naira(d.stats.totalRevenue)} icon={<Banknote className="h-5 w-5 text-blue-500" />} />
            <StatCard label="Outstanding Balances" value={naira(d.stats.outstandingBalances)} icon={<Scale className="h-5 w-5 text-amber-500" />} />
            <StatCard label="Advance Payments" value={naira(d.stats.advancePayments)} icon={<PiggyBank className="h-5 w-5 text-green-500" />} />
            <StatCard label="Transactions" value={d.stats.transactions} icon={<ArrowLeftRight className="h-5 w-5 text-cyan-500" />} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="Revenue Breakdown">
              <DataTable cols={[{ label: 'Category' }, { label: 'Amount', right: true }, { label: 'Percentage', right: true }]}>
                {d.revenueBreakdown.map((r) => (
                  <tr key={r.category}><Td>{r.category}</Td><Td right>{naira(r.amount)}</Td><Td right>{r.percentage}%</Td></tr>
                ))}
              </DataTable>
            </SectionCard>
            <SectionCard title="City Ledger Movements">
              <DataTable cols={[{ label: 'Type' }, { label: 'Amount', right: true }]}>
                <tr><Td>Credits</Td><Td right>{naira(d.cityLedger.credits)}</Td></tr>
                <tr><Td>Debits</Td><Td right>{naira(d.cityLedger.debits)}</Td></tr>
                <TotalRow><Td>Net Movement</Td><Td right>{naira(d.cityLedger.net)}</Td></TotalRow>
              </DataTable>
            </SectionCard>
          </div>
          <SectionCard title="Transaction Summary">
            <DataTable cols={[{ label: 'Metric' }, { label: 'Value', right: true }]}>
              <tr><Td>Total Transaction Volume</Td><Td right>{naira(d.transactionSummary.totalVolume)}</Td></tr>
              <tr><Td>Number of Transactions</Td><Td right>{d.transactionSummary.count}</Td></tr>
              <tr><Td>Average Transaction Value</Td><Td right>{naira(d.transactionSummary.average)}</Td></tr>
            </DataTable>
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}

/* ─────────── Revenue Breakdown by Department ─────────── */
interface Dept {
  range: { start: string; end: string };
  stats: { rooms: number; fnb: number; amenities: number; other: number };
  distribution: { department: string; amount: number; percentage: number }[];
  total: number;
  trend: { date: string; rooms: number; fnb: number; amenities: number; other: number; total: number }[];
}

export function RevenueDepartmentReport() {
  const f = useFilters({ start: `${daysAgo(0).slice(0, 7)}-01`, end: daysAgo(0) });
  const q = useGet<Dept>('/reports/revenue-department', f.applied);
  const d = q.data;

  const exportPdf = () => d && exportReportPdf({
    title: 'Revenue Breakdown by Department', subtitle: `${d.range.start} to ${d.range.end}`, filename: `revenue-by-department-${d.range.start}-to-${d.range.end}.pdf`,
    sections: [
      { title: 'Revenue Distribution by Department', head: ['Department', 'Amount', 'Percentage'], body: [...d.distribution.map((r) => [r.department, pdfMoney(r.amount), pct(r.percentage)]), ['Total Revenue', pdfMoney(d.total), '100%']] },
      { title: 'Daily Revenue Trend', head: ['Date', 'Rooms', 'F&B', 'Amenities', 'Other', 'Total'], body: d.trend.map((t) => [dShort(t.date), pdfMoney(t.rooms), pdfMoney(t.fnb), pdfMoney(t.amenities), pdfMoney(t.other), pdfMoney(t.total)]) },
    ],
  });

  return (
    <ReportPage>
      <PageTitle title="Revenue Breakdown by Department" />
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
            <StatCard label="Room Revenue" value={naira(d.stats.rooms)} icon={<BedDouble className="h-5 w-5 text-blue-500" />} />
            <StatCard label="Food & Beverage" value={naira(d.stats.fnb)} icon={<Utensils className="h-5 w-5 text-green-500" />} />
            <StatCard label="Amenities" value={naira(d.stats.amenities)} icon={<Flower2 className="h-5 w-5 text-cyan-500" />} />
            <StatCard label="Other Revenue" value={naira(d.stats.other)} icon={<Package className="h-5 w-5 text-amber-500" />} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="Revenue Distribution by Department">
              <DataTable cols={[{ label: 'Department' }, { label: 'Amount', right: true }, { label: 'Percentage', right: true }]}>
                {d.distribution.map((r) => (
                  <tr key={r.department}><Td>{r.department}</Td><Td right>{naira(r.amount)}</Td><Td right>{pct(r.percentage)}</Td></tr>
                ))}
                <TotalRow><Td>Total Revenue</Td><Td right>{naira(d.total)}</Td><Td right>100%</Td></TotalRow>
              </DataTable>
            </SectionCard>
            <SectionCard title="Daily Revenue Trend">
              <DataTable minWidth="min-w-[620px]" cols={[{ label: 'Date' }, { label: 'Rooms', right: true }, { label: 'F&B', right: true }, { label: 'Amenities', right: true }, { label: 'Other', right: true }, { label: 'Total', right: true }]}>
                {d.trend.length === 0 && <EmptyRow span={6}>No revenue in this period</EmptyRow>}
                {d.trend.map((t) => (
                  <tr key={t.date}>
                    <Td className="whitespace-nowrap">{dShort(t.date)}</Td>
                    <Td right>{naira(t.rooms)}</Td><Td right>{naira(t.fnb)}</Td><Td right>{naira(t.amenities)}</Td><Td right>{naira(t.other)}</Td>
                    <Td right className="font-semibold">{naira(t.total)}</Td>
                  </tr>
                ))}
              </DataTable>
            </SectionCard>
          </div>
        </>
      )}
    </ReportPage>
  );
}

/* ─────────── Occupancy Statistics & Room Revenue Analysis ─────────── */
interface Occ {
  date: string;
  stats: { occupancyRate: number; adr: number; revPar: number; roomRevenue: number };
  roomStatus: { status: string; count: number; percentage: number }[];
  totalRooms: number;
  roomTypes: { roomType: string; total: number; occupied: number; available: number; occupancy: number }[];
  revenueByRoomType: { roomType: string; occupiedRooms: number; totalRevenue: number; averageRate: number; revenueContribution: number }[];
  revenueTotals: { occupiedRooms: number; totalRevenue: number; averageRate: number };
}

export function OccupancyStatisticsReport() {
  const f = useFilters({ date: daysAgo(0) });
  const q = useGet<Occ>('/reports/occupancy-statistics', f.applied);
  const d = q.data;

  const exportPdf = () => d && exportReportPdf({
    title: 'Occupancy Statistics & Room Revenue Analysis', subtitle: `Date: ${d.date}`, filename: `occupancy-statistics-${d.date}.pdf`,
    stats: [['Occupancy Rate', pct(d.stats.occupancyRate)], ['ADR', pdfMoney(d.stats.adr)], ['RevPAR', pdfMoney(d.stats.revPar)], ['Room Revenue', pdfMoney(d.stats.roomRevenue)]],
    sections: [
      { title: 'Room Status Summary', head: ['Status', 'Count', 'Percentage'], body: [...d.roomStatus.map((r) => [r.status, r.count, pct(r.percentage)]), ['Total Rooms', d.totalRooms, '100%']] },
      { title: 'Room Type Distribution', head: ['Room Type', 'Total', 'Occupied', 'Available', 'Occupancy'], body: d.roomTypes.map((r) => [r.roomType, r.total, r.occupied, r.available, pct(r.occupancy)]) },
      { title: 'Revenue by Room Type', head: ['Room Type', 'Occupied Rooms', 'Total Revenue', 'Average Rate', 'Contribution'], body: d.revenueByRoomType.map((r) => [r.roomType, r.occupiedRooms, pdfMoney(r.totalRevenue), pdfMoney(r.averageRate), pct(r.revenueContribution)]) },
    ],
  });

  return (
    <ReportPage>
      <PageTitle title="Occupancy Statistics & Room Revenue Analysis" />
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
            <StatCard label="Occupancy Rate" value={pct(d.stats.occupancyRate)} icon={<Percent className="h-5 w-5 text-blue-500" />} />
            <StatCard label="Average Daily Rate" value={naira(d.stats.adr)} icon={<span className="text-lg font-bold text-green-500">₦</span>} />
            <StatCard label="RevPAR" value={naira(d.stats.revPar)} icon={<TrendingUp className="h-5 w-5 text-cyan-500" />} />
            <StatCard label="Room Revenue" value={naira(d.stats.roomRevenue)} icon={<Banknote className="h-5 w-5 text-amber-500" />} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="Room Status Summary">
              <DataTable cols={[{ label: 'Status' }, { label: 'Count', right: true }, { label: 'Percentage', right: true }]}>
                {d.roomStatus.map((r) => (<tr key={r.status}><Td>{r.status}</Td><Td right>{r.count}</Td><Td right>{pct(r.percentage)}</Td></tr>))}
                <TotalRow><Td>Total Rooms</Td><Td right>{d.totalRooms}</Td><Td right>100%</Td></TotalRow>
              </DataTable>
            </SectionCard>
            <SectionCard title="Room Type Distribution">
              <DataTable cols={[{ label: 'Room Type' }, { label: 'Total', right: true }, { label: 'Occupied', right: true }, { label: 'Available', right: true }, { label: 'Occupancy', right: true }]}>
                {d.roomTypes.map((r) => (
                  <tr key={r.roomType}><Td>{r.roomType}</Td><Td right>{r.total}</Td><Td right>{r.occupied}</Td><Td right>{r.available}</Td><Td right>{pct(r.occupancy)}</Td></tr>
                ))}
              </DataTable>
            </SectionCard>
          </div>
          <SectionCard title="Revenue by Room Type">
            <DataTable cols={[{ label: 'Room Type' }, { label: 'Occupied Rooms', right: true }, { label: 'Total Revenue', right: true }, { label: 'Average Rate', right: true }, { label: 'Revenue Contribution', right: true }]}>
              {d.revenueByRoomType.map((r) => (
                <tr key={r.roomType}><Td>{r.roomType}</Td><Td right>{r.occupiedRooms}</Td><Td right>{naira(r.totalRevenue)}</Td><Td right>{naira(r.averageRate)}</Td><Td right>{pct(r.revenueContribution)}</Td></tr>
              ))}
              <TotalRow><Td>Total</Td><Td right>{d.revenueTotals.occupiedRooms}</Td><Td right>{naira(d.revenueTotals.totalRevenue)}</Td><Td right>{naira(d.revenueTotals.averageRate)}</Td><Td right>100%</Td></TotalRow>
            </DataTable>
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}

/* ─────────── Group Performance ─────────── */
interface Group {
  range: { start: string; end: string };
  stats: { groupRevenue: number; individualRevenue: number; groupRevenueShare: number; avgGroupSpend: number; avgPerMember: number };
  folioAnalysis: { id: string; name: string; totalRevenue: number; memberCount: number; averagePerMember: number; revenuePerMemberNight: number }[];
  folioAverage: { totalRevenue: number; memberCount: number; averagePerMember: number; revenuePerMemberNight: number };
  bookingPatterns: { name: string; bookingCount: number; totalRooms: number; averageStayDays: number; roomUtilization: number }[];
}

export function GroupPerformanceReport() {
  const f = useFilters({ start: `${daysAgo(0).slice(0, 7)}-01`, end: daysAgo(0) });
  const q = useGet<Group>('/reports/group-performance', f.applied);
  const d = q.data;

  const exportPdf = () => d && exportReportPdf({
    title: 'Group Performance Report', subtitle: `${d.range.start} to ${d.range.end}`, filename: `group-performance-${d.range.start}-to-${d.range.end}.pdf`,
    stats: [['Group Revenue', pdfMoney(d.stats.groupRevenue)], ['Individual Revenue', pdfMoney(d.stats.individualRevenue)], ['Group Share', pct(d.stats.groupRevenueShare)], ['Avg Per Member', pdfMoney(d.stats.avgPerMember)]],
    sections: [
      { title: 'Group Folio Analysis', head: ['Group', 'Total Revenue', 'Members', 'Avg Per Member', 'Revenue Per Member Night'], body: d.folioAnalysis.map((g) => [g.name, pdfMoney(g.totalRevenue), g.memberCount, pdfMoney(g.averagePerMember), pdfMoney(g.revenuePerMemberNight)]) },
      { title: 'Group Booking Patterns', head: ['Group', 'Bookings', 'Rooms', 'Avg Stay (Days)', 'Room Utilization'], body: d.bookingPatterns.map((g) => [g.name, g.bookingCount, g.totalRooms, g.averageStayDays, `${g.roomUtilization}%`]) },
    ],
  });

  const share = d?.stats.groupRevenueShare ?? 0;
  const avg = d?.stats.avgPerMember ?? 0;

  return (
    <ReportPage>
      <PageTitle title="Group Performance Report" />
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
          <div className="grid gap-4 md:grid-cols-2">
            <Tile tone="blue" value={naira(d.stats.groupRevenue)} label="Group Revenue" icon={Users} />
            <Tile tone="cyan" value={naira(d.stats.individualRevenue)} label="Individual Revenue" icon={User} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Group Revenue Share" value={pct(d.stats.groupRevenueShare)} icon={<PieChart className="h-5 w-5 text-blue-500" />} />
            <StatCard label="Avg Group Spend" value={naira(d.stats.avgGroupSpend)} icon={<Banknote className="h-5 w-5 text-green-500" />} />
            <StatCard label="Avg Per Member" value={naira(d.stats.avgPerMember)} icon={<Users className="h-5 w-5 text-cyan-500" />} />
          </div>
          <SectionCard title="Group Folio Analysis">
            <DataTable cols={[{ label: 'Group Name' }, { label: 'Total Revenue', right: true }, { label: 'Member Count', right: true }, { label: 'Average Per Member', right: true }, { label: 'Revenue Per Member Night', right: true }]}>
              {d.folioAnalysis.length === 0 && <EmptyRow span={5}>No groups found</EmptyRow>}
              {d.folioAnalysis.map((g) => (
                <tr key={g.id}><Td className="font-medium">{g.name}</Td><Td right>{naira(g.totalRevenue)}</Td><Td right>{g.memberCount}</Td><Td right>{naira(g.averagePerMember)}</Td><Td right>{naira(g.revenuePerMemberNight)}</Td></tr>
              ))}
              {d.folioAnalysis.length > 0 && (
                <TotalRow><Td>Average</Td><Td right>{naira(d.folioAverage.totalRevenue)}</Td><Td right>{d.folioAverage.memberCount}</Td><Td right>{naira(d.folioAverage.averagePerMember)}</Td><Td right>{naira(d.folioAverage.revenuePerMemberNight)}</Td></TotalRow>
              )}
            </DataTable>
          </SectionCard>
          <SectionCard title="Group Booking Patterns">
            <DataTable cols={[{ label: 'Group Name' }, { label: 'Booking Count', right: true }, { label: 'Total Rooms', right: true }, { label: 'Average Stay (Days)', right: true }, { label: 'Room Utilization', right: true }]}>
              {d.bookingPatterns.map((g) => (
                <tr key={g.name}><Td className="font-medium">{g.name}</Td><Td right>{g.bookingCount}</Td><Td right>{g.totalRooms}</Td><Td right>{g.averageStayDays}</Td><Td right>{g.roomUtilization}%</Td></tr>
              ))}
            </DataTable>
          </SectionCard>
          <SectionCard title="Performance Insights">
            <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm">
                <div className="mb-3 text-base font-semibold text-slate-900">Group vs Individual Performance</div>
                {share >= 50
                  ? <p className="flex items-center gap-2 text-green-600"><ArrowUp className="h-4 w-4" /> Group bookings are generating more revenue than individual bookings.</p>
                  : <p className="flex items-center gap-2 text-amber-600"><ArrowDown className="h-4 w-4" /> Individual bookings are generating more revenue than groups.</p>}
                <p className="mt-2 text-slate-600">Group revenue contributes <b className="text-slate-900">{pct(share)}</b> to total revenue.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm">
                <div className="mb-3 text-base font-semibold text-slate-900">Member Spending Analysis</div>
                <p className="text-slate-600">Average spending per group member is <b className="text-slate-900">{naira(avg)}</b>.</p>
                <p className="mt-2 flex items-center gap-2 text-cyan-600"><TrendingUp className="h-4 w-4" /> {avg >= 50000 ? 'Strong spending per member.' : 'Moderate spending per member with potential for upselling.'}</p>
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}