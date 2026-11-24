import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, CalendarPlus, CheckCircle2, Clock, Edit, Eye, Building2, Plus, Tag, Umbrella, Users, ArrowLeft, Banknote, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { ErrorBox, Loading } from '@/components/common';
import { Card, FieldBox, PageTitle, ReportPage, inputCls, naira } from '@/components/reports/ui';
import {
  ActivePill, BorderStat, FACILITY_TYPES, FEATURE_OPTIONS, FormBtn, FormPage, InfoBox, LinkBtn, Req, SectionTitle,
  dailyOf, hourlyOf, textareaCls, typeInfo, type Facility,
} from '@/components/events/ui';

const useCanManage = () => ['ADMIN', 'MANAGER'].includes(useAuth().user?.role ?? '');

function Row({ icon: Icon, label, value, green }: { icon: LucideIcon; label: string; value: string; green?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-slate-600"><Icon className="h-4 w-4 text-slate-500" />{label}</span>
      <span className={green ? 'font-bold text-green-600' : 'font-bold text-slate-900'}>{value}</span>
    </div>
  );
}

function FacilityCard({ f, canEdit }: { f: Facility; canEdit: boolean }) {
  const t = typeInfo(f.type);
  const Icon = t.icon;
  const hourly = hourlyOf(f), daily = dailyOf(f), features = f.features ?? [];
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-md">
      <div className="flex h-[134px] items-center justify-center bg-gradient-to-br from-blue-500 to-blue-600 text-white"><Icon className="h-10 w-10" /></div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-2"><h3 className="text-xl font-bold text-slate-900">{f.name}</h3><ActivePill active={f.isActive} /></div>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800"><Tag className="h-3.5 w-3.5" />{t.label}</span>
        <p className="mt-3 min-h-[24px] text-slate-600">{f.description}</p>
        <div className="mt-3 space-y-2.5 text-sm">
          <Row icon={Users} label="Capacity" value={f.capacity ? `${f.capacity} people` : '—'} />
          <Row icon={Clock} label="Hourly Rate" value={hourly != null ? `${naira(hourly)}/hr` : '—'} green />
          <Row icon={CalendarDays} label="Daily Rate" value={daily != null ? `${naira(daily)}/day` : '—'} green />
        </div>
        {features.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-sm font-semibold text-slate-800">Features:</div>
            <div className="flex flex-wrap gap-1.5">
              {features.slice(0, 3).map((x) => <span key={x} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700">{x}</span>)}
              {features.length > 3 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">+{features.length - 3} more</span>}
            </div>
          </div>
        )}
        <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
          <LinkBtn to={`/events/facilities/${f.id}`} tone="blue" className="h-10 flex-1"><Eye className="h-4 w-4" /> View Details</LinkBtn>
          {canEdit && <LinkBtn to={`/events/facilities/${f.id}/edit`} tone="green" className="h-10 flex-1"><Edit className="h-4 w-4" /> Edit</LinkBtn>}
        </div>
      </div>
    </div>
  );
}

/* ───────── List ───────── */
export function EventFacilities() {
  const canManage = useCanManage();
  const q = useGet<Facility[]>('/events/facilities');
  const list = q.data ?? [];
  const count = (...types: string[]) => list.filter((f) => types.includes(f.type)).length;
  const rates = list.map(hourlyOf).filter((x): x is number => x != null);
  const dist = FACILITY_TYPES.map((t) => ({ label: t.label, n: count(t.value) })).filter((x) => x.n > 0);

  return (
    <ReportPage wide>
      <PageTitle title="Event Facilities">
        <LinkBtn to="/events" tone="grey"><ArrowLeft className="h-4 w-4" /> Back to Events</LinkBtn>
        {canManage && <LinkBtn to="/events/facilities/new" tone="blue"><Plus className="h-4 w-4" /> Add Facility</LinkBtn>}
      </PageTitle>
      {q.error && <ErrorBox error={q.error} />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BorderStat label="Total Facilities" value={list.length} border="border-[#4280ef]" circle="bg-blue-100 text-blue-600" icon={Building2} />
        <BorderStat label="Conference Halls" value={count('CONFERENCE_HALL')} border="border-[#3bcc67]" circle="bg-green-100 text-green-600" icon={FACILITY_TYPES[0].icon} />
        <BorderStat label="Outdoor Venues" value={count('GARDEN', 'SWIMMING_POOL')} border="border-[#9e42eb]" circle="bg-purple-100 text-purple-600" icon={Umbrella} />
        <BorderStat label="Active Facilities" value={list.filter((f) => f.isActive).length} border="border-[#e56b1e]" circle="bg-orange-100 text-orange-600" icon={CheckCircle2} />
      </div>

      {q.isLoading ? <Loading /> : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {list.map((f) => <FacilityCard key={f.id} f={f} canEdit={canManage} />)}
        </div>
      )}

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Facility Types</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {FACILITY_TYPES.filter((t) => t.value !== 'OTHER').map((t) => (
            <div key={t.value} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-md ${t.tone}`}><t.icon className="h-5 w-5" /></span><span className="font-semibold text-slate-900">{t.plural}</span></div>
              <p className="text-sm text-slate-600">{t.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Pricing Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Average Hourly Rate:</span><b className="text-green-600">{rates.length ? naira(rates.reduce((a, b) => a + b, 0) / rates.length) : '—'}</b></div>
            <div className="flex justify-between"><span className="text-slate-600">Highest Capacity:</span><b className="text-blue-600">{Math.max(0, ...list.map((f) => f.capacity ?? 0)) || '—'} people</b></div>
            <div className="flex justify-between"><span className="text-slate-600">Most Expensive:</span><b className="text-purple-600">{rates.length ? `${naira(Math.max(...rates))}/hour` : '—'}</b></div>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Facility Distribution</h2>
          <div className="space-y-2 text-sm">
            {dist.length === 0 && <p className="text-slate-500">No facilities yet</p>}
            {dist.map((d) => <div key={d.label} className="flex justify-between"><span className="text-slate-600">{d.label}:</span><b>{d.n}</b></div>)}
          </div>
        </Card>
      </div>
    </ReportPage>
  );
}

/* ───────── Details ───────── */
export function FacilityDetail() {
  const { id } = useParams();
  const canManage = useCanManage();
  const q = useGet<Facility>(`/events/facilities/${id}`, undefined, Boolean(id));
  const f = q.data;
  if (q.error) return <ReportPage wide><ErrorBox error={q.error} /></ReportPage>;
  if (!f) return <Loading />;
  const t = typeInfo(f.type), Icon = t.icon;
  const base = f.baseRate != null ? Number(f.baseRate) : null, hourly = f.hourlyRate != null ? Number(f.hourlyRate) : null, daily = dailyOf(f);

  return (
    <ReportPage wide>
      <PageTitle title="Facility Details">
        {canManage && <LinkBtn to={`/events/facilities/${f.id}/edit`} tone="green"><Edit className="h-4 w-4" /> Edit Facility</LinkBtn>}
        <LinkBtn to="/events/facilities" tone="grey"><ArrowLeft className="h-4 w-4" /> Back to Facilities</LinkBtn>
      </PageTitle>
      <Card className="overflow-hidden">
        <div className="flex h-3 items-center justify-center bg-[#3b7aeb] text-white"><Icon className="h-4 w-4" /></div>
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_380px]">
          <div>
            <div className="flex items-start justify-between gap-3"><h2 className="text-2xl font-extrabold uppercase text-slate-900">{f.name}</h2><ActivePill active={f.isActive} /></div>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800"><Tag className="h-3.5 w-3.5" />{t.label}</span>
            <h3 className="mb-1 mt-6 text-lg font-semibold">Description</h3>
            <p className="text-slate-600">{f.description || 'No description provided.'}</p>
            <h3 className="mb-2 mt-6 text-lg font-semibold">Features</h3>
            <div className="flex flex-wrap gap-2">
              {(f.features ?? []).length === 0 && <span className="text-sm text-slate-500">No features listed.</span>}
              {(f.features ?? []).map((x) => <span key={x} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"><CheckCircle2 className="h-3.5 w-3.5" />{x}</span>)}
            </div>
          </div>
          <div>
            <div className="rounded-lg bg-[#fafafc] p-5">
              <h3 className="mb-3 text-lg font-semibold">Pricing & Capacity</h3>
              <div className="divide-y divide-slate-200 text-sm">
                <div className="py-2.5"><Row icon={Users} label="Capacity" value={f.capacity ? `${f.capacity} people` : '—'} /></div>
                <div className="py-2.5"><Row icon={Banknote} label="Base Rate" value={base != null ? `${naira(base)}/hr` : '—'} green /></div>
                <div className="py-2.5"><Row icon={Clock} label="Hourly Rate" value={hourly != null ? `${naira(hourly)}/hr` : '—'} green /></div>
                <div className="py-2.5"><Row icon={CalendarDays} label="Daily Rate" value={daily != null ? `${naira(daily)}/day` : '—'} green /></div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {f.isActive && <LinkBtn to={`/events/bookings/new?facility=${f.id}`} tone="blue" className="h-11 w-full"><CalendarPlus className="h-4 w-4" /> Book This Facility</LinkBtn>}
              {canManage && <LinkBtn to={`/events/facilities/${f.id}/edit`} tone="green" className="h-11 w-full"><Edit className="h-4 w-4" /> Edit Facility</LinkBtn>}
            </div>
          </div>
        </div>
      </Card>
    </ReportPage>
  );
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));

/* ───────── Create ───────── */
export function FacilityCreate() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', type: '', capacity: '', description: '', baseRate: '', hourlyRate: '', fullDayRate: '', features: '' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = useAction(
    () => api.post('/events/facilities', {
      name: f.name.trim(), type: f.type, capacity: num(f.capacity), description: f.description.trim() || null,
      baseRate: num(f.baseRate), hourlyRate: num(f.hourlyRate), fullDayRate: num(f.fullDayRate),
      features: f.features.split(',').map((x) => x.trim()).filter(Boolean),
    }),
    { success: 'Facility created', invalidate: ['/events/facilities'], onSuccess: () => nav('/events/facilities') },
  );
  const submit = () => {
    const p = f.name.trim().length < 2 ? 'Enter the facility name.' : !f.type ? 'Select a facility type.' : !(Number(f.capacity) > 0) ? 'Enter the maximum capacity.' : !(Number(f.baseRate) > 0) ? 'Enter the base rate.' : '';
    setError(p);
    if (!p) save.mutate(undefined);
  };

  return (
    <FormPage max="max-w-2xl">
      <PageTitle title="Create New Facility"><LinkBtn to="/events/facilities" tone="grey">Back to Facilities</LinkBtn></PageTitle>
      <Card className="p-6">
        <SectionTitle>Basic Information</SectionTitle>
        <FieldBox label={<>Facility Name <Req /></>}><input className={inputCls} placeholder="e.g., Grand Ballroom, Olympic Pool, Conference Hall A" value={f.name} onChange={set('name')} /></FieldBox>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FieldBox label={<>Facility Type <Req /></>}>
            <select className={inputCls} value={f.type} onChange={set('type')}>
              <option value="">Select Facility Type</option>
              {FACILITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </FieldBox>
          <FieldBox label={<>Capacity <Req /></>}><input type="number" min="1" className={inputCls} placeholder="Maximum number of guests" value={f.capacity} onChange={set('capacity')} /></FieldBox>
        </div>
        <div className="mt-4"><FieldBox label="Description"><textarea className={textareaCls} rows={3} placeholder="Describe the facility, its features, and any special characteristics..." value={f.description} onChange={set('description')} /></FieldBox></div>

        <SectionTitle>Pricing Information</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <div><FieldBox label={<>Base Rate (₦) <Req /></>}><input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={f.baseRate} onChange={set('baseRate')} /></FieldBox><p className="mt-1 text-xs text-slate-500">Standard rate for this facility</p></div>
          <div><FieldBox label="Hourly Rate (₦)"><input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={f.hourlyRate} onChange={set('hourlyRate')} /></FieldBox><p className="mt-1 text-xs text-slate-500">Leave empty to use base rate</p></div>
          <div><FieldBox label="Daily Rate (₦)"><input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={f.fullDayRate} onChange={set('fullDayRate')} /></FieldBox><p className="mt-1 text-xs text-slate-500">Leave empty if daily booking is not offered</p></div>
        </div>
        <div className="mt-4">
          <FieldBox label="Features & Amenities"><textarea className={textareaCls} rows={3} placeholder="Enter features separated by commas, e.g., Audio System, Projector, Air Conditioning, Wi-Fi" value={f.features} onChange={set('features')} /></FieldBox>
          <p className="mt-1 text-xs text-slate-500">Separate multiple features with commas</p>
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <LinkBtn to="/events/facilities" tone="grey">Cancel</LinkBtn>
          <FormBtn tone="blue" disabled={save.isPending} onClick={submit}>{save.isPending ? 'Creating…' : 'Create Facility'}</FormBtn>
        </div>
      </Card>
      <InfoBox title="About Facilities">
        <p>Facilities are venues and spaces that can be booked for events by external clients. Each facility should have:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Clear pricing</b> - Set base, hourly, and daily rates as needed</li>
          <li><b>Accurate capacity</b> - Maximum number of guests the facility can accommodate</li>
          <li><b>Detailed features</b> - List all amenities and equipment available</li>
          <li><b>Proper categorization</b> - Choose the most appropriate facility type</li>
        </ul>
      </InfoBox>
    </FormPage>
  );
}

/* ───────── Edit ───────── */
export function FacilityEdit() {
  const { id } = useParams();
  const q = useGet<Facility>(`/events/facilities/${id}`, undefined, Boolean(id));
  if (q.error) return <ReportPage wide><ErrorBox error={q.error} /></ReportPage>;
  if (!q.data) return <Loading />;
  return <EditForm facility={q.data} />;
}

function EditForm({ facility }: { facility: Facility }) {
  const nav = useNavigate();
  const own = facility.features ?? [];
  const [f, setF] = useState({
    name: facility.name, type: facility.type, capacity: String(facility.capacity ?? ''), description: facility.description ?? '',
    baseRate: facility.baseRate != null ? String(facility.baseRate) : '', hourlyRate: facility.hourlyRate != null ? String(facility.hourlyRate) : '',
    fullDayRate: facility.fullDayRate != null ? String(facility.fullDayRate) : '', isActive: facility.isActive,
    other: own.filter((x) => !FEATURE_OPTIONS.includes(x)).join(', '),
  });
  const [checked, setChecked] = useState<string[]>(own.filter((x) => FEATURE_OPTIONS.includes(x)));
  const [error, setError] = useState('');
  const set = (k: 'name' | 'type' | 'capacity' | 'description' | 'baseRate' | 'hourlyRate' | 'fullDayRate' | 'other') => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = useAction(
    () => api.put(`/events/facilities/${facility.id}`, {
      name: f.name.trim(), type: f.type, capacity: num(f.capacity), description: f.description.trim() || null,
      baseRate: num(f.baseRate), hourlyRate: num(f.hourlyRate), fullDayRate: num(f.fullDayRate), isActive: f.isActive,
      features: [...FEATURE_OPTIONS.filter((x) => checked.includes(x)), ...f.other.split(',').map((x) => x.trim()).filter(Boolean)],
    }),
    { success: 'Facility updated', invalidate: ['/events/facilities'], onSuccess: () => nav(`/events/facilities/${facility.id}`) },
  );
  const submit = () => {
    const p = f.name.trim().length < 2 ? 'Enter the facility name.' : !(Number(f.capacity) > 0) ? 'Enter the capacity.' : !(Number(f.baseRate) > 0) ? 'Enter the base rate.' : '';
    setError(p);
    if (!p) save.mutate(undefined);
  };

  return (
    <ReportPage wide>
      <PageTitle title="Edit Facility">
        <LinkBtn to={`/events/facilities/${facility.id}`} tone="blue"><Eye className="h-4 w-4" /> View Facility</LinkBtn>
        <LinkBtn to="/events/facilities" tone="grey"><ArrowLeft className="h-4 w-4" /> Back to Facilities</LinkBtn>
      </PageTitle>
      <Card className="p-6">
        <FieldBox label={<>Facility Name <Req /></>}><input className={inputCls} value={f.name} onChange={set('name')} /></FieldBox>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FieldBox label={<>Facility Type <Req /></>}>
            <select className={inputCls} value={f.type} onChange={set('type')}>{FACILITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          </FieldBox>
          <FieldBox label={<>Capacity (People) <Req /></>}><input type="number" min="1" className={inputCls} value={f.capacity} onChange={set('capacity')} /></FieldBox>
          <FieldBox label={<>Base Rate (₦ per hour) <Req /></>}><input type="number" min="0" step="0.01" className={inputCls} value={f.baseRate} onChange={set('baseRate')} /></FieldBox>
          <FieldBox label="Hourly Rate (₦)"><input type="number" min="0" step="0.01" className={inputCls} value={f.hourlyRate} onChange={set('hourlyRate')} /></FieldBox>
          <FieldBox label="Daily Rate (₦)"><input type="number" min="0" step="0.01" className={inputCls} value={f.fullDayRate} onChange={set('fullDayRate')} /></FieldBox>
        </div>
        <div className="mt-4"><FieldBox label="Description"><textarea className={textareaCls} rows={4} value={f.description} onChange={set('description')} /></FieldBox></div>

        <div className="mt-5">
          <div className="mb-2 text-sm font-medium text-slate-700">Features</div>
          <div className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_OPTIONS.map((x) => (
              <label key={x} className="flex cursor-pointer items-center gap-2 text-slate-700">
                <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={checked.includes(x)} onChange={(e) => setChecked(e.target.checked ? [...checked, x] : checked.filter((c) => c !== x))} />{x}
              </label>
            ))}
          </div>
          <div className="mt-3"><FieldBox label="Other Features (comma separated)"><input className={inputCls} placeholder="e.g., Chairs, Tables" value={f.other} onChange={set('other')} /></FieldBox></div>
        </div>
        <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />Active
        </label>

        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <LinkBtn to="/events/facilities" tone="grey">Cancel</LinkBtn>
          <FormBtn tone="blue" disabled={save.isPending} onClick={submit}>{save.isPending ? 'Updating…' : 'Update Facility'}</FormBtn>
        </div>
      </Card>
    </ReportPage>
  );
}