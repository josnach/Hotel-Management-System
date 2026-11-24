import { useState } from 'react';

import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  BackToDashboard,
  ScheduleStatusPill,
  fmtDate,
  inputCls,
  labelCls,
  pageTitleCls,
  th,
  useCanManage,
  type Options,
  type Schedule,
} from './shared';

const EMPTY = { title: '', category: 'GENERAL', roomId: '', equipment: '', frequency: 'MONTHLY', nextDueAt: '' };

export default function MaintenanceSchedule() {
  const canManage = useCanManage();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const { data } = useGet<{ activeCount: number; items: Schedule[] }>('/maintenance/schedules');
  const { data: options } = useGet<Options>('/maintenance/options');
  const items = data?.items ?? [];

  const refresh = ['/maintenance/schedules', '/maintenance/dashboard'];

  const create = useAction(
    (body: typeof EMPTY) =>
      api.post('/maintenance/schedules', {
        title: body.title,
        category: body.category,
        frequency: body.frequency,
        roomId: body.roomId || null,
        equipment: body.equipment || null,
        nextDueAt: body.nextDueAt || undefined,
      }),
    {
      success: 'Schedule added',
      invalidate: refresh,
      onSuccess: () => {
        setForm(EMPTY);
        setShowForm(false);
      },
    },
  );

  const done = useAction((id: string) => api.post(`/maintenance/schedules/${id}/complete`, {}), {
    success: 'Marked as done',
    invalidate: refresh,
  });

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid = form.title.trim() && (form.roomId || form.equipment.trim());

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <h1 className={pageTitleCls}>Preventive Maintenance Schedule</h1>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button type="button" variant="outline" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Close' : 'Add Schedule'}
            </Button>
          )}
          <BackToDashboard />
        </div>
      </div>

      {canManage && showForm && (
        <Card className="mb-4 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-3">
              <label className={labelCls}>Title</label>
              <input className={inputCls} placeholder="e.g. Service air-conditioners" value={form.title} onChange={set('title')} />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select className={inputCls} value={form.category} onChange={set('category')}>
                {options?.categories.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Room (optional)</label>
              <select className={inputCls} value={form.roomId} onChange={set('roomId')}>
                <option value="">— None —</option>
                {options?.rooms.map((r) => (
                  <option key={r.id} value={r.id}>Room {r.number}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Equipment (if no room)</label>
              <input className={inputCls} placeholder="e.g. Generator 2" value={form.equipment} onChange={set('equipment')} />
            </div>
            <div>
              <label className={labelCls}>Frequency</label>
              <select className={inputCls} value={form.frequency} onChange={set('frequency')}>
                {options?.frequencies.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>First due date (optional)</label>
              <input type="date" className={inputCls} value={form.nextDueAt} onChange={set('nextDueAt')} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={!valid || create.isPending}
              onClick={() => create.mutate(form)}
            >
              {create.isPending ? 'Saving…' : 'Save Schedule'}
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">All Active Schedules</h2>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
            {data?.activeCount ?? 0} active schedules
          </span>
        </div>

        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Title', 'Category', 'Room/Equipment', 'Frequency', 'Last Performed', 'Next Due', 'Status'].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
                {canManage && <th className={th} />}
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{s.title}</td>
                  <td className="px-4 py-3">{s.categoryLabel}</td>
                  <td className="px-4 py-3">{s.target}</td>
                  <td className="px-4 py-3">{s.frequencyLabel}</td>
                  <td className="px-4 py-3">{fmtDate(s.lastPerformedAt)}</td>
                  <td className="px-4 py-3">{fmtDate(s.nextDueAt)}</td>
                  <td className="px-4 py-3"><ScheduleStatusPill status={s.status} /></td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="text-xs font-medium text-green-600 hover:underline disabled:opacity-50"
                        disabled={done.isPending}
                        onClick={() => done.mutate(s.id)}
                      >
                        Mark Done
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}