import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

/* ───────────── types (match routes/maintenance.ts) ───────────── */

export type Priority = 'EMERGENCY' | 'HIGH' | 'NORMAL';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';

export type Ticket = {
  id: string;
  ticketNo: number;
  ref: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: Priority;
  category: string;
  categoryLabel: string;
  cost: number;
  room: { id: string; number: string } | null;
  reportedBy: string;
  assignedTo: { id: string; name: string | null } | null;
  createdAt: string;
  startedAt: string | null;
  resolvedAt: string | null;
};

export type Schedule = {
  id: string;
  title: string;
  categoryLabel: string;
  target: string;
  frequency: string;
  frequencyLabel: string;
  lastPerformedAt: string | null;
  nextDueAt: string;
  status: 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK' | 'INACTIVE';
  isActive: boolean;
};

export type Option = { value: string; label: string };

export type Options = {
  rooms: { id: string; number: string; floor: number | null }[];
  categories: Option[];
  priorities: Option[];
  statuses: Option[];
  frequencies: Option[];
  staff: { id: string; name: string | null }[];
  reportedBy: string;
};

/* ───────────── look & feel (colours sampled from the Austine recording) ───────────── */

export const COLORS = {
  amber: '#eb9e12',
  red: '#dc3446',
  cyan: '#16c7d3',
  green: '#30dd5f',
  blue: '#4282f0',
} as const;

export const inputCls =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300';

export const labelCls = 'mb-1 block text-xs font-medium text-slate-800';

export const pageTitleCls = 'text-xl font-bold text-slate-900';

export const grayButtonCls =
  'inline-flex items-center rounded-md bg-gray-500 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600';

export const th = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500';

export function BackToDashboard() {
  return (
    <Link to="/maintenance" className={grayButtonCls}>
      Back to Dashboard
    </Link>
  );
}

/* ───────────── helpers ───────────── */

/** Admins, managers and the maintenance team can act on requests and schedules. */
export function useCanManage() {
  const { user } = useAuth();
  return user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'MAINTENANCE';
}

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

/** Local-date YYYY-MM-DD (not UTC, so Lagos evenings don't roll to the next day). */
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const PILL = 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium';

export function PriorityPill({ priority }: { priority: Priority }) {
  const map: Record<Priority, string> = {
    EMERGENCY: 'bg-red-100 text-red-700',
    HIGH: 'bg-amber-100 text-amber-700',
    NORMAL: 'bg-slate-100 text-slate-600',
  };
  const label: Record<Priority, string> = { EMERGENCY: 'Emergency', HIGH: 'High', NORMAL: 'Normal' };
  return <span className={`${PILL} ${map[priority]}`}>{label[priority]}</span>;
}

export function StatusPill({ status }: { status: TicketStatus }) {
  const map: Record<TicketStatus, string> = {
    OPEN: 'bg-blue-100 text-blue-700',
    IN_PROGRESS: 'bg-amber-100 text-amber-700',
    RESOLVED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-slate-100 text-slate-500',
  };
  const label: Record<TicketStatus, string> = {
    OPEN: 'Open',
    IN_PROGRESS: 'In Progress',
    RESOLVED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return <span className={`${PILL} ${map[status]}`}>{label[status]}</span>;
}

export function ScheduleStatusPill({ status }: { status: Schedule['status'] }) {
  const map: Record<Schedule['status'], string> = {
    OVERDUE: 'bg-red-100 text-red-700',
    DUE_SOON: 'bg-amber-100 text-amber-700',
    ON_TRACK: 'bg-green-100 text-green-700',
    INACTIVE: 'bg-slate-100 text-slate-500',
  };
  const label: Record<Schedule['status'], string> = {
    OVERDUE: 'Overdue',
    DUE_SOON: 'Due Soon',
    ON_TRACK: 'On Track',
    INACTIVE: 'Inactive',
  };
  return <span className={`${PILL} ${map[status]}`}>{label[status]}</span>;
}