import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Building2, CalendarCheck, CalendarPlus, CheckCircle2, Eye, Mail, Phone, Plus, User, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { ErrorBox, Loading } from '@/components/common';
import { Card, DataTable, FieldBox, PageTitle, ReportPage, Td, dShort, inputCls } from '@/components/reports/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BorderStat, CLIENT_TYPES, EVENT_STATUS, FormBtn, FormPage, InfoBox, LinkBtn, Req, SectionTitle, eventWhen, textareaCls } from '@/components/events/ui';

interface Client {
  id: string; name: string; type: string; taxId: string | null; contactPerson: string | null; phone: string | null; email: string | null;
  isActive: boolean; createdAt: string; totalEvents: number; activeEvents: number;
}
interface Resp { clients: Client[]; summary: { totalClients: number; corporateClients: number; activeEvents: number } }

const TYPE_ICON: Record<string, LucideIcon> = { CORPORATE: Building2, INDIVIDUAL: User, ORGANIZATION: Users };
const typeLabel = (v: string) => CLIENT_TYPES.find(([k]) => k === v)?.[1] ?? v;
const bubble = 'inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-700';

export function EventClients() {
  const q = useGet<Resp>('/events/clients');
  const [type, setType] = useState('');
  const [viewId, setViewId] = useState<string | null>(null);
  const rows = (q.data?.clients ?? []).filter((c) => !type || c.type === type);
  const s = q.data?.summary;

  const INFO: { title: string; text: string; icon: LucideIcon; box: string; head: string; body: string }[] = [
    { title: 'Corporate Clients', text: 'Businesses and companies booking events like conferences, meetings, and corporate parties.', icon: Building2, box: 'border-[#dee9fb] bg-[#f2f6ff]', head: 'text-blue-800', body: 'text-blue-700' },
    { title: 'Individual Clients', text: 'Individuals booking personal events like weddings, birthday parties, and family gatherings.', icon: User, box: 'border-[#d9f3df] bg-[#f1fef4]', head: 'text-green-800', body: 'text-green-700' },
    { title: 'Organizations', text: 'Non-profits, clubs, and organizations booking events like seminars, fundraisers, and social events.', icon: Users, box: 'border-[#f3e7fd] bg-[#faf4ff]', head: 'text-purple-800', body: 'text-purple-700' },
  ];
  const ACTIONS: { label: string; to: string; tone: 'blue' | 'green' | 'purple' | 'orange'; icon: LucideIcon }[] = [
    { label: 'Add Client', to: '/events/clients/new', tone: 'blue', icon: UserPlus },
    { label: 'Create Booking', to: '/events/bookings/new', tone: 'green', icon: CalendarPlus },
    { label: 'Manage Facilities', to: '/events/facilities', tone: 'purple', icon: Building2 },
    { label: 'View Reports', to: '/events/reports', tone: 'orange', icon: BarChart3 },
  ];

  return (
    <ReportPage wide>
      <PageTitle title="Event Clients">
        <LinkBtn to="/events/clients/new" tone="blue"><Plus className="h-4 w-4" /> New Client</LinkBtn>
        <LinkBtn to="/events" tone="grey">Back to Events</LinkBtn>
      </PageTitle>
      {q.error && <ErrorBox error={q.error} />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BorderStat label="Total Clients" value={s?.totalClients ?? 0} border="border-[#4280ef]" circle="bg-blue-100 text-blue-600" icon={Users} />
        <BorderStat label="Corporate Clients" value={s?.corporateClients ?? 0} border="border-[#3bcc67]" circle="bg-green-100 text-green-600" icon={Building2} />
        <BorderStat label="Active Events" value={s?.activeEvents ?? 0} border="border-[#9e42eb]" circle="bg-purple-100 text-purple-600" icon={CalendarCheck} />
        <Card className="p-4">
          <FieldBox label="Filter by Type">
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All Client Types</option>
              {CLIENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FieldBox>
        </Card>
      </div>

      <Card className="overflow-hidden">
        {q.isLoading ? <Loading /> : (
          <DataTable cols={[{ label: 'Client Information' }, { label: 'Contact Details' }, { label: 'Client Type' }, { label: 'Total Events' }, { label: 'Active Events' }, { label: 'Status' }, { label: 'Actions' }]}>
            {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No clients found</td></tr>}
            {rows.map((c) => {
              const Icon = TYPE_ICON[c.type] ?? Building2;
              return (
                <tr key={c.id}>
                  <Td><div className="font-semibold">{c.name}</div><div className="text-xs text-slate-500">Created: {dShort(c.createdAt)}</div></Td>
                  <Td>
                    <div className="font-semibold">{c.contactPerson ?? '—'}</div>
                    {c.email && <div className="flex items-center gap-1.5 text-slate-600"><Mail className="h-3.5 w-3.5 text-slate-400" />{c.email}</div>}
                    {c.phone && <div className="flex items-center gap-1.5 text-slate-600"><Phone className="h-3.5 w-3.5 text-slate-400" />{c.phone}</div>}
                  </Td>
                  <Td><span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800"><Icon className="h-3.5 w-3.5" />{typeLabel(c.type)}</span></Td>
                  <Td><span className={bubble}>{c.totalEvents}</span></Td>
                  <Td><span className={bubble}>{c.activeEvents}</span></Td>
                  <Td><span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', c.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600')}><CheckCircle2 className="h-3.5 w-3.5" />{c.isActive ? 'Active' : 'Inactive'}</span></Td>
                  <Td>
                    <div className="flex gap-2">
                      <FormBtn tone="blue" className="h-8 px-3 text-xs" onClick={() => setViewId(c.id)}><Eye className="h-3.5 w-3.5" /> View</FormBtn>
                      <LinkBtn to={`/events/bookings/new?client=${c.id}`} tone="green" className="h-8 px-3 text-xs"><Plus className="h-3.5 w-3.5" /> Book Event</LinkBtn>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {INFO.map(({ title, text, icon: Icon, box, head, body }) => (
          <div key={title} className={cn('flex gap-3 rounded-lg border p-5', box)}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/70"><Icon className={cn('h-5 w-5', head)} /></span>
            <div><div className={cn('text-lg font-semibold', head)}>{title}</div><p className={cn('mt-1 text-sm', body)}>{text}</p></div>
          </div>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {ACTIONS.map(({ label, to, tone, icon: Icon }) => (
            <LinkBtn key={to} to={to} tone={tone} className="h-20 flex-col gap-1.5 text-base font-semibold"><Icon className="h-5 w-5" />{label}</LinkBtn>
          ))}
        </div>
      </Card>

      {viewId && <ClientDialog id={viewId} onClose={() => setViewId(null)} />}
    </ReportPage>
  );
}

/* The video never opens "View", so this dialog (details + booking history) is my own design. */
function ClientDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useGet<{ client: any }>(`/events/clients/${id}`);
  const c = q.data?.client;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{c?.name ?? 'Client'}</DialogTitle></DialogHeader>
        {!c ? <Loading /> : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><div className="text-slate-500">Type</div>{typeLabel(c.type)}</div>
              <div><div className="text-slate-500">Tax ID</div>{c.taxId ?? '—'}</div>
              <div><div className="text-slate-500">Contact</div>{c.contactPerson ?? '—'}</div>
              <div><div className="text-slate-500">Phone</div>{c.phone ?? '—'}</div>
              <div className="col-span-2"><div className="text-slate-500">Email</div>{c.email ?? '—'}</div>
              {c.address && <div className="col-span-2"><div className="text-slate-500">Address</div>{c.address}</div>}
              {c.notes && <div className="col-span-2"><div className="text-slate-500">Notes</div>{c.notes}</div>}
            </div>
            <div className="font-semibold">Bookings ({c.bookings.length})</div>
            {c.bookings.length === 0 ? <p className="text-slate-500">No bookings yet.</p> : (
              <ul className="max-h-48 divide-y overflow-auto rounded border">
                {c.bookings.map((b: any) => (
                  <li key={b.id} className="flex items-center justify-between px-3 py-2">
                    <Link to={`/events/bookings/${b.id}`} className="font-medium text-blue-600 hover:underline">{b.title}</Link>
                    <span className="text-xs text-slate-500">{eventWhen(b.startsAt, b.endsAt)} · {EVENT_STATUS[b.status]?.label ?? b.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ───────── Create Event Client ───────── */
export function EventClientForm() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', type: '', taxId: '', contactPerson: '', email: '', phone: '', address: '', notes: '' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const orNull = (v: string) => v.trim() || null;

  const save = useAction(
    () => api.post('/events/clients', {
      name: f.name.trim(), type: f.type, taxId: orNull(f.taxId), contactPerson: orNull(f.contactPerson),
      email: orNull(f.email), phone: orNull(f.phone), address: orNull(f.address), notes: orNull(f.notes),
    }),
    { success: 'Client created', invalidate: ['/events/clients', '/events/dashboard'], onSuccess: () => nav('/events/clients') },
  );

  const submit = () => {
    const p = f.name.trim().length < 2 ? 'Enter the company or organization name.' : !f.type ? 'Select a client type.' : !f.contactPerson.trim() ? 'Enter the contact person.' : '';
    setError(p);
    if (!p) save.mutate(undefined);
  };

  return (
    <FormPage max="max-w-xl">
      <PageTitle title="Create Event Client"><LinkBtn to="/events/clients" tone="grey">Back to Clients</LinkBtn></PageTitle>
      <Card className="p-6">
        <SectionTitle>Company Information</SectionTitle>
        <FieldBox label={<>Company/Organization Name <Req /></>}><input className={inputCls} placeholder="Enter company or organization name" value={f.name} onChange={set('name')} /></FieldBox>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FieldBox label={<>Client Type <Req /></>}>
            <select className={inputCls} value={f.type} onChange={set('type')}>
              <option value="">Select Client Type</option>
              {CLIENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FieldBox>
          <FieldBox label="Tax ID/Business Number"><input className={inputCls} placeholder="Tax identification number" value={f.taxId} onChange={set('taxId')} /></FieldBox>
        </div>

        <SectionTitle>Contact Information</SectionTitle>
        <FieldBox label={<>Contact Person <Req /></>}><input className={inputCls} placeholder="Full name of contact person" value={f.contactPerson} onChange={set('contactPerson')} /></FieldBox>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FieldBox label="Email Address"><input type="email" className={inputCls} placeholder="contact@company.com" value={f.email} onChange={set('email')} /></FieldBox>
          <FieldBox label="Phone Number"><input className={inputCls} placeholder="+1 (555) 123-4567" value={f.phone} onChange={set('phone')} /></FieldBox>
        </div>
        <div className="mt-4"><FieldBox label="Address"><textarea className={textareaCls} rows={3} placeholder="Full business address" value={f.address} onChange={set('address')} /></FieldBox></div>
        <div className="mt-4"><FieldBox label="Additional Notes"><textarea className={textareaCls} rows={3} placeholder="Any special requirements, preferences, or additional information..." value={f.notes} onChange={set('notes')} /></FieldBox></div>

        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-5">
          <LinkBtn to="/events/clients" tone="grey">Cancel</LinkBtn>
          <FormBtn tone="blue" disabled={save.isPending} onClick={submit}>{save.isPending ? 'Creating…' : 'Create Client'}</FormBtn>
        </div>
      </Card>
      <InfoBox title="About Event Clients">
        <p>Event clients are companies, organizations, or individuals who book hotel facilities for events without requiring room accommodations.</p>
        <p>Examples: Wedding planners, corporate event organizers, conference hosts, party organizers.</p>
      </InfoBox>
    </FormPage>
  );
}