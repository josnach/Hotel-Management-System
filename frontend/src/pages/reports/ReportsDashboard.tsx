import { Link } from 'react-router-dom';
import { Banknote, BedDouble, Brush, Building2, CalendarDays, PieChart, TrendingUp, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { canAccessPath } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Card, ReportPage, SOLID, type Tone } from '@/components/reports/ui';

const CARDS: { title: string; sub: string; to: string; tone: Tone; icon: typeof Users; btn?: string }[] = [
  { title: 'Daily Financial', sub: 'Reconciliation & Summary', to: '/reports/daily-financial', tone: 'blue', icon: TrendingUp },
  { title: 'Revenue by Department', sub: 'Department-wise Breakdown', to: '/reports/revenue-department', tone: 'green', icon: Banknote },
  { title: 'Occupancy Statistics', sub: 'Room Revenue Analysis', to: '/reports/occupancy-statistics', tone: 'cyan', icon: BedDouble },
  { title: 'Room Status', sub: 'Real-time Dashboard', to: '/reports/room-status-dashboard', tone: 'amber', icon: Building2, btn: 'View Dashboard' },
  { title: 'Arrival/Departure', sub: 'Schedule & Movements', to: '/reports/arrival-departure', tone: 'purple', icon: CalendarDays },
  { title: 'Room Type Performance', sub: 'Distribution & Analysis', to: '/reports/room-type-performance', tone: 'red', icon: PieChart },
  { title: 'Guest Movement', sub: 'Check-in/out Patterns', to: '/reports/guest-movement', tone: 'grey', icon: Users },
  { title: 'Group Performance', sub: 'Group vs Individual', to: '/reports/group-performance', tone: 'dark', icon: Users },
  { title: 'Housekeeping Status', sub: 'Cleaning & Maintenance', to: '/reports/housekeeping-status', tone: 'cyan', icon: Brush },
];

export default function ReportsDashboard() {
  const { user } = useAuth();
  const cards = CARDS.filter((c) => canAccessPath(user?.role, c.to));
  return (
    <ReportPage>
      <h1 className="text-2xl font-bold text-slate-900">Reports Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ title, sub, to, tone, icon: Icon, btn }) => (
          <Card key={to} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">{title}</div>
                <div className="mt-1 text-sm text-slate-500">{sub}</div>
              </div>
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white', SOLID[tone])}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <Link to={to} className={cn('mt-4 block rounded-md py-1.5 text-center text-sm font-medium text-white hover:brightness-95', SOLID[tone])}>
              {btn ?? 'View Report'}
            </Link>
          </Card>
        ))}
      </div>
    </ReportPage>
  );
}