import { useState } from 'react';
import { Field, FilterBar, PageHeader } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { useGet } from '@/lib/hooks';
import { dt } from '@/lib/utils';

const PAGE = 25;
/** Actions worth a second look get a colour; the rest stay neutral. */
const RISKY = new Set(['VOID_ORDER', 'PRICE_CHANGE', 'ADJUSTMENT_REJECTED', 'ITEM_DEACTIVATE', 'GUARD_SETTINGS', 'ROOM_TYPE_EDIT', 'ROOM_TYPE_DELETE', 'ROOM_EDIT', 'COMP_ORDER', 'STAFF_CREDIT_ORDER', 'POLICY_CHANGE', 'RECIPE_EDIT', 'STOCK_COUNT', 'HK_INSPECT_FAIL', 'CASH_VARIANCE', 'NIGHT_AUDIT_CLOSE', 'ROOM_QR_ROTATE', 'EMPLOYEE_PAY_EDIT', 'PAYROLL_CONFIG_CHANGE', 'PAYROLL_APPROVE', 'CREDIT_LIMIT_EXCEEDED', 'CREDIT_LIMIT_OVERRIDE', 'CREDIT_TERMS_EDIT', 'CREDIT_POLICY_CHANGE', 'DIESEL_PURCHASE', 'GUEST_BLACKLIST', 'GUEST_UNBLACKLIST', 'BLACKLIST_BLOCKED']);

const show = (v: unknown): string => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));
const summarize = (meta: unknown) => (meta && typeof meta === 'object' ? Object.entries(meta as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}: ${show(v)}`).join(' · ') : '');

export default function AuditLog() {
  const [f, setF] = useState({ action: '', userId: '', entity: '', from: '', to: '' });
  const [applied, setApplied] = useState({ ...f });
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useGet('/audit', { ...applied, page, pageSize: PAGE });

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Who did what, and when" />
      <FilterBar>
        <Field label="Action"><NativeSelect value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}>
          <option value="">All actions</option>{data?.actions?.map((a: string) => <option key={a} value={a}>{a}</option>)}
        </NativeSelect></Field>
        <Field label="User"><NativeSelect value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
          <option value="">Everyone</option>{data?.users?.map((u: any) => <option key={u.id} value={u.id}>{u.username}</option>)}
        </NativeSelect></Field>
        <Field label="Record type"><Input placeholder="e.g. Order, Stay" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })} /></Field>
        <div />
        <Field label="From"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <div className="flex items-end md:col-span-2"><Button className="w-full" onClick={() => { setApplied(f); setPage(1); }}>Apply filters</Button></div>
      </FilterBar>
      <p className="mb-2 text-sm text-muted-foreground">Showing {data?.rows?.length ?? 0} of {data?.total ?? 0} entries</p>
      <ListCard rows={data?.rows} loading={isLoading} error={error} empty="No entries match these filters." cols={[
        { header: 'When', cell: (r: any) => <span className="whitespace-nowrap text-xs">{dt(r.createdAt)}</span> },
        { header: 'User', cell: (r: any) => r.user?.username ?? <span className="text-muted-foreground">system</span> },
        { header: 'Action', cell: (r: any) => <Badge variant={RISKY.has(r.action) ? 'orange' : 'gray'}>{r.action}</Badge> },
        { header: 'Record', cell: (r: any) => <div className="text-xs"><div className="font-medium">{r.entity}</div>{r.entityId && <div className="text-muted-foreground" title={r.entityId}>…{String(r.entityId).slice(-8)}</div>}</div> },
        { header: 'Details', className: 'max-w-[460px]', cell: (r: any) => { const t = summarize(r.meta); return t ? <div className="truncate text-xs text-muted-foreground" title={t}>{t}</div> : <span className="text-muted-foreground">—</span>; } },
      ]} />
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button size="sm" variant="outline" disabled={page * PAGE >= (data?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </>
  );
}
