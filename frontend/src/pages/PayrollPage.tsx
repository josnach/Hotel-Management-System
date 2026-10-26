import { useState } from 'react';
import { Field, PageHeader, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { d, money } from '@/lib/utils';

type Tab = 'runs' | 'staff' | 'settings';
const KEYS = ['/finance/payroll', '/finance/employees', '/finance/payroll/config'];
const KIND: Record<string, string> = { PAYE: 'PAYE (state tax office)', PENSION: 'Pension (PFAs)', NHF: 'NHF', LEVIES: 'NSITF and ITF' };

export default function PayrollPage() {
  const [tab, setTab] = useState<Tab>('runs');
  return (
    <>
      <PageHeader title="Payroll" subtitle="PAYE, pension and NHF worked out for you. Rates and reliefs are set in Settings." />
      <div className="mb-4 flex gap-2">{([['runs', 'Payroll runs'], ['staff', 'Employees'], ['settings', 'Settings']] as [Tab, string][]).map(([k, l]) => <Button key={k} variant={tab === k ? 'default' : 'outline'} onClick={() => setTab(k)}>{l}</Button>)}</div>
      {tab === 'runs' && <Runs />}
      {tab === 'staff' && <Staff />}
      {tab === 'settings' && <Settings />}
    </>
  );
}

// ───────── Runs ─────────
function Runs() {
  const { data, isLoading, error } = useGet<any[]>('/finance/payroll');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="mb-3"><Button onClick={() => setAdding(true)}>New payroll run</Button></div>
      <ListCard rows={data} loading={isLoading} error={error} empty="No payroll runs yet." cols={[
        { header: 'Period', cell: (p: any) => <button className="font-medium text-blue-700 underline" onClick={() => setOpen(p.id)}>{p.name}</button> },
        { header: 'Dates', cell: (p: any) => `${d(p.startDate)} – ${d(p.endDate)}` }, { header: 'Staff', cell: (p: any) => p.employees },
        { header: 'Gross', cell: (p: any) => money(p.totalGross) }, { header: 'PAYE', cell: (p: any) => money(p.totalPaye) }, { header: 'Net pay', cell: (p: any) => money(p.totalNet) },
        { header: 'Status', cell: (p: any) => <Badge variant={statusVariant(p.status)}>{p.status}</Badge> },
      ]} />
      {adding && <NewRun onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); setOpen(id); }} />}
      {open && <RunDetail id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function NewRun({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1), last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const [f, setF] = useState({ name: now.toLocaleString('en-NG', { month: 'long', year: 'numeric' }), startDate: iso(first), endDate: iso(last) });
  const create = useAction(() => api.post('/finance/payroll', f), { success: 'Payroll worked out', invalidate: KEYS, onSuccess: (r: any) => onCreated(r.id) });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent>
      <DialogHeader><DialogTitle>New payroll run</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="From"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field><Field label="To"><Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field></div>
        <p className="text-xs text-muted-foreground">Works out pay for every active employee using today's pay details and the rates in Settings. You can add bonuses and deductions before approving.</p>
        <Button disabled={!f.name || create.isPending} onClick={() => create.mutate(undefined)}>Work out payroll</Button>
      </div>
    </DialogContent></Dialog>
  );
}

function RunDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const run = useGet<any>(`/finance/payroll/${id}`);
  const r = run.data;
  const [edit, setEdit] = useState<any | null>(null);
  const [slip, setSlip] = useState<any | null>(null);
  const [method, setMethod] = useState<'BANK' | 'CASH'>('BANK');
  const inv = [...KEYS, `/finance/payroll/${id}`];
  const approve = useAction(() => api.post(`/finance/payroll/${id}/approve`), { success: 'Approved and posted to the books', invalidate: inv });
  const pay = useAction(() => api.post(`/finance/payroll/${id}/pay`, { method }), { success: 'Salaries paid', invalidate: inv });
  const remit = useAction((kind: string) => api.post(`/finance/payroll/${id}/remit`, { kind, method, reference: prompt('Payment reference (optional)') || undefined }), { success: 'Remitted', invalidate: inv });
  const discard = useAction(() => api.del(`/finance/payroll/${id}`), { success: 'Discarded', invalidate: KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>{r?.name ?? 'Payroll'} {r && <Badge variant={statusVariant(r.status)}>{r.status}</Badge>}</DialogTitle></DialogHeader>
        {r && (<div className="space-y-4">
          <div className="grid grid-cols-3 gap-3"><Stat label="Gross pay" value={money(r.totals.gross)} /><Stat label="Net pay to staff" value={money(r.totals.net)} /><Stat label="Total cost to hotel" value={money(r.totals.employerCost)} /></div>
          <ListCard rows={r.payslips} empty="No payslips." cols={[
            { header: 'Employee', cell: (s: any) => <button className="text-left text-blue-700 underline" onClick={() => setSlip(s)}>{s.name}</button> },
            { header: 'Gross', cell: (s: any) => money(s.gross) }, { header: 'Pension', cell: (s: any) => money(s.pensionEmployee) }, { header: 'NHF', cell: (s: any) => money(s.nhf) },
            { header: 'PAYE', cell: (s: any) => money(s.paye) }, { header: 'Other', cell: (s: any) => (s.otherDeductions ? money(s.otherDeductions) : '—') }, { header: 'Net', cell: (s: any) => <b className={s.net < 0 ? 'text-red-600' : ''}>{money(s.net)}</b> },
            { header: '', cell: (s: any) => r.status === 'DRAFT' && <Button size="sm" variant="outline" onClick={() => setEdit(s)}>Bonus / deduction</Button> },
          ]} />
          <div className="flex flex-wrap items-end gap-2">
            {r.status === 'DRAFT' && <><Button disabled={approve.isPending} onClick={() => confirm('Approve and post this payroll to the books? It cannot be changed afterwards.') && approve.mutate(undefined)}>Approve and post</Button><Button variant="outline" onClick={() => confirm('Discard this draft?') && discard.mutate(undefined)}>Discard</Button></>}
            {r.status !== 'DRAFT' && <Field label="Pay from"><NativeSelect value={method} onChange={(e) => setMethod(e.target.value as any)}><option value="BANK">Bank</option><option value="CASH">Cash</option></NativeSelect></Field>}
            {r.status === 'APPROVED' && <Button disabled={pay.isPending} onClick={() => confirm(`Pay ${money(r.totals.net)} net salaries from ${method.toLowerCase()}?`) && pay.mutate(undefined)}>Pay salaries</Button>}
          </div>
          {r.status !== 'DRAFT' && (
            <Card className="p-3"><div className="mb-2 font-semibold">Money owed to others from this payroll</div>
              {r.remittances.map((x: any) => (
                <div key={x.kind} className="flex items-center justify-between border-b py-2 text-sm last:border-0"><span>{KIND[x.kind]}</span><span className="flex items-center gap-3">{money(x.due)}{x.remitted > 0 ? <Badge variant="green">Remitted</Badge> : x.due > 0 ? <Button size="sm" variant="outline" disabled={remit.isPending} onClick={() => confirm(`Pay ${money(x.due)} for ${KIND[x.kind]}?`) && remit.mutate(x.kind)}>Mark as paid</Button> : <span className="text-xs text-muted-foreground">Nothing due</span>}</span></div>
              ))}
              <p className="mt-2 text-xs text-muted-foreground">PAYE goes to the state internal revenue service of each employee's state. Pension goes to each employee's pension company.</p></Card>
          )}
        </div>)}
        {edit && <AdjustDialog slip={edit} onClose={() => setEdit(null)} invalidate={inv} />}
        {slip && <SlipDialog slip={slip} period={r} onClose={() => setSlip(null)} />}
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ slip, onClose, invalidate }: { slip: any; onClose: () => void; invalidate: string[] }) {
  const [bonus, setBonus] = useState(String(slip.bonus || '')); const [ded, setDed] = useState(String(slip.otherDeductions || '')); const [note, setNote] = useState(slip.deductionNote ?? '');
  const save = useAction(() => api.put(`/finance/payroll/payslips/${slip.id}`, { bonus: Number(bonus || 0), otherDeductions: Number(ded || 0), deductionNote: note || undefined }), { success: 'Updated and tax recalculated', invalidate, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent>
      <DialogHeader><DialogTitle>{slip.name}: bonus or deduction</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label="Bonus this month (taxed once)"><Input inputMode="decimal" value={bonus} onChange={(e) => setBonus(e.target.value)} /></Field>
        <Field label="Other deduction (loan repayment, advance)"><Input inputMode="decimal" value={ded} onChange={(e) => setDed(e.target.value)} /></Field>
        <Field label="Reason for the deduction"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>
      </div>
    </DialogContent></Dialog>
  );
}

function SlipDialog({ slip, period, onClose }: { slip: any; period: any; onClose: () => void }) {
  const rows: [string, number, boolean?][] = [['Basic salary', slip.basic], ['Housing allowance', slip.housing], ['Transport allowance', slip.transport], ['Other allowances', slip.otherAllow], ['Bonus', slip.bonus]];
  const cuts: [string, number][] = [['Pension (employee)', slip.pensionEmployee], ['National Housing Fund', slip.nhf], ['PAYE tax', slip.paye], ['Other deductions', slip.otherDeductions]];
  const print = () => {
    const w = window.open('', '_blank', 'width=700,height=800'); if (!w) return;
    const line = (k: string, v: number) => `<tr><td>${k}</td><td style="text-align:right">${money(v)}</td></tr>`;
    w.document.write(`<html><head><title>Payslip</title><style>body{font:14px sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td{padding:6px;border-bottom:1px solid #ddd}h3{margin:16px 0 4px}</style></head><body><h2>Payslip: ${period.name}</h2><p><b>${slip.name}</b>${slip.position ? ` · ${slip.position}` : ''}</p><h3>Earnings</h3><table>${rows.filter(([, v]) => v).map(([k, v]) => line(k, v)).join('')}${line('Gross pay', slip.gross)}</table><h3>Deductions</h3><table>${cuts.filter(([, v]) => v).map(([k, v]) => line(k, v)).join('')}${line('Total deductions', slip.deductions)}</table><h2>Net pay: ${money(slip.net)}</h2></body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent>
      <DialogHeader><DialogTitle>{slip.name}: payslip</DialogTitle></DialogHeader>
      <div className="text-sm">
        <div className="mb-1 font-semibold">Earnings</div>
        {rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between border-b py-1"><span>{k}</span><span>{money(v)}</span></div>)}
        <div className="flex justify-between py-1 font-semibold"><span>Gross pay</span><span>{money(slip.gross)}</span></div>
        <div className="mb-1 mt-3 font-semibold">Deductions</div>
        {cuts.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between border-b py-1"><span>{k}</span><span>{money(v)}</span></div>)}
        <div className="flex justify-between py-1 font-semibold"><span>Total deductions</span><span>{money(slip.deductions)}</span></div>
        <div className="mt-2 flex justify-between text-lg font-bold"><span>Net pay</span><span>{money(slip.net)}</span></div>
        <div className="mt-3 rounded-md bg-slate-50 p-2 text-xs text-muted-foreground">Taxable income for the year: {money(slip.taxableAnnual)}{slip.rentRelief ? ` · after rent relief of ${money(slip.rentRelief)}` : ''}. Employer pension: {money(slip.pensionEmployer)}.</div>
      </div>
      <Button variant="outline" onClick={print}>Print payslip</Button>
    </DialogContent></Dialog>
  );
}

// ───────── Employees ─────────
const BLANK = { fullName: '', position: '', department: '', phone: '', baseSalary: '', housingAllowance: '', transportAllowance: '', otherAllowances: '', annualRent: '', rentProofOnFile: false, otherAnnualReliefs: '', pensionEnrolled: true, nhfEnrolled: false, pfaName: '', rsaPin: '', tin: '', stateOfResidence: '', bankName: '', accountNumber: '', isActive: true };
function Staff() {
  const { data, isLoading, error } = useGet<any[]>('/finance/employees');
  const [edit, setEdit] = useState<any | null>(null);
  return (
    <>
      <div className="mb-3"><Button onClick={() => setEdit({ ...BLANK })}>Add employee</Button></div>
      <ListCard rows={data} loading={isLoading} error={error} empty="No employees yet." cols={[
        { header: 'Name', cell: (e: any) => <div><div className="font-medium">{e.fullName}</div><div className="text-xs text-muted-foreground">{e.position ?? ''}{e.department ? ` · ${e.department}` : ''}</div></div> },
        { header: 'Basic', cell: (e: any) => money(e.baseSalary) }, { header: 'Allowances', cell: (e: any) => money(e.housingAllowance + e.transportAllowance + e.otherAllowances) },
        { header: 'Pension', cell: (e: any) => <Badge variant={e.pensionEnrolled ? 'green' : 'gray'}>{e.pensionEnrolled ? 'Yes' : 'No'}</Badge> }, { header: 'NHF', cell: (e: any) => <Badge variant={e.nhfEnrolled ? 'green' : 'gray'}>{e.nhfEnrolled ? 'Yes' : 'No'}</Badge> },
        { header: 'Rent', cell: (e: any) => (e.annualRent ? `${money(e.annualRent)}${e.rentProofOnFile ? '' : ' (no proof)'}` : '—') },
        { header: 'Status', cell: (e: any) => <Badge variant={e.isActive ? 'green' : 'gray'}>{e.isActive ? 'Active' : 'Left'}</Badge> },
        { header: '', cell: (e: any) => <Button size="sm" variant="outline" onClick={() => setEdit({ ...BLANK, ...Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v ?? (typeof (BLANK as any)[k] === 'boolean' ? false : '')])) })}>Edit</Button> },
      ]} />
      {edit && <EmployeeDialog init={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function EmployeeDialog({ init, onClose }: { init: any; onClose: () => void }) {
  const [f, setF] = useState<any>(init);
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const text = (k: string, label: string, hint?: string) => <Field label={label} hint={hint}><Input value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></Field>;
  const amt = (k: string, label: string, hint?: string) => <Field label={label} hint={hint}><Input inputMode="decimal" value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></Field>;
  const check = (k: string, label: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} />{label}</label>;
  const save = useAction(() => {
    const body: any = {};
    for (const [k, v] of Object.entries(f)) { if (['id', 'payslips'].includes(k)) continue; body[k] = typeof (BLANK as any)[k] === 'number' || ['baseSalary', 'housingAllowance', 'transportAllowance', 'otherAllowances', 'annualRent', 'otherAnnualReliefs'].includes(k) ? Number(v || 0) : v === '' ? undefined : v; }
    return f.id ? api.put(`/finance/employees/${f.id}`, body) : api.post('/finance/employees', body);
  }, { success: 'Saved', invalidate: KEYS, onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{f.id ? 'Edit employee' : 'Add employee'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">{text('fullName', 'Full name *')}{text('position', 'Position')}{text('department', 'Department')}{text('phone', 'Phone')}</div>
          <div><div className="mb-2 text-sm font-semibold">Monthly pay</div><div className="grid grid-cols-2 gap-3">{amt('baseSalary', 'Basic salary *')}{amt('housingAllowance', 'Housing allowance')}{amt('transportAllowance', 'Transport allowance')}{amt('otherAllowances', 'Other allowances', 'Taxed, but not pensionable unless Settings say so')}</div></div>
          <div><div className="mb-2 text-sm font-semibold">Tax reliefs</div><div className="grid grid-cols-2 gap-3">{amt('annualRent', 'Rent paid per year', 'Gives rent relief')}{amt('otherAnnualReliefs', 'Other yearly reliefs', 'e.g. health or life insurance the accountant allows')}</div><div className="mt-2">{check('rentProofOnFile', 'Rent receipt or tenancy agreement is on file')}</div></div>
          <div><div className="mb-2 text-sm font-semibold">Contributions</div><div className="space-y-2">{check('pensionEnrolled', 'Contributes to pension')}{check('nhfEnrolled', 'Contributes to the National Housing Fund')}</div><div className="mt-2 grid grid-cols-2 gap-3">{text('pfaName', 'Pension company (PFA)')}{text('rsaPin', 'RSA PIN')}{text('tin', 'Tax ID (TIN)')}{text('stateOfResidence', 'State of residence', 'PAYE goes to this state')}{text('bankName', 'Bank')}{text('accountNumber', 'Account number')}</div></div>
          {f.id && check('isActive', 'Still works here (untick when they leave)')}
          <Button disabled={!f.fullName || f.baseSalary === '' || save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────── Settings ─────────
function Settings() {
  const { data } = useGet<any>('/finance/payroll/config');
  if (!data) return null;
  return <SettingsForm key={JSON.stringify(data)} init={data} />;
}
function SettingsForm({ init }: { init: any }) {
  const [c, setC] = useState<any>(init);
  const set = (k: string, v: unknown) => setC({ ...c, [k]: v });
  const num = (k: string, label: string, hint?: string) => <Field label={label} hint={hint}><Input inputMode="decimal" value={c[k]} onChange={(e) => set(k, e.target.value)} /></Field>;
  const save = useAction(() => api.put('/finance/payroll/config', { ...c, employeePensionPct: Number(c.employeePensionPct), employerPensionPct: Number(c.employerPensionPct), nhfPct: Number(c.nhfPct), nsitfPct: Number(c.nsitfPct), itfPct: Number(c.itfPct), rentReliefPct: Number(c.rentReliefPct), rentReliefCap: Number(c.rentReliefCap), bands: c.bands.map((b: any) => ({ upTo: b.upTo === null || b.upTo === '' ? null : Number(b.upTo), rate: Number(b.rate) })) }), { success: 'Settings saved. They apply to payroll runs created from now on.', invalidate: KEYS });
  return (
    <div className="max-w-3xl space-y-4">
      <Card className="p-4"><div className="mb-3 font-semibold">Contributions</div>
        <div className="grid grid-cols-2 gap-3">{num('employeePensionPct', 'Employee pension %')}{num('employerPensionPct', 'Employer pension %')}{num('nhfPct', 'NHF % (of basic salary)')}
          <Field label="Pension is worked out on"><NativeSelect value={c.pensionBase} onChange={(e) => set('pensionBase', e.target.value)}><option value="BHT">Basic + housing + transport</option><option value="GROSS">All regular pay</option></NativeSelect></Field></div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.nsitfEnabled} onChange={(e) => set('nsitfEnabled', e.target.checked)} />Pay NSITF (employer)</label>{num('nsitfPct', 'NSITF %')}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.itfEnabled} onChange={(e) => set('itfEnabled', e.target.checked)} />Pay ITF (employer)</label>{num('itfPct', 'ITF %')}</div></Card>
      <Card className="p-4"><div className="mb-3 font-semibold">Rent relief</div>
        <div className="grid grid-cols-2 gap-3">{num('rentReliefPct', 'Relief % of rent paid')}{num('rentReliefCap', 'Most relief per year (₦)')}</div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={c.requireRentProof} onChange={(e) => set('requireRentProof', e.target.checked)} />Only give relief when proof of rent is on file</label></Card>
      <Card className="p-4"><div className="mb-1 font-semibold">Yearly tax bands (PAYE)</div><p className="mb-3 text-xs text-muted-foreground">Each row is taxed at its rate up to the amount shown. Leave the last row's limit empty. The starting values follow the Nigeria Tax Act 2025 (from January 2026); change them if the law changes.</p>
        {c.bands.map((b: any, i: number) => (
          <div key={i} className="mb-2 grid grid-cols-[1fr_100px_auto] items-end gap-2">
            <Field label={i === 0 ? 'Up to (₦ a year)' : ''}><Input inputMode="decimal" placeholder={i === c.bands.length - 1 ? 'No limit' : ''} value={b.upTo ?? ''} onChange={(e) => set('bands', c.bands.map((x: any, k: number) => (k === i ? { ...x, upTo: e.target.value === '' ? null : e.target.value } : x)))} /></Field>
            <Field label={i === 0 ? 'Rate %' : ''}><Input inputMode="decimal" value={b.rate} onChange={(e) => set('bands', c.bands.map((x: any, k: number) => (k === i ? { ...x, rate: e.target.value } : x)))} /></Field>
            <Button size="sm" variant="outline" disabled={c.bands.length < 2} onClick={() => set('bands', c.bands.filter((_: any, k: number) => k !== i))}>×</Button>
          </div>))}
        <Button size="sm" variant="outline" onClick={() => set('bands', [...c.bands.slice(0, -1), { upTo: '', rate: 0 }, c.bands[c.bands.length - 1]])}>+ Add band</Button></Card>
      <Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save settings</Button>
    </div>
  );
}
