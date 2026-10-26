import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { cn, dt, money, num, today } from '@/lib/utils';
import { Field, FilterBar, PageHeader, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';

type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
interface Flag {
  key: string; type: string; severity: Severity; kind: 'AT_RISK' | 'GIVEN_AWAY'; title: string; detail: string; amount: number;
  staff: string | null; at: string; canReview: boolean; review?: { status: string; note: string | null; by: string | null; at: string } | null;
}
interface ScoreRow {
  staffId: string; staff: string; orders: number; sales: number; voided: number; voidRate: number; paidVoids: number;
  comps: number; discounts: number; adjustments: number; high: number; medium: number; atRisk: number; givenAway: number;
}

const TYPE_LABEL: Record<string, string> = {
  VOID_PAID: 'Paid void', HIGH_DISCOUNT: 'Big discount', COMP_STAY: 'Free stay', COMP_ORDER: 'Free order',
  ADJ_SELF_APPROVED: 'Self-approved write-off', ADJ_LARGE: 'Large write-off', FOLIO_OPEN: 'Guest owes', UNPAID_AGED: 'Aged credit sale',
};
const SEV_VARIANT = { HIGH: 'red', MEDIUM: 'orange', LOW: 'gray' } as const;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const THRESHOLD_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: 'discountPct', label: 'Flag percentage discounts of at least (%)' },
  { key: 'discountFixed', label: 'Flag fixed discounts of at least (₦)' },
  { key: 'voidValue', label: 'A paid void is serious from (₦)', hint: 'Below this it is shown as low risk.' },
  { key: 'compOrderValue', label: 'A complimentary order is medium risk from (₦)' },
  { key: 'adjustmentValue', label: 'Flag stock write-offs worth at least (₦ at cost)' },
  { key: 'agingDays', label: 'Flag credit sales unpaid after (days)' },
  { key: 'folioDays', label: 'Flag checked-out guests still owing after (days)' },
];

function ThresholdDialog({ initial, onClose }: { initial: Record<string, number>; onClose: () => void }) {
  const [f, setF] = useState<Record<string, string>>(Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])));
  const save = useAction(() => api.put('/guard/settings', Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)]))), {
    success: 'Thresholds saved', invalidate: ['/guard/flags'], onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Revenue Guard thresholds</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Only the admin can change these. Lower numbers flag more activity.</p>
      <div className="grid gap-3">
        {THRESHOLD_FIELDS.map((t) => (
          <Field key={t.key} label={t.label} hint={t.hint}><Input type="number" min="0" value={f[t.key] ?? ''} onChange={(e) => setF({ ...f, [t.key]: e.target.value })} /></Field>
        ))}
      </div>
      <Button onClick={() => save.mutate(undefined)} disabled={save.isPending}>Save thresholds</Button>
    </DialogContent></Dialog>
  );
}

