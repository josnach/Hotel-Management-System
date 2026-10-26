import { useState } from 'react';
import { Field, FilterBar, PageHeader, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { dt } from '@/lib/utils';

const PAGE = 25;
const TONE: Record<string, 'gray' | 'green' | 'red' | 'blue' | 'yellow' | 'orange'> = {
  QUEUED: 'yellow', SENDING: 'yellow', SENT: 'blue', DELIVERED: 'green', READ: 'green', FAILED: 'red', SKIPPED: 'gray',
};
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

export default function Messages() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const st = useGet('/messaging/status');
  const msgs = useGet('/messaging/messages', { status, page, pageSize: PAGE });
  const owners = useGet<any[]>('/messaging/owners');
  const [o, setO] = useState({ name: '', phone: '', digestHour: 21 });

  const retry = useAction((id: string) => api.post(`/messaging/messages/${id}/retry`), { success: 'Queued for retry', invalidate: ['/messaging/messages', '/messaging/status'] });
  const add = useAction(() => api.post('/messaging/owners', { ...o, digestHour: Number(o.digestHour) }), { success: 'Recipient added', invalidate: ['/messaging/owners'], onSuccess: () => setO({ name: '', phone: '', digestHour: 21 }) });
  const toggle = useAction((r: any) => api.put(`/messaging/owners/${r.id}`, { active: !r.active }), { invalidate: ['/messaging/owners'] });
  const remove = useAction((id: string) => api.del(`/messaging/owners/${id}`), { success: 'Recipient removed', invalidate: ['/messaging/owners'] });
  const test = useAction((id: string) => api.post(`/messaging/owners/${id}/test-digest`), { success: 'Test digest queued', invalidate: ['/messaging/messages', '/messaging/status'] });

  return (
    <>
      <PageHeader title="WhatsApp Messages" subtitle="Guest notifications and the owner's daily digest" />
      {st.data && !st.data.configured && <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">WhatsApp is not connected yet. Messages will queue here and send once the WA_* settings are added on the server.</div>}
      {st.data?.configured && !st.data.webhookReady && <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">Delivery receipts and STOP replies are off until WA_VERIFY_TOKEN and WA_APP_SECRET are set and the webhook is registered with Meta.</div>}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat label="Waiting to send" value={st.data?.queued ?? 0} tone="yellow" />
        <Stat label="Failed" value={st.data?.failed ?? 0} tone={st.data?.failed ? 'red' : 'white'} />
        <Stat label="Sent in last 24h" value={st.data?.sentLast24h ?? 0} tone="green" />
      </div>

      <Card className="mb-4 p-4">
        <div className="mb-3 font-semibold">Owner daily digest</div>
        <div className="mb-3 grid gap-3 md:grid-cols-4">
          <Field label="Name"><Input value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} /></Field>
          <Field label="WhatsApp number" hint="Nigerian numbers as 0803…, others as +country code"><Input value={o.phone} onChange={(e) => setO({ ...o, phone: e.target.value })} /></Field>
          <Field label="Send at"><NativeSelect value={o.digestHour} onChange={(e) => setO({ ...o, digestHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</NativeSelect></Field>
          <div className="flex items-end"><Button className="w-full" disabled={!o.name || !o.phone || add.isPending} onClick={() => add.mutate(undefined)}>Add recipient</Button></div>
        </div>
        <ListCard rows={owners.data} loading={owners.isLoading} error={owners.error} empty="No recipients yet." cols={[
          { header: 'Name', cell: (r: any) => r.name },
          { header: 'Number', cell: (r: any) => r.phone },
          { header: 'Sends at', cell: (r: any) => hourLabel(r.digestHour) },
          { header: 'Status', cell: (r: any) => <Badge variant={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Paused'}</Badge> },
          { header: '', cell: (r: any) => <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => test.mutate(r.id)}>Send test</Button><Button size="sm" variant="outline" onClick={() => toggle.mutate(r)}>{r.active ? 'Pause' : 'Resume'}</Button><Button size="sm" variant="destructive" onClick={() => confirm(`Remove ${r.name}?`) && remove.mutate(r.id)}>Remove</Button></div> },
        ]} />
      </Card>

      <FilterBar>
        <Field label="Status"><NativeSelect value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All</option>{Object.keys(TONE).map((s) => <option key={s} value={s}>{s}</option>)}
        </NativeSelect></Field>
      </FilterBar>
      <ListCard rows={msgs.data?.rows} loading={msgs.isLoading} error={msgs.error} empty="No messages yet." cols={[
        { header: 'Queued', cell: (r: any) => <span className="whitespace-nowrap text-xs">{dt(r.createdAt)}</span> },
        { header: 'To', cell: (r: any) => `+${r.toPhone}` },
        { header: 'Template', cell: (r: any) => r.template },
        { header: 'Status', cell: (r: any) => <Badge variant={TONE[r.status]}>{r.status}</Badge> },
        { header: 'Tries', cell: (r: any) => r.attempts },
        { header: 'Detail', className: 'max-w-[320px]', cell: (r: any) => r.error ? <div className="truncate text-xs text-red-700" title={r.error}>{r.error}</div> : '—' },
        { header: '', cell: (r: any) => r.status === 'FAILED' ? <Button size="sm" variant="outline" onClick={() => retry.mutate(r.id)}>Retry</Button> : null },
      ]} />
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button size="sm" variant="outline" disabled={page * PAGE >= (msgs.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </>
  );
}
