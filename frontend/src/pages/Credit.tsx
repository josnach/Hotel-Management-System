import { useState } from 'react';
import { Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { dt, money } from '@/lib/utils';
import { Field, PageHeader } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';

export default function Credit() {
  const [f, setF] = useState<any>({ paymentStatus: '', guestId: '', groupId: '', salesPointId: '', from: '', to: '' });
  const [applied, setApplied] = useState<any>({});
  const { data, isLoading } = useGet('/orders/credit', applied);
  const { data: sps } = useGet<any[]>('/sales-points');
  const { data: groups } = useGet<any[]>('/groups');
  const { data: guests } = useGet<any>('/guests', { pageSize: 200 });
  const pay = useAction((id: string) => api.post(`/orders/${id}/pay`, { method: 'CASH' }), { success: 'Payment recorded', invalidate: ['/orders/credit', '/orders/unpaid-count'] });
  const voidIt = useAction((id: string) => api.post(`/orders/${id}/void`, { reason: prompt('Reason for voiding this order?') || 'Voided' }), { success: 'Order voided', invalidate: ['/orders/credit', '/orders/unpaid-count'] });
  return (
    <>
      <PageHeader title="Credit Transactions (POS)" subtitle="Transactions awaiting payment">
        <Badge variant="yellow" className="px-3 py-1.5">Total Outstanding: {money(data?.outstanding)}</Badge><Badge variant="blue" className="px-3 py-1.5">Total Transactions: {data?.count ?? 0}</Badge>
      </PageHeader>
      <Card className="mb-4 p-4"><div className="grid gap-3 md:grid-cols-6">
        <Field label="Payment Status"><NativeSelect value={f.paymentStatus} onChange={(e) => setF({ ...f, paymentStatus: e.target.value })}><option value="">All</option><option value="UNPAID">Unpaid</option><option value="VOIDED">Voided</option></NativeSelect></Field>
        <Field label="Guest"><NativeSelect value={f.guestId} onChange={(e) => setF({ ...f, guestId: e.target.value })}><option value="">All Guests</option>{guests?.rows?.map((g: any) => <option key={g.id} value={g.id}>{g.firstName} {g.lastName}</option>)}</NativeSelect></Field>
        <Field label="Group"><NativeSelect value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })}><option value="">All Groups</option>{groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect></Field>
        <Field label="Sales Point"><NativeSelect value={f.salesPointId} onChange={(e) => setF({ ...f, salesPointId: e.target.value })}><option value="">All Sales Points</option>{sps?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        <Field label="Date From"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Date To"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
      </div><div className="mt-3 flex gap-2"><Button onClick={() => setApplied(f)}>Filter</Button><Button variant="dark" onClick={() => { const e = { paymentStatus: '', guestId: '', groupId: '', salesPointId: '', from: '', to: '' }; setF(e); setApplied(e); }}>Clear</Button></div></Card>
      <ListCard rows={data?.rows} loading={isLoading} rowClass={(o: any) => (o.paymentStatus === 'VOIDED' ? 'bg-red-50' : undefined)} cols={[
        { header: 'Order / Transaction', cell: (o: any) => <div><div className="font-medium">Order #{o.orderNo}</div><div className="text-xs text-muted-foreground">{o.items.length} item(s)</div></div> },
        { header: 'Customer', cell: (o: any) => (o.guest ? `${o.guest.firstName} ${o.guest.lastName}` : o.group?.name ?? 'Walk-in') }, { header: 'Sales Point', cell: (o: any) => o.salesPoint.name },
        { header: 'Amount', cell: (o: any) => <b className={o.paymentStatus === 'VOIDED' ? 'text-muted-foreground line-through' : 'text-red-600'}>{money(o.total)}</b> },
        { header: 'Status', cell: (o: any) => <Badge variant={statusVariant(o.paymentStatus)}>{o.paymentStatus[0] + o.paymentStatus.slice(1).toLowerCase()}</Badge> }, { header: 'Date', cell: (o: any) => dt(o.createdAt) },
        { header: 'Actions', cell: (o: any) => <div className="flex gap-1"><Button size="sm" onClick={() => window.print()}><Printer className="h-3 w-3" /> Print</Button>{o.paymentStatus === 'UNPAID' && <><Button size="sm" variant="success" onClick={() => pay.mutate(o.id)}>Pay Now</Button><Button size="sm" variant="destructive" onClick={() => voidIt.mutate(o.id)}>Void</Button></>}</div> },
      ]} />
    </>
  );
}