export default function Guard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [f, setF] = useState({ from: daysAgo(6), to: today(), minSeverity: 'MEDIUM', status: 'open' });
  const [cfg, setCfg] = useState(false);
  const { data, isLoading, error } = useGet('/guard/flags', f);
  const s = data?.summary;

  const review = useAction((v: { key: string; status: 'REVIEWED' | 'DISMISSED' | 'OPEN'; note?: string }) => api.post('/guard/flags/review', v), {
    success: 'Saved', invalidate: ['/guard/flags'],
  });
  const markReviewed = (fl: Flag) => {
    const note = prompt('What did you check or do? (optional)');
    if (note === null) return;
    review.mutate({ key: fl.key, status: 'REVIEWED', note: note.trim() || undefined });
  };
  const dismiss = (fl: Flag) => {
    const note = prompt('Why is this fine to dismiss? (required)');
    if (note === null) return;
    if (note.trim().length < 3) return void toast.error('Please add a short reason');
    review.mutate({ key: fl.key, status: 'DISMISSED', note: note.trim() });
  };

  return (
    <>
      <PageHeader title="Revenue Guard" subtitle="Exceptions that deserve a manager's attention">
        {isAdmin && <Button variant="outline" onClick={() => setCfg(true)}><Settings2 className="h-4 w-4" /> Thresholds</Button>}
      </PageHeader>

      <FilterBar>
        <Field label="From"><Input type="date" value={f.from} max={f.to} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Show"><NativeSelect value={f.minSeverity} onChange={(e) => setF({ ...f, minSeverity: e.target.value })}>
          <option value="HIGH">High risk only</option><option value="MEDIUM">Medium and above</option><option value="LOW">Everything</option>
        </NativeSelect></Field>
        <Field label="Status"><NativeSelect value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="open">Needs review</option><option value="reviewed">Already reviewed</option><option value="all">All</option>
        </NativeSelect></Field>
      </FilterBar>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Stat label="HIGH RISK, UNREVIEWED" value={s?.high ?? 0} tone="red" />
        <Stat label="MEDIUM RISK, UNREVIEWED" value={s?.medium ?? 0} tone="orange" />
        <Stat label="MONEY AT RISK" value={money(s?.atRisk)} sub="paid voids, write-offs, unpaid balances" tone="red" />
        <Stat label="REVENUE GIVEN AWAY" value={money(s?.givenAway)} sub="discounts and complimentary items" tone="purple" />
      </div>

      <ListCard<Flag> title="Exceptions" rows={data?.flags} loading={isLoading} error={error} empty="Nothing needs attention for this period." cols={[
        { header: 'Risk', cell: (x) => <Badge variant={SEV_VARIANT[x.severity]}>{x.severity}</Badge> },
        { header: 'What happened', className: 'min-w-[360px]', cell: (x) => (
          <div>
            <div className="text-sm font-medium"><Badge variant="blue" className="mr-2">{TYPE_LABEL[x.type] ?? x.type}</Badge>{x.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{x.detail}</div>
            {x.review && <div className="mt-1 text-xs text-slate-600">{x.review.status === 'DISMISSED' ? 'Dismissed' : 'Reviewed'} by {x.review.by ?? 'unknown'}{x.review.note ? `: ${x.review.note}` : ''}</div>}
          </div>) },
        { header: 'Staff', cell: (x) => x.staff ?? '—' },
        { header: 'Amount', cell: (x) => <div><b>{money(x.amount)}</b><div className="text-xs text-muted-foreground">{x.kind === 'AT_RISK' ? 'at risk' : 'given away'}</div></div> },
        { header: 'When', cell: (x) => <span className="text-xs">{dt(x.at)}</span> },
        { header: 'Actions', cell: (x) => !x.canReview
          ? <span className="text-xs text-muted-foreground">Involves you</span>
          : x.review
            ? <button className="text-xs font-medium text-blue-700" onClick={() => confirm('Reopen this flag?') && review.mutate({ key: x.key, status: 'OPEN' })}>Reopen</button>
            : <div className="flex gap-2"><Button size="sm" variant="success" disabled={review.isPending} onClick={() => markReviewed(x)}>Reviewed</Button><Button size="sm" variant="outline" disabled={review.isPending} onClick={() => dismiss(x)}>Dismiss</Button></div> },
      ]} />
      <p className="mt-2 text-xs text-muted-foreground">Guests who left owing and aged credit sales always show today's open balances, whatever date range is chosen. Dismissing needs a reason; staff cannot review flags that involve themselves (the admin can).</p>

      <div className="mt-6">
        <ListCard<ScoreRow> title="Staff scorecard for this period" rows={data?.scorecard} loading={isLoading} empty="No staff activity in this period." cols={[
          { header: 'Staff', cell: (r) => <b>{r.staff}</b> },
          { header: 'Orders', cell: (r) => num(r.orders, 0) },
          { header: 'Sales', cell: (r) => money(r.sales) },
          { header: 'Voided', cell: (r) => <span className={cn(r.voidRate >= 10 ? 'font-semibold text-red-600' : r.voidRate >= 5 ? 'font-semibold text-orange-600' : '')}>{r.voided} ({num(r.voidRate, 1)}%)</span> },
          { header: 'Paid voids', cell: (r) => r.paidVoids },
          { header: 'Free items', cell: (r) => r.comps },
          { header: 'Discounts', cell: (r) => r.discounts },
          { header: 'Write-offs', cell: (r) => r.adjustments },
          { header: 'Flags', cell: (r) => <div className="flex gap-1">{r.high > 0 && <Badge variant="red">{r.high} high</Badge>}{r.medium > 0 && <Badge variant="orange">{r.medium} med</Badge>}{!r.high && !r.medium && <span className="text-muted-foreground">—</span>}</div> },
          { header: 'At risk', cell: (r) => money(r.atRisk) },
          { header: 'Given away', cell: (r) => money(r.givenAway) },
        ]} />
      </div>

      {cfg && data?.thresholds && <ThresholdDialog initial={data.thresholds} onClose={() => setCfg(false)} />}
    </>
  );
}
