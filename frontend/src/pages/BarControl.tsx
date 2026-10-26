import { useState } from 'react';
import { Field, FilterBar, PageHeader, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { money, monthStart, num, today } from '@/lib/utils';

type Tab = 'cost' | 'variance' | 'count';
const TABS: [Tab, string][] = [['cost', 'Recipes & food cost'], ['variance', 'Bar variance'], ['count', 'Stock count']];

export default function BarControl() {
  const [tab, setTab] = useState<Tab>('cost');
  return (
    <>
      <PageHeader title="Bar & Restaurant Control" subtitle="Recipe costing, bottle-versus-shots variance and stock counts" />
      <div className="mb-4 flex gap-2">{TABS.map(([k, label]) => <Button key={k} variant={tab === k ? 'default' : 'outline'} onClick={() => setTab(k)}>{label}</Button>)}</div>
      {tab === 'cost' && <CostTab />}
      {tab === 'variance' && <VarianceTab />}
      {tab === 'count' && <CountTab />}
    </>
  );
}

// ───────── Recipes & food cost ─────────
function CostTab() {
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const { data, isLoading, error } = useGet<any>('/bar/recipes');
  const [editing, setEditing] = useState<any | null>(null);
  const over = (data?.rows ?? []).filter((r: any) => r.overTarget).length;
  return (
    <>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat label="Dishes & shots with recipes" value={data?.rows?.length ?? 0} />
        <Stat label="Food-cost target" value={`${data?.target ?? 35}%`} />
        <Stat label="Over target" value={over} tone={over ? 'red' : 'green'} />
      </div>
      {canEdit && <div className="mb-3"><Button onClick={() => setEditing({})}>New recipe</Button></div>}
      <ListCard rows={data?.rows} loading={isLoading} error={error} empty="No recipes yet. Items without a recipe simply deduct themselves from stock when sold." cols={[
        { header: 'Dish / shot', cell: (r: any) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.salesPoint}</div></div> },
        { header: 'Ingredients', cell: (r: any) => <div className="text-xs">{r.lines.map((l: any) => `${num(l.quantity, 3)} × ${l.ingredient}`).join(', ')}</div> },
        { header: 'Cost', cell: (r: any) => money(r.cost) },
        { header: 'Price', cell: (r: any) => money(r.sellPrice) },
        { header: 'Food cost', cell: (r: any) => <Badge variant={r.overTarget ? 'red' : 'green'}>{r.foodCostPct}%</Badge> },
        { header: 'Margin', cell: (r: any) => money(r.margin) },
        { header: 'Can make', cell: (r: any) => r.portionsAvailable },
        ...(canEdit ? [{ header: '', cell: (r: any) => <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Edit</Button> }] : []),
      ]} />
      {editing && <RecipeDialog dish={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RecipeDialog({ dish, onClose }: { dish: any; onClose: () => void }) {
  const { data: items } = useGet<any[]>('/bar/items');
  const [dishId, setDishId] = useState<string>(dish.id ?? '');
  const [lines, setLines] = useState<{ ingredientId: string; quantity: string; per: string }[]>(
    (dish.lines ?? []).map((l: any) => ({ ingredientId: l.ingredientId, quantity: String(l.quantity), per: '' })),
  );
  const save = useAction(() => api.put(`/bar/recipes/${dishId}`, { lines: lines.filter((l) => l.ingredientId && Number(l.quantity) > 0).map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity) })) }),
    { success: 'Recipe saved', invalidate: ['/bar/recipes', '/bar/items'], onSuccess: onClose });
  const set = (i: number, patch: Partial<(typeof lines)[number]>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const cost = lines.reduce((s, l) => s + Number(l.quantity || 0) * (items?.find((x) => x.id === l.ingredientId)?.costPrice ?? 0), 0);
  const price = items?.find((x) => x.id === dishId)?.sellPrice ?? 0;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{dish.id ? `Recipe: ${dish.name}` : 'New recipe'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!dish.id && (
            <Field label="Dish or shot (the item you sell)">
              <NativeSelect value={dishId} onChange={(e) => setDishId(e.target.value)}>
                <option value="">Choose…</option>
                {(items ?? []).filter((i) => !i.hasRecipe).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.salesPoint})</option>)}
              </NativeSelect>
            </Field>
          )}
          <div className="text-xs text-muted-foreground">Quantities are in the ingredient's own stock unit. For a shot from a bottle, type how many shots a bottle makes (for example 30) and the quantity fills in as 1/30.</div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_90px_auto] items-end gap-2">
              <Field label={i === 0 ? 'Ingredient' : ''}><NativeSelect value={l.ingredientId} onChange={(e) => set(i, { ingredientId: e.target.value })}>
                <option value="">Choose…</option>
                {(items ?? []).filter((x) => x.id !== dishId && !x.hasRecipe).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </NativeSelect></Field>
              <Field label={i === 0 ? 'Quantity' : ''}><Input value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value, per: '' })} /></Field>
              <Field label={i === 0 ? 'Per unit' : ''}><Input placeholder="e.g. 30" value={l.per} onChange={(e) => set(i, { per: e.target.value, quantity: Number(e.target.value) > 0 ? String(+(1 / Number(e.target.value)).toFixed(6)) : l.quantity })} /></Field>
              <Button size="sm" variant="outline" onClick={() => setLines(lines.filter((_, k) => k !== i))}>×</Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines([...lines, { ingredientId: '', quantity: '', per: '' }])}>+ Add ingredient</Button>
          {price > 0 && <div className="text-sm">Cost {money(cost)} on a price of {money(price)}: food cost <b>{((cost / price) * 100).toFixed(1)}%</b></div>}
          <div className="flex justify-end gap-2">
            {dish.id && <Button variant="destructive" onClick={() => confirm('Remove this recipe? The item will go back to deducting itself from stock.') && (setLines([]), api.put(`/bar/recipes/${dishId}`, { lines: [] }).then(() => { onClose(); location.reload(); }))}>Remove recipe</Button>}
            <Button disabled={!dishId || !lines.length || save.isPending} onClick={() => save.mutate(undefined)}>Save recipe</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────── Variance ─────────
