import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Eye, FileDown, Printer, Receipt, Search, Send } from 'lucide-react';
import { api, openPdf } from '@/lib/api';
import { toast } from 'sonner';
import { DeliveryHistory, SendFolioDialog } from '@/components/SendFolioDialog';
import { useAction, useGet } from '@/lib/hooks';
import { d, dt, money } from '@/lib/utils';
import { Field, PageHeader, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';

export default function Folios() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useGet('/folios', { q });
  const c = data?.counts;
  return (
    <>
      <PageHeader title="All Folios" subtitle="Complete overview of all guest and group folios">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="w-64 pl-8" placeholder="Search guest/group folios" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </PageHeader>
      <div className="mb-4 grid gap-3 md:grid-cols-4"><Stat label="Total Folios" value={c?.total ?? 0} /><Stat label="Active" value={<span className="text-green-600">{c?.active ?? 0}</span>} /><Stat label="Checked Out" value={<span className="text-yellow-600">{c?.checkedOut ?? 0}</span>} /><Stat label="Settled" value={c?.settled ?? 0} /></div>
      <ListCard rows={data?.rows} loading={isLoading} cols={[
        { header: 'Folio ID', cell: (f: any) => <span className="font-mono text-xs">{f.folioNo}</span> },
        { header: 'Guest / Group', cell: (f: any) => <div><div className="font-semibold">{f.guest ? `${f.guest.firstName} ${f.guest.lastName}` : f.group?.name}</div>{f.group && <div className="text-xs text-muted-foreground">Group: {f.group.name}</div>}</div> },
        { header: 'Room', cell: (f: any) => f.stay?.room?.number ?? '—' },
        { header: 'Check-in', cell: (f: any) => <div>{d(f.createdAt)}<div className="text-xs text-muted-foreground">{new Date(f.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</div></div> },
        { header: 'Balance', cell: (f: any) => <span className="font-semibold text-red-600">{money(f.balance)}</span> },
        { header: 'Status', cell: (f: any) => <Badge variant={statusVariant(f.status)}>{f.status === 'ACTIVE' ? 'Checked in' : f.status === 'CHECKED_OUT' ? 'Checked out' : 'Settled'}</Badge> },
        { header: 'Actions', cell: (f: any) => <div className="flex gap-3"><Link to={`/folios/${f.id}`} className="text-blue-700"><Eye className="h-4 w-4" /></Link><Link to={`/folios/${f.id}?print=1`}><Printer className="h-4 w-4" /></Link></div> },
      ]} />
    </>
  );
}

export function FolioDetail() {
  const { id } = useParams();
  const { data: f } = useGet(`/folios/${id}`);
  const [amt, setAmt] = useState('');
  const [method, setMethod] = useState('CASH');
    const [sendFor, setSendFor] = useState<{ txId?: string } | null>(null);
  const pdf = (path: string, name?: string) => openPdf(path, name).catch((e: Error) => toast.error(e.message));
  const pay = useAction(() => api.post(`/folios/${id}/payments`, { amount: Number(amt), method }), { success: 'Payment recorded', invalidate: [`/folios/${id}`, '/stays/in-house'], onSuccess: () => setAmt('') });
  if (!f) return null;
  return (
    <div className="mx-auto max-w-5xl">
      <Card className="p-6">
        <div className="flex items-start justify-between"><div><h1 className="text-xl font-bold">Guest Folio - {f.guest ? `${f.guest.firstName} ${f.guest.lastName}` : f.group?.name}</h1><p className="text-sm text-muted-foreground">Total Guest Balance: <b className="text-red-600">{money(f.balance)}</b></p></div><div className="no-print flex gap-2">
  <Button variant="outline" onClick={() => pdf(`/folios/${id}/invoice.pdf`)}><FileDown className="h-4 w-4" /> PDF</Button>
  <Button variant="outline" onClick={() => setSendFor({})}><Send className="h-4 w-4" /> Send</Button>
  <Button variant="dark" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
</div></div>
        <div className="mt-4 rounded-md border bg-blue-50 p-3 text-sm"><div className="font-semibold text-blue-800">Folio: {f.folioNo}</div><div className="text-xs text-muted-foreground">Check-in: {dt(f.stay?.checkInAt ?? f.createdAt)}{f.stay?.checkOutAt && ` | Check-out: ${dt(f.stay.checkOutAt)}`} · Status: {f.status.replace('_', ' ').toLowerCase()}</div></div>
        <h2 className="mb-2 mt-6 font-semibold">Transaction History</h2>
        <table className="w-full text-sm"><thead className="border-b text-xs uppercase text-muted-foreground"><tr>{['Date', 'Description', 'Type', 'Bills', 'Payments', 'Balance', 'Sales Point', ''].map((h) => <th key={h} className="py-2 text-left">{h}</th>)}</tr></thead><tbody>
          {f.txs.map((t: any) => <tr key={t.id} className="border-b"><td className="py-2">{dt(t.createdAt)}</td><td>{t.description}</td><td><Badge variant={t.type === 'CREDIT' ? 'green' : 'red'}>{t.type === 'CREDIT' ? 'Credit' : t.type === 'DEBIT_GROUP' ? 'Debit Group' : 'Debit Personal'}</Badge></td><td className="text-red-600">{Number(t.bill) ? money(t.bill) : ''}</td><td className="text-green-600">{Number(t.payment) ? money(t.payment) : ''}</td><td className="font-medium text-red-600">{money(t.balance)}</td><td>{t.salesPoint?.name ?? 'Frontdesk'}</td><td className="no-print whitespace-nowrap">{Number(t.payment) > 0 && <span className="flex gap-2"><button title="Receipt PDF" className="text-blue-700" onClick={() => pdf(`/folios/${id}/payments/${t.id}/receipt.pdf`)}><Receipt className="h-4 w-4" /></button><button title="Send receipt" className="text-blue-700" onClick={() => setSendFor({ txId: t.id })}><Send className="h-4 w-4" /></button></span>}</td> </tr>)}
        </tbody></table>
        {f.status === 'ACTIVE' && <div className="no-print mt-6 grid items-end gap-3 border-t pt-4 md:grid-cols-4"><Field label="Payment (₦)"><Input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field><Field label="Method"><NativeSelect value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="TRANSFER">Transfer</option></NativeSelect></Field><Button onClick={() => pay.mutate(undefined)} disabled={!Number(amt) || pay.isPending}>Record payment</Button></div>}
             <DeliveryHistory folioId={id!} />
      </Card>
      <SendFolioDialog folioId={id!} open={!!sendFor} txId={sendFor?.txId} onClose={() => setSendFor(null)} />
    </div>
  );
}