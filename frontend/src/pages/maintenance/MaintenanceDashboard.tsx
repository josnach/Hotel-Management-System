import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, CalendarDays, CalendarX, List, ListChecks, Plus, Wrench } from 'lucide-react';

import { useGet } from '@/lib/hooks';
import { Card } from '@/components/ui/card';
import { COLORS, pageTitleCls } from './shared';

type Dashboard = { activeRequests: number; emergency: number; overduePm: number; dueSoon: number };

export default function MaintenanceDashboard() {
  const { data } = useGet<Dashboard>('/maintenance/dashboard');

  const stats = [
    { label: 'Active Requests', value: data?.activeRequests, color: COLORS.amber, Icon: Wrench },
    { label: 'Emergency', value: data?.emergency, color: COLORS.red, Icon: AlertTriangle },
    { label: 'Overdue PM', value: data?.overduePm, color: COLORS.cyan, Icon: CalendarX },
    { label: 'Due Soon', value: data?.dueSoon, color: COLORS.green, Icon: ListChecks },
  ];

  const actions = [
    { label: 'New Request', to: '/maintenance/requests/new', color: COLORS.blue, Icon: Plus },
    { label: 'View Requests', to: '/maintenance/requests', color: COLORS.amber, Icon: List },
    { label: 'Preventive Schedule', to: '/maintenance/schedule', color: COLORS.cyan, Icon: CalendarDays },
    { label: 'Reports', to: '/maintenance/reports', color: COLORS.green, Icon: BarChart3 },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className={`${pageTitleCls} mb-4`}>Maintenance Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, color, Icon }) => (
          <div key={label} className="rounded-md px-5 py-4 text-white" style={{ backgroundColor: color }}>
            <div className="flex items-start justify-between">
              <span className="text-xs font-medium">{label}</span>
              <Icon className="h-5 w-5 opacity-60" />
            </div>
            <div className="mt-2 text-3xl font-bold leading-none">{value ?? 0}</div>
          </div>
        ))}
      </div>

      <Card className="mt-5 p-0">
        <div className="border-b px-5 py-4 text-sm font-semibold text-slate-900">Quick Actions</div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map(({ label, to, color, Icon }) => (
            <Link
              key={label}
              to={to}
              className="flex items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold text-white transition hover:brightness-90"
              style={{ backgroundColor: color }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}