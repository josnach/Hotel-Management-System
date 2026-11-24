import { type ButtonHTMLAttributes, type ReactNode, ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Info, Music, Presentation, TreePine, Users, Utensils, Waves, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dShort, dtShort, tShort } from '@/components/reports/ui';

/* ───────── types ───────── */
export interface BookingRow {
  id: string; title: string; eventType: string; clientName: string; startsAt: string; endsAt: string;
  status: string; total: number | string; paid: number | string; facilities: string[];
}
export interface Facility {
  id: string; name: string; type: string; description: string | null; capacity: number | null;
  baseRate: string | number | null; hourlyRate: string | number | null; halfDayRate: string | number | null; fullDayRate: string | number | null;
  features: string[]; isActive: boolean;
}

/* ───────── lookups ───────── */
export const FACILITY_TYPES: { value: string; label: string; plural: string; icon: LucideIcon; tone: string; desc: string }[] = [
  { value: 'CONFERENCE_HALL', label: 'Conference Hall', plural: 'Conference Halls', icon: Presentation, tone: 'bg-blue-100 text-blue-600', desc: 'Large spaces for conferences, seminars, and corporate events with audio-visual equipment and seating arrangements.' },
  { value: 'SWIMMING_POOL', label: 'Swimming Pool', plural: 'Swimming Pool', icon: Waves, tone: 'bg-cyan-100 text-cyan-600', desc: 'Pool areas for pool parties, swim meets, and outdoor recreational events with changing facilities.' },
  { value: 'RESTAURANT', label: 'Restaurant', plural: 'Restaurant', icon: Utensils, tone: 'bg-orange-100 text-orange-600', desc: 'Dining areas for private parties, banquets, and culinary events with full kitchen access.' },
  { value: 'GARDEN', label: 'Garden', plural: 'Garden', icon: TreePine, tone: 'bg-green-100 text-green-600', desc: 'Outdoor spaces for weddings, garden parties, and outdoor events with natural scenery.' },
  { value: 'BALLROOM', label: 'Ballroom', plural: 'Ballroom', icon: Music, tone: 'bg-purple-100 text-purple-600', desc: 'Elegant spaces for formal events, galas, weddings, and large social gatherings.' },
  { value: 'MEETING_ROOM', label: 'Meeting Room', plural: 'Meeting Rooms', icon: Users, tone: 'bg-indigo-100 text-indigo-600', desc: 'Smaller spaces for business meetings, workshops, and small group events with presentation facilities.' },
  { value: 'OTHER', label: 'Other', plural: 'Other', icon: Building2, tone: 'bg-slate-100 text-slate-600', desc: 'Any other bookable venue or space.' },
];
export const typeInfo = (v: string) => FACILITY_TYPES.find((t) => t.value === v) ?? FACILITY_TYPES[FACILITY_TYPES.length - 1];

export const FEATURE_OPTIONS = ['Wi-Fi', 'Projector', 'Whiteboard', 'Air Conditioning', 'Catering', 'Parking', 'Wheelchair Access', 'Stage', 'Lighting', 'Sound System', 'TV', 'Microphone'];

export const EVENT_TYPES: [string, string][] = [
  ['WEDDING', 'Wedding'], ['CONFERENCE', 'Conference'], ['PARTY', 'Party'], ['BUSINESS_MEETING', 'Business Meeting'],
  ['SEMINAR', 'Seminar'], ['BANQUET', 'Banquet'], ['OTHER', 'Other'],
];
export const eventTypeLabel = (v: string) => EVENT_TYPES.find(([k]) => k === v)?.[1] ?? v;

export const CLIENT_TYPES: [string, string][] = [['CORPORATE', 'Corporate'], ['INDIVIDUAL', 'Individual'], ['ORGANIZATION', 'Organization']];

export const EVENT_STATUS: Record<string, { label: string; tone: 'yellow' | 'amber' | 'green' | 'blue' | 'gray' | 'red' }> = {
  INQUIRY: { label: 'Inquiry', tone: 'yellow' }, QUOTED: { label: 'Quoted', tone: 'amber' }, CONFIRMED: { label: 'Confirmed', tone: 'green' },
  IN_PROGRESS: { label: 'In Progress', tone: 'blue' }, COMPLETED: { label: 'Completed', tone: 'gray' }, CANCELLED: { label: 'Cancelled', tone: 'red' },
};

/* ───────── rates (hourly falls back to the base rate, like the backend) ───────── */
export const hourlyOf = (f: Facility): number | null =>
  f.hourlyRate != null ? Number(f.hourlyRate) : f.baseRate != null ? Number(f.baseRate) : null;
export const dailyOf = (f: Facility): number | null => (f.fullDayRate != null ? Number(f.fullDayRate) : null);

export const eventWhen = (start: string, end: string) =>
  dShort(start) === dShort(end) ? `${dShort(start)} ${tShort(start)} - ${tShort(end)}` : `${dtShort(start)} → ${dtShort(end)}`;

/* ───────── look & feel ───────── */
export const textareaCls =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
export const Req = () => <span className="text-red-500">*</span>;

const TONE = {
  blue: 'bg-blue-600 hover:bg-blue-700', green: 'bg-[#22b84c] hover:brightness-95', grey: 'bg-[#6a727d] hover:brightness-95',
  purple: 'bg-[#8d1de5] hover:brightness-95', orange: 'bg-[#dd4f11] hover:brightness-95', red: 'bg-red-600 hover:bg-red-700',
} as const;
export type BtnTone = keyof typeof TONE;

export function LinkBtn({ to, tone, children, className }: { to: string; tone: BtnTone; children: ReactNode; className?: string }) {
  return <Link to={to} className={cn('inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-white', TONE[tone], className)}>{children}</Link>;
}
export function FormBtn({ tone = 'blue', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: BtnTone }) {
  return <button type="button" {...p} className={cn('inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-white disabled:opacity-60', TONE[tone], className)} />;
}

export const FormPage = ({ max = 'max-w-3xl', children }: { max?: string; children: ReactNode }) => (
  <div className={cn('mx-auto space-y-5', max)}>{children}</div>
);

export const SectionTitle = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="mb-3 mt-7 flex items-center justify-between first:mt-0">
    <h2 className="text-base font-semibold text-slate-900">{children}</h2>
    {right}
  </div>
);

export function BorderStat({ label, value, border, circle, icon: Icon }: { label: string; value: ReactNode; border: string; circle: string; icon: ComponentType<{ className?: string }> }) {
  return (
    <div className={cn('flex items-center justify-between rounded-lg border-l-4 bg-white p-5 shadow-md', border)}>
      <div>
        <div className="text-sm text-slate-700">{label}</div>
        <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      </div>
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', circle)}><Icon className="h-5 w-5" /></div>
    </div>
  );
}

export function InfoBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#dee9fb] bg-[#f2f6ff] p-4 text-sm text-blue-800">
      <div className="mb-1 flex items-center gap-2 font-semibold"><Info className="h-4 w-4 text-blue-500" /> {title}</div>
      <div className="space-y-1.5 pl-6">{children}</div>
    </div>
  );
}

export const ActivePill = ({ active }: { active: boolean }) => (
  <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium', active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600')}>
    <span className={cn('h-2 w-2 rounded-full', active ? 'bg-green-600' : 'bg-slate-400')} />{active ? 'Active' : 'Inactive'}
  </span>
);