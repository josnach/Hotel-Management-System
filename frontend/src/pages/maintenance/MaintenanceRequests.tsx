import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { Card } from '@/components/ui/card';
import {
  COLORS,
  PriorityPill,
  StatusPill,
  fmtDateTime,
  inputCls,
  labelCls,
  pageTitleCls,
  th,
  useCanManage,
  type Ticket,
  type TicketStatus,
} from './shared';

const STATUS_FILTERS = [
  { value: 'active', label: 'Active Requests' },
  { value: 'all', label: 'All Requests' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PRIORITY_FILTERS = [
  { value: 'all', label: 'All Priorities' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'HIGH', label: 'High' },
  { value: 'NORMAL', label: 'Normal' },
];

export default function MaintenanceRequests() {
  const [status, setStatus] = useState('active');
  const [priority, setPriority] = useState('all');
  const canManage = useCanManage();

  const { data } = useGet<{ items: Ticket[] }>('/maintenance/requests', { status, priority });
  const items = data?.items ?? [];

  const update = useAction(
    (v: { id: string; body: { status: TicketStatus; cost?: number } }) =>
      api.patch(`/maintenance/requests/${v.id}`, v.body),
    {
      success: 'Request updated',
      invalidate: ['/maintenance/requests', '/maintenance/dashboard', '/maintenance/reports', '/rooms'],
    },
  );

  const complete = (t: Ticket) => {
    const answer = window.prompt(`Cost of repair for ${t.ref} (leave 0 if none):`, String(t.cost || 0));
    if (answer === null) return;
    const cost = Number(answer);
    if (Number.isNaN(cost) || cost < 0) return window.alert('Enter a valid amount.');
    update.mutate({ id: t.id, body: { status: 'RESOLVED', cost } });
  };

  const cancel = (t: Ticket) => {
    if (window.confirm(`Cancel request ${t.ref}?`)) update.mutate({ id: t.id, body: { status: 'CANCELLED' } });
  };

  const linkBtn = 'text-xs font-medium hover:underline disabled:opacity-50';

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className={`${pageTitleCls} mb-4`}>Maintenance Requests</h1>

      <Card className="p-5">
        <div className="grid items-end gap-4 md:grid-cols-[1fr_1fr_1fr]">
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Priority</label>
            <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITY_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <Link
            to="/maintenance/requests/new"
            className="flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold text-white hover:brightness-90"
            style={{ backgroundColor: COLORS.blue }}
          >
            <Plus className="h-4 w-4" /> New Request
          </Link>
        </div>
      </Card>

      <Card className="mt-5 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['ID', 'Room', 'Title', 'Category', 'Priority', 'Status', 'Reported By', 'Reported At', 'Actions'].map(
                (h) => (
                  <th key={h} className={th}>{h}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {!items.length && (
              <tr>
                <td colSpan={9} className="px-4 py-3 text-center text-sm text-slate-500">
                  No maintenance requests found.
                </td>
              </tr>
            )}
            {items.map((t) => {
              const active = t.status === 'OPEN' || t.status === 'IN_PROGRESS';
              return (
                <tr key={t.id} className="border-t">
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{t.ref}</td>
                  <td className="px-4 py-3">{t.room?.number ?? '—'}</td>
                  <td className="px-4 py-3">{t.title}</td>
                  <td className="px-4 py-3">{t.categoryLabel}</td>
                  <td className="px-4 py-3"><PriorityPill priority={t.priority} /></td>
                  <td className="px-4 py-3"><StatusPill status={t.status} /></td>
                  <td className="px-4 py-3">{t.reportedBy}</td>
                  <td className="whitespace-nowrap px-4 py-3">{fmtDateTime(t.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {canManage && active ? (
                      <div className="flex gap-3">
                        {t.status === 'OPEN' && (
                          <button
                            type="button"
                            className={`${linkBtn} text-blue-600`}
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: t.id, body: { status: 'IN_PROGRESS' } })}
                          >
                            Start
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${linkBtn} text-green-600`}
                          disabled={update.isPending}
                          onClick={() => complete(t)}
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          className={`${linkBtn} text-red-600`}
                          disabled={update.isPending}
                          onClick={() => cancel(t)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}