function VarianceTab() {
  const { data: sps } = useGet<any[]>('/sales-points');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [sp, setSp] = useState('');
  const end = new Date(to + 'T00:00:00'); end.setDate(end.getDate() + 1);
  const { data, isLoading, error } = useGet<any>('/bar/variance', { from: new Date(from + 'T00:00:00').toISOString(), to: end.toISOString(), ...(sp ? { salesPointId: sp } : {}) });
  return (
    <>
      <FilterBar>
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Sales point"><NativeSelect value={sp} onChange={(e) => setSp(e.target.value)}><option value="">All</option>{(sps ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        <Stat label="Net variance value" value={money(data?.totalVarianceValue ?? 0)} tone={(data?.totalVarianceValue ?? 0) < 0 ? 'red' : 'green'} />
      </FilterBar>
      <Card className="mb-3 p-3 text-xs text-muted-foreground">Variance is the net of approved stock adjustments, including those raised by stock counts. Negative means stock that was neither sold nor used in a recipe has gone missing. Shots are shown where a bottle has a shot recipe.</Card>
      <ListCard rows={data?.rows} loading={isLoading} error={error} empty="No stock movement in this period." cols={[
        { header: 'Item', cell: (r: any) => r.name },
        { header: 'Opening', cell: (r: any) => num(r.opening, 2) },
        { header: 'Received', cell: (r: any) => num(r.received, 2) },
        { header: 'Sold whole', cell: (r: any) => num(r.soldWhole, 2) },
        { header: 'Used in shots/dishes', cell: (r: any) => num(r.usedInRecipes, 2) },
        { header: 'Closing', cell: (r: any) => num(r.closing, 2) },
        { header: 'Variance', cell: (r: any) => <span className={r.varianceQty < 0 ? 'font-medium text-red-600' : ''}>{num(r.varianceQty, 2)}{r.shotsEquivalent !== null ? ` (${r.shotsEquivalent} shots)` : ''}</span> },
        { header: 'Value', cell: (r: any) => <span className={r.varianceValue < 0 ? 'font-medium text-red-600' : ''}>{money(r.varianceValue)}</span> },
        { header: 'Awaiting approval', cell: (r: any) => (r.pendingAdjustment ? <Badge variant="yellow">{num(r.pendingAdjustment, 2)}</Badge> : '—') },
      ]} />
    </>
  );
}

// ───────── Stock count ─────────
function CountTab() {
  const { data: sps } = useGet<any[]>('/sales-points');
  const [sp, setSp] = useState('');
  const sheet = useGet<any[]>('/bar/count-sheet', { salesPointId: sp }, !!sp);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any | null>(null);
  const submit = useAction(() => api.post('/bar/counts', { counts: Object.entries(counted).filter(([, v]) => v !== '').map(([itemId, v]) => ({ itemId, counted: Number(v) })) }),
    { success: 'Count submitted', invalidate: ['/inventory/adjustments'], onSuccess: (r: any) => { setResult(r); setCounted({}); } });
  return (
    <>
      <FilterBar>
        <Field label="Sales point (bar, restaurant…)"><NativeSelect value={sp} onChange={(e) => { setSp(e.target.value); setResult(null); setCounted({}); }}><option value="">Choose…</option>{(sps ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        <div className="md:col-span-2 flex items-end text-xs text-muted-foreground">Count what is physically on the shelf (use decimals for part-bottles, e.g. 2.5). Differences become stock adjustments for the usual approval; nothing changes until they are approved.</div>
        <div className="flex items-end"><Button className="w-full" disabled={!Object.values(counted).some((v) => v !== '') || submit.isPending} onClick={() => submit.mutate(undefined)}>Submit count</Button></div>
      </FilterBar>
      {result && (
        <Card className="mb-4 p-4">
          <div className="mb-2 font-semibold">Result: net variance {money(result.netVarianceValue)}</div>
          <ListCard rows={result.rows.filter((r: any) => r.variance !== 0)} empty="Every counted item matched the system." cols={[
            { header: 'Item', cell: (r: any) => r.name }, { header: 'System', cell: (r: any) => num(r.system, 2) }, { header: 'Counted', cell: (r: any) => num(r.counted, 2) },
            { header: 'Variance', cell: (r: any) => <span className={r.variance < 0 ? 'font-medium text-red-600' : ''}>{num(r.variance, 2)}</span> }, { header: 'Value', cell: (r: any) => money(r.varianceValue) },
            { header: '', cell: (r: any) => (r.alreadyPending ? <Badge variant="yellow">Adjustment already pending</Badge> : <Badge variant="blue">Sent for approval</Badge>) },
          ]} />
        </Card>
      )}
      {sp && <ListCard rows={sheet.data} loading={sheet.isLoading} error={sheet.error} empty="No stock items for this sales point." cols={[
        { header: 'Category', cell: (r: any) => r.category }, { header: 'Item', cell: (r: any) => r.name }, { header: 'System', cell: (r: any) => num(r.system, 2) },
        { header: 'Counted', cell: (r: any) => <Input className="w-28" inputMode="decimal" value={counted[r.id] ?? ''} onChange={(e) => setCounted({ ...counted, [r.id]: e.target.value })} /> },
        { header: 'Difference', cell: (r: any) => { const c = counted[r.id]; if (c === undefined || c === '') return '—'; const d = Number(c) - r.system; return <span className={d < 0 ? 'text-red-600' : ''}>{num(d, 2)}</span>; } },
      ]} />}
    </>
  );
}
