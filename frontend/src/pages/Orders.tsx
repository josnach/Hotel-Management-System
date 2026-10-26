import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { dt, money } from '@/lib/utils';
import { Field, FilterBar, PageHeader, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';

const STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'];
const tones: any = { PENDING: 'yellow', CONFIRMED: 'blue', PREPARING: 'purple', READY: 'green', SERVED: 'white', COMPLETED: 'white', CANCELLED: 'red' };

export default function Orders() {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<any>({});
  const { data, isLoading } = useGet('/orders', applied);
  return (
    <>
      <PageHeader title="Order Management"><Button asChild><Link to="/orders/new"><Plus className="h-4 w-4" /> New Order</Link></Button></PageHeader>
      <div className="mb-4 grid gap-3 md:grid-cols-4">{STATUSES.map((s) => <Stat key={s} tone={tones[s]} label={s[0] + s.slice(1).toLowerCase()} value={data?.summary?.[s] ?? 0} className="text-center" />)}</div>
      <FilterBar>
        <Field label="Order Status"><NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All Status</option>{STATUSES.map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</NativeSelect></Field>
        <Field label="Date From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Date To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex items-end"><Button className="w-full" onClick={() => setApplied({ status, from, to })}>Filter</Button></div>
      </FilterBar>
      <ListCard rows={data?.rows} loading={isLoading} cols={[
        { header: 'Order #', cell: (o: any) => <span className="font-mono text-xs">{o.orderNo}</span> },
        { header: 'Customer', cell: (o: any) => o.guest ? `${o.guest.firstName} ${o.guest.lastName}` : o.group?.name ?? 'Walk-in Customer' },
        { header: 'Staff', cell: (o: any) => o.staff.username }, { header: 'Total', cell: (o: any) => <b>{money(o.total)}</b> },
        { header: 'Status', cell: (o: any) => <Badge variant={statusVariant(o.status)}>{o.status[0] + o.status.slice(1).toLowerCase()}</Badge> },
        { header: 'Payment', cell: (o: any) => <Badge variant={statusVariant(o.paymentStatus)}>{o.paymentStatus[0] + o.paymentStatus.slice(1).toLowerCase()}</Badge> },
        { header: 'Date', cell: (o: any) => dt(o.createdAt) },
      ]} />
    </>
  );
}

export function NewOrder() {
  const nav = useNavigate();
  const { data: sps } = useGet<any[]>('/sales-points');
  const { data: inHouse } = useGet<any[]>('/stays/in-house');
  const { data: groups } = useGet<any[]>('/groups');
  const [f, setF] = useState<any>({ customerType: 'WALK_IN', guestId: '', groupId: '', salesPointId: '', paymentMethod: 'CASH', instructions: '', notes: '' });
  const { data: cat } = useGet(`/sales-points/${f.salesPointId}/catalog`, undefined, !!f.salesPointId);
  const [lines, setLines] = useState<{ itemId: string; quantity: number; instructions: string }[]>([{ itemId: '', quantity: 1, instructions: '' }]);
  const price = (id: string) => Number(cat?.items?.find((i: any) => i.id === id)?.sellPrice ?? 0);
  const total = lines.reduce((s, l) => s + price(l.itemId) * l.quantity, 0);
  const upd = (i: number, p: any) => setLines(lines.map((l, x) => (x === i ? { ...l, ...p } : l)));
  const save = useAction(() => api.post('/orders', { ...f, guestId: f.guestId || undefined, groupId: f.groupId || undefined, items: lines.filter((l) => l.itemId).map((l) => ({ ...l, instructions: l.instructions || undefined })) }), { success: 'Order created', invalidate: ['/orders'], onSuccess: () => nav('/orders') });
  return (
    <div className="mx-auto max-w-3xl"><Card className="space-y-4 p-6"><h1 className="text-lg font-bold">Create New Order</h1>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Customer Type *"><NativeSelect value={f.customerType} onChange={(e) => setF({ ...f, customerType: e.target.value })}><option value="WALK_IN">Walk-in Customer</option><option value="GUEST">Guest (In-House)</option><option value="GROUP">Group</option></NativeSelect></Field>
        <Field label="Sales Point *"><NativeSelect value={f.salesPointId} onChange={(e) => { setF({ ...f, salesPointId: e.target.value }); setLines([{ itemId: '', quantity: 1, instructions: '' }]); }}><option value="">Select Sales Point</option>{sps?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        {f.customerType === 'GUEST' && <Field label="In-house guest"><NativeSelect value={f.guestId} onChange={(e) => setF({ ...f, guestId: e.target.value })}><option value="">Select guest</option>{inHouse?.map((s) => <option key={s.id} value={s.guestId}>{s.room.number} — {s.guest.firstName} {s.guest.lastName}</option>)}</NativeSelect></Field>}
        {f.customerType === 'GROUP' && <Field label="Group"><NativeSelect value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })}><option value="">Select group</option>{groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect></Field>}
        <Field label="Payment Method *"><NativeSelect value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="TRANSFER">Transfer</option><option value="ROOM_CHARGE">Charge to Room</option><option value="CITY_LEDGER">City Ledger</option></NativeSelect></Field>
      </div>
      <div className="flex items-center justify-between"><span className="font-semibold">Order Items</span><Button size="sm" variant="success" onClick={() => setLines([...lines, { itemId: '', quantity: 1, instructions: '' }])}>+ Add Item</Button></div>
      <table className="w-full text-sm"><thead className="text-xs uppercase text-muted-foreground"><tr><th className="text-left">Item</th><th>Unit price</th><th>Quantity</th><th>Subtotal</th><th /></tr></thead><tbody>
        {lines.map((l, i) => <tr key={i} className="border-t align-top"><td className="py-2"><NativeSelect value={l.itemId} onChange={(e) => upd(i, { itemId: e.target.value })}><option value="">Select Item</option>{cat?.items?.map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}</NativeSelect><Textarea className="mt-1 min-h-[36px]" placeholder="Special instructions…" value={l.instructions} onChange={(e) => upd(i, { instructions: e.target.value })} /></td><td className="px-2 text-center">{money(price(l.itemId))}</td><td className="px-2"><Input type="number" min="1" className="w-20" value={l.quantity} onChange={(e) => upd(i, { quantity: Number(e.target.value) })} /></td><td className="text-center">{money(price(l.itemId) * l.quantity)}</td><td><button className="text-red-600" onClick={() => setLines(lines.filter((_, x) => x !== i))}><Trash2 className="h-4 w-4" /></button></td></tr>)}
      </tbody></table>
      <div className="text-right text-lg font-bold">Total: {money(total)}</div>
      <div className="grid grid-cols-2 gap-3"><Field label="Special Instructions"><Textarea value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field><Field label="Order Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => nav('/orders')}>Cancel</Button><Button disabled={!f.salesPointId || !lines.some((l) => l.itemId) || save.isPending} onClick={() => save.mutate(undefined)}>Create order</Button></div>
    </Card></div>
  );
}

export function Kitchen() {
  const { data, refetch } = useGet('/orders/kitchen');
  const next = useAction((v: { id: string; status: string }) => api.patch(`/orders/${v.id}/status`, { status: v.status }), { invalidate: ['/orders/kitchen'] });
  const col = (title: string, rows: any[] | undefined, tone: string, empty: string, nextStatus: (o: any) => string, label: string) => (
    <div className={`rounded-lg border p-4 ${tone}`}><div className="mb-3 font-semibold">{title} <Badge>{rows?.length ?? 0}</Badge></div>
      {!rows?.length ? <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p> : rows.map((o) => (
        <Card key={o.id} className="mb-2 p-3 text-sm"><div className="flex justify-between"><b>{o.orderNo}</b><span className="text-xs text-muted-foreground">{o.salesPoint.name}</span></div>
          <ul className="my-1 list-disc pl-5">{o.items.map((i: any) => <li key={i.id}>{i.quantity} × {i.item.name}{i.instructions && <em className="text-xs text-muted-foreground"> ({i.instructions})</em>}</li>)}</ul>
          <Button size="sm" onClick={() => next.mutate({ id: o.id, status: nextStatus(o) })}>{label}</Button></Card>))}
    </div>
  );
  return (
    <>
      <PageHeader title="Kitchen Display - Standard Orders"><Button onClick={() => refetch()}><RefreshCw className="h-4 w-4" /> Refresh</Button></PageHeader>
      <div className="grid gap-4 md:grid-cols-2">
        {col('Pending Orders', data?.pending, 'bg-yellow-50', 'No pending orders', (o) => (o.status === 'PENDING' ? 'PREPARING' : 'READY'), 'Advance')}
        {col('Ready Orders', data?.ready, 'bg-green-50', 'No ready orders', () => 'SERVED', 'Mark served')}
      </div>
    </>
  );
}
