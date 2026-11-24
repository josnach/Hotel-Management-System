import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { inputCls, labelCls, pageTitleCls, type Options } from './shared';

const Req = () => <span className="text-red-500"> *</span>;

export default function MaintenanceRequestNew() {
  const navigate = useNavigate();
  const { data: options } = useGet<Options>('/maintenance/options');

  const [form, setForm] = useState({
    roomId: '',
    category: '',
    priority: 'NORMAL',
    title: '',
    description: '',
  });
  // null = "use the logged-in user's name"
  const [reportedBy, setReportedBy] = useState<string | null>(null);
  const reporter = reportedBy ?? options?.reportedBy ?? '';

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = useAction(
    (body: typeof form & { reportedByName: string }) => api.post('/maintenance/requests', body),
    {
      success: 'Maintenance request created',
      invalidate: ['/maintenance/requests', '/maintenance/dashboard', '/maintenance/reports'],
      onSuccess: () => navigate('/maintenance/requests'),
    },
  );

  const valid =
    form.roomId && form.category && form.priority && form.title.trim() && form.description.trim() && reporter.trim();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className={`${pageTitleCls} mb-4`}>Create Maintenance Request</h1>

      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Room<Req /></label>
            <select className={inputCls} value={form.roomId} onChange={set('roomId')}>
              <option value="">Select Room</option>
              {options?.rooms.map((r) => (
                <option key={r.id} value={r.id}>Room {r.number}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Reported By<Req /></label>
            <input className={inputCls} value={reporter} onChange={(e) => setReportedBy(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Category<Req /></label>
            <select className={inputCls} value={form.category} onChange={set('category')}>
              <option value="">Select Category</option>
              {options?.categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Priority<Req /></label>
            <select className={inputCls} value={form.priority} onChange={set('priority')}>
              {options?.priorities.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              )) ?? <option value="NORMAL">Normal</option>}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className={labelCls}>Title<Req /></label>
          <input
            className={inputCls}
            placeholder="Brief description of the issue"
            maxLength={200}
            value={form.title}
            onChange={set('title')}
          />
        </div>

        <div className="mt-4">
          <label className={labelCls}>Description<Req /></label>
          <textarea
            className={`${inputCls} min-h-[120px] resize-y`}
            placeholder="Detailed description of the issue..."
            value={form.description}
            onChange={set('description')}
          />
        </div>

        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <Button type="button" variant="outline" onClick={() => navigate('/maintenance')}>
            Cancel
          </Button>
          <Button
            type="button"
            className="text-white hover:brightness-90"
            style={{ backgroundColor: '#2563eb' }}
            disabled={!valid || create.isPending}
            onClick={() => create.mutate({ ...form, reportedByName: reporter })}
          >
            {create.isPending ? 'Creating…' : 'Create Request'}
          </Button>
        </div>
      </Card>
    </div>
  );
}