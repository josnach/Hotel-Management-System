import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Building2, ChevronDown, ChevronUp, DoorOpen, KeyRound, LayoutDashboard, LogOut, ShieldCheck, UserCircle, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NAV, isGroup, type NavSection } from './nav';

const trigger = 'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white/90 outline-none hover:bg-white/10 data-[state=open]:bg-white/15';

function SectionMenu({ section, unpaid }: { section: NavSection; unpaid: number }) {
  const nav = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const Icon = section.icon;
  return (
    <DropdownMenu onOpenChange={(o) => !o && setOpen(null)}>
      <DropdownMenuTrigger className={trigger}>
        <Icon className="h-4 w-4" /> {section.label} <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        {section.items.map((it) =>
          isGroup(it) ? (
            <div key={it.label}>
              <DropdownMenuItem className="justify-between font-medium" onSelect={(e) => { e.preventDefault(); setOpen(open === it.label ? null : it.label); }}>
                {it.label} {open === it.label ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </DropdownMenuItem>
              {open === it.label && it.children.map((c) => (
                <DropdownMenuItem key={c.to} className="pl-7 text-slate-600" onSelect={() => nav(c.to)}>{c.label}</DropdownMenuItem>
              ))}
            </div>
          ) : (
            <DropdownMenuItem key={it.to} className="justify-between font-medium" onSelect={() => nav(it.to)}>
              {it.label}
              {it.badge === 'unpaid' && unpaid > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unpaid}</span>}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const { data: due } = useQuery({ queryKey: ['due-count'], queryFn: () => api.get('/stays/due-count'), refetchInterval: 60_000 });
  const { data: unpaid } = useQuery({ queryKey: ['unpaid-count'], queryFn: () => api.get('/orders/unpaid-count'), refetchInterval: 60_000 });
  const { data: notes } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get('/dashboard/notifications'), refetchInterval: 60_000 });

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40">
        <div className="flex items-center gap-2 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-800 px-4 py-1.5 shadow">
          <Link to="/" className="mr-3 flex items-center gap-2 text-white"><Building2 className="h-6 w-6" /><span className="text-sm font-bold leading-tight">Koraf<br />Hotels</span></Link>
          <Link to="/next-checkout" className={cn(trigger, 'bg-white/10')}>
            <DoorOpen className="h-4 w-4" /> Next Checkout
            {!!due?.count && <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{due.count}</span>}
          </Link>
          {NAV.filter((s) => !s.roles || s.roles.includes(user?.role ?? '')).map((s) => <SectionMenu key={s.label} section={s} unpaid={unpaid?.count ?? 0} />)}
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger className={trigger}>
                <UserCircle className="h-5 w-5" /><span className="text-left text-xs leading-tight">Welcome,<br />{user?.fullName ?? user?.username}</span><ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-sm"><div className="font-semibold">{user?.fullName ?? user?.username}</div><div className="text-xs text-muted-foreground">{user?.username}<br />{user?.email}</div></div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => nav('/change-password')}><KeyRound className="h-4 w-4" /> Change Password</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => nav('/security')}><ShieldCheck className="h-4 w-4" /> Security &amp; Devices</DropdownMenuItem>
                {user?.role === 'ADMIN' && <DropdownMenuItem onSelect={() => nav('/users')}><Users className="h-4 w-4" /> Users</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => nav('/')}><LayoutDashboard className="h-4 w-4" /> Dashboard</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600" onSelect={logout}><LogOut className="h-4 w-4" /> Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex items-center justify-between bg-blue-600 px-4 py-1 text-xs text-white">
          <div className="relative flex items-center gap-1" title={`${notes?.overdueCheckouts ?? 0} overdue checkouts, ${notes?.unpaidBills ?? 0} unpaid bills, ${notes?.lowStock ?? 0} low stock${notes?.guardHigh ? `, ${notes.guardHigh} high-risk Revenue Guard flags` : ''}`}>
            <Bell className="h-4 w-4" />
            {!!notes?.total && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold">{notes.total > 9 ? '9+' : notes.total}</span>}
          </div>
          <span className="opacity-90">Last updated: Just now</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] p-6"><Outlet /></main>
    </div>
  );
}
