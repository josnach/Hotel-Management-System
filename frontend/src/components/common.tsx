import { type ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export const PageHeader = ({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1>{subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}</div>
    <div className="no-print flex items-center gap-2">{children}</div>
  </div>
);

export const PrintButton = ({ label = 'Print' }: { label?: string }) => (
  <Button variant="dark" onClick={() => window.print()}><Printer className="h-4 w-4" /> {label}</Button>
);

const tones = {
  blue: 'bg-blue-50 text-blue-700 border-blue-100', green: 'bg-green-50 text-green-700 border-green-100', purple: 'bg-purple-50 text-purple-700 border-purple-100',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100', red: 'bg-red-50 text-red-700 border-red-100', white: 'bg-white text-slate-900', orange: 'bg-orange-50 text-orange-700 border-orange-100',
};
/** Pastel KPI tile used all over the original UI. */
export const Stat = ({ label, value, sub, tone = 'white', className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: keyof typeof tones; className?: string }) => (
  <div className={cn('rounded-lg border p-4', tones[tone], className)}>
    <div className="text-xs font-medium opacity-80">{label}</div>
    <div className="mt-1 text-2xl font-bold">{value}</div>
    {sub && <div className="mt-0.5 text-xs opacity-70">{sub}</div>}
  </div>
);

export const Field = ({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) => (
  <div className={cn('space-y-1.5', className)}><Label>{label}</Label>{children}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
);

export const FilterBar = ({ children }: { children: ReactNode }) => <Card className="mb-4 p-4"><div className="grid gap-3 md:grid-cols-4">{children}</div></Card>;

export const Empty = ({ children = 'Nothing to show yet' }: { children?: ReactNode }) => <div className="py-10 text-center text-sm text-muted-foreground">{children}</div>;
export const Loading = () => <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>;
export const ErrorBox = ({ error }: { error: unknown }) => <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{(error as Error)?.message ?? 'Something went wrong'}</div>;
