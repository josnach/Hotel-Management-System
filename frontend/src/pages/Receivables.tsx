import { useState } from 'react';
import { Field, PageHeader, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { d, money } from '@/lib/utils';

const KEYS = ['/finance/receivables/aging', '/finance/receivables/config'];
const MODES: Record<string, string> = { OFF: 'Do nothing', WARN: 'Allow, but record it and flag it', BLOCK: 'Block unless a manager approves' };

export default function Receivables() {
  const { data, isLoading, error } = useGet<any>('/finance/receivables/aging');
  const [terms, setTerms] = useState<any | null>(null);
  const [stmt, setStmt] = useState<string | null>(null);
  const t = data?.totals;
  return (
    <>
      <PageHeader title="Receivables Aging" subtitle="What companies owe, how old it is, and their credit limits" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Total owed" value={money(t?.outstanding ?? 0)} /><Stat label="Overdue" value={money(t?.overdue ?? 0)} tone={t?.overdue ? 'yellow' : 'white'} />
        <Stat label="Over 90 days" value={money(t?.over90 ?? 0)} tone={t?.over90 ? 'red' : 'white'} /><Stat label="Over credit limit" value={t?.overLimit ?? 0} tone={t?.overLimit ? 'red' : 'white'} />
        <Stat label="31–90 days" value={money((t?.d31_60 ?? 0) + (t?.d61_90 ?? 0))} />
      </div>
      <ListCard rows={data?.rows} loading={isLoading} error={error} empty="No company accounts owe anything." cols={[
        { header: 'Company', cell: (r: any) => <button className="text-left font-medium text-blue-700 underline" onClick={() => setStmt(r.id)}>{r.name}</button> },
        { header: '0–30', cell: (r: any) => money(r.buckets.current) }, { header: '31–60', cell: (r: any) => money(r.buckets.d31_60) },
        { header: '61–90', cell: (r: any) => money(r.buckets.d61_90) }, { header: 'Over 90', cell: (r: any) => <span className={r.buckets.over90 ? 'font-medium text-red-600' : ''}>{money(r.buckets.over90)}</span> },
        { header: 'Owes', cell: (r: any) => <b>{money(r.outstanding)}</b> },
        { header: 'Limit', cell: (r: any) => (r.creditLimit === null ? 'None' : <span className={r.overLimit ? 'font-medium text-red-600' : ''}>{money(r.creditLimit)}{r.overLimit ? ' (over)' : ''}</span>) },
        { header: 'Terms', cell: (r: any) => `${r.termsDays} days${r.ownTerms ? '' : ' (default)'}` },
        { header: '', cell: (r: any) => <Button size="sm" variant="outline" onClick={() => setTerms(r)}>Limit and terms</Button> },
      ]} />
      {data && <Policy cfg={data.config} />}
      {terms && <TermsDialog row={terms} defaults={data.config} onClose={() => setTerms(null)} />}
      {stmt && <Statement id={stmt} onClose={() => setStmt(null)} />}
    </>
  );
}

function Policy({ cfg }: { cfg: any }) {
  const [c, setC] = useState({ defaultTermsDays: String(cfg.defaultTermsDays), defaultCreditLimit: cfg.defaultCreditLimit === null ? '' : String(cfg.defaultCreditLimit), overLimitMode: cfg.overLimitMode });
  const save = useAction(() => api.put('/finance/receivables/config', { defaultTermsDays: Number(c.defaultTermsDays || 0), defaultCreditLimit: c.defaultCreditLimit === '' ? null : Number(c.defaultCreditLimit), overLimitMode: c.overLimitMode }), { success: 'Credit policy saved', invalidate: KEYS });
  return (
    <Card className="mt-6 max-w-3xl space-y-3 p-4">
      <div className="font-semibold">Hotel-wide credit policy</div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Days to pay (default)"><Input inputMode="numeric" value={c.defaultTermsDays} onChange={(e) => setC({ ...c, defaultTermsDays: e.target.value })} /></Field>
        <Field label="Credit limit (default)" hint="Empty means no limit"><Input inputMode="decimal" value={c.defaultCreditLimit} onChange={(e) => setC({ ...c, defaultCreditLimit: e.target.value })} /></Field>
        <Field label="When a charge goes over the limit"><NativeSelect value={c.overLimitMode} onChange={(e) => setC({ ...c, overLimitMode: e.target.value })}>{Object.entries(MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></Field>
      </div>
      <p className="text-xs text-muted-foreground">Each company can have its own limit and terms with the "Limit and terms" button, which replace these defaults. The limit is checked when a company is booked in and when an order is charged to its city ledger.</p>
      <Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save policy</Button>
    </Card>
  );
}

function TermsDialog({ row, defaults, onClose }: { row: any; defaults: any; onClose: () => void }) {
  const [limit, setLimit] = useState(row.ownLimit ? String(row.creditLimit) : ''); const [days, setDays] = useState(row.ownTerms ? String(row.termsDays) : '');
  const save = useAction(() => api.put(`/finance/receivables/groups/${row.id}/terms`, { creditLimit: limit === '' ? null : Number(limit), paymentTermsDays: days === '' ? null : Number(days) }), { success: 'Saved', invalidate: KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent>
      <DialogHeader><DialogTitle>{row.name}: limit and terms</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label="Credit limit (₦)" hint={`Empty uses the default (${defaults.defaultCreditLimit === null ? 'no limit' : money(defaults.defaultCreditLimit)})`}><Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
        <Field label="Days to pay" hint={`Empty uses the default (${defaults.defaultTermsDays} days)`}><Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>
      </div>
    </DialogContent></Dialog>
  );
}

function Statement({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useGet<any>(`/finance/receivables/groups/${id}/statement`);
  const print = () => {
    const w = window.open('', '_blank', 'width=800,height=900'); if (!w || !data) return;
    const rows = data.lines.map((l: any) => `<tr><td>${d(l.date)}</td><td>${l.description}</td><td style="text-align:right">${l.charge ? money(l.charge) : ''}</td><td style="text-align:right">${l.payment ? money(l.payment) : ''}</td><td style="text-align:right">${money(l.balance)}</td></tr>`).join('');
    w.document.write(`<html><head><title>Statement</title><style>body{font:13px sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{padding:5px;border-bottom:1px solid #ddd;text-align:left}</style></head><body><h2>Statement of account: ${data.company.name}</h2><p>As at ${d(data.asAt)} · Payment terms ${data.termsDays} days</p><table><tr><th>Date</th><th>Details</th><th>Charges</th><th>Payments</th><th>Balance</th></tr>${rows}</table><h3>Amount owing: ${money(data.aging.outstanding)}</h3><p>0–30 days ${money(data.aging.buckets.current)} · 31–60 ${money(data.aging.buckets.d31_60)} · 61–90 ${money(data.aging.buckets.d61_90)} · over 90 ${money(data.aging.buckets.over90)}</p></body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Statement: {data?.company.name}</DialogTitle></DialogHeader>
        {data && (<div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Owes" value={money(data.aging.outstanding)} /><Stat label="Overdue" value={money(data.aging.overdue)} tone={data.aging.overdue ? 'yellow' : 'white'} /><Stat label="Oldest item" value={`${data.aging.oldestDays} days`} /><Stat label="Credit limit" value={data.creditLimit === null ? 'None' : money(data.creditLimit)} /></div>
          <ListCard rows={data.lines} empty="No activity." cols={[{ header: 'Date', cell: (l: any) => d(l.date) }, { header: 'Details', cell: (l: any) => l.description }, { header: 'Charge', cell: (l: any) => (l.charge ? money(l.charge) : '') }, { header: 'Paid', cell: (l: any) => (l.payment ? money(l.payment) : '') }, { header: 'Balance', cell: (l: any) => money(l.balance) }]} />
          <Button variant="outline" onClick={print}>Print statement</Button>
        </div>)}
      </DialogContent>
    </Dialog>
  );
}
