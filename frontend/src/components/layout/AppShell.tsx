import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Clock3,
  Building2,
  ChevronDown,
  ChevronUp,
  DoorOpen,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Store,
  UserCircle,
  Users,
} from 'lucide-react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { canAccessPath, filterNavigation } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useGet } from '@/lib/hooks';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { NAV, isGroup, type NavSection } from './nav';

const trigger =
  'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white/90 outline-none hover:bg-white/10 data-[state=open]:bg-white/15';

type SalesPointLink = { id: string; name: string };

function SectionMenu({
  section,
  unpaid,
  salesPoints,
}: {
  section: NavSection;
  unpaid: number;
  salesPoints: SalesPointLink[];
}) {
  const nav = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const [spOpen, setSpOpen] = useState(false);
  const Icon = section.icon;

  return (
    <DropdownMenu
      onOpenChange={(o) => {
        if (!o) {
          setOpen(null);
          setSpOpen(false);
        }
      }}
    >
      <DropdownMenuTrigger className={trigger}>
        <Icon className="h-4 w-4" />
        {section.label}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-64">
        {section.items.map((it) =>
          isGroup(it) ? (
            <div key={it.label}>
              <DropdownMenuItem
                className="justify-between font-medium"
                onSelect={(e) => {
                  e.preventDefault();
                  setOpen(open === it.label ? null : it.label);
                }}
              >
                {it.label}
                {open === it.label ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </DropdownMenuItem>

              {open === it.label &&
                it.children.map((c) => (
                  <DropdownMenuItem
                    key={c.to}
                    className="pl-7 text-slate-600"
                    onSelect={() => nav(c.to)}
                  >
                    {c.label}
                  </DropdownMenuItem>
                ))}
            </div>
          ) : it.to === '/sales-points' ? (
            /* Sales Points: label opens the management page, chevron opens the list. */
            <div key={it.to}>
              <div className="flex items-center">
                <DropdownMenuItem
                  className="flex-1 gap-2 font-medium"
                  onSelect={() => nav('/sales-points')}
                >
                  <Store className="h-4 w-4" />
                  {it.label}
                </DropdownMenuItem>

                <button
                  type="button"
                  aria-label={spOpen ? 'Hide sales points' : 'Show sales points'}
                  aria-expanded={spOpen}
                  className="mr-1 rounded p-2 text-slate-600 hover:bg-accent"
                  onClick={() => setSpOpen((v) => !v)}
                >
                  {spOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>

              {spOpen &&
                salesPoints.map((sp) => (
                  <DropdownMenuItem
                    key={sp.id}
                    className="gap-2 pl-7 text-slate-600"
                    onSelect={() => nav(`/pos?salesPoint=${sp.id}`)}
                  >
                    <Store className="h-3.5 w-3.5" />
                    {sp.name}
                  </DropdownMenuItem>
                ))}
            </div>
          ) : (
            <DropdownMenuItem
              key={it.to}
              className="justify-between font-medium"
              onSelect={() => nav(it.to)}
            >
              {it.label}

              {it.badge === 'unpaid' && unpaid > 0 && (
                <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                  {unpaid}
                </span>
              )}
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
  const role = user?.role;

  // Only roles with an approved front-desk workflow see next checkout.
  const canViewNextCheckout = canAccessPath(role, '/next-checkout');

  // Unpaid bills are relevant to POS staff and management/accounting.
  const canViewUnpaidBills = [
    'ADMIN',
    'MANAGER',
    'WAITER',
  ].includes(role ?? '');

  // The current dashboard notification endpoint aggregates sensitive
  // information across finance, inventory and hotel operations.
  // Until it has role-specific responses, restrict it to management.
  const canViewDashboardNotifications = [
    'ADMIN',
    'MANAGER',
  ].includes(role ?? '');

  const { data: due } = useQuery({
    queryKey: ['due-count'],
    queryFn: () => api.get('/stays/due-count'),
    refetchInterval: 60_000,
    enabled: canViewNextCheckout,
  });

  const { data: unpaid } = useQuery({
    queryKey: ['unpaid-count'],
    queryFn: () => api.get('/orders/unpaid-count'),
    refetchInterval: 60_000,
    enabled: canViewUnpaidBills,
  });

  const { data: notes } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/dashboard/notifications'),
    refetchInterval: 60_000,
    enabled: canViewDashboardNotifications,
  });

    // Active sales points for the Sales & Retail menu (same endpoint POS uses).
  const canViewSalesPoints = ['ADMIN', 'MANAGER', 'WAITER'].includes(role ?? '');
  const { data: salesPoints } = useGet<SalesPointLink[]>('/sales-points', {}, canViewSalesPoints);

  // Filter both sections and their nested links using the same
  // permissions used by Protected() in App.tsx.
  const visibleSections = NAV
    .filter((section) => !section.roles || section.roles.includes(role ?? ''))
    .map((section) => ({
      ...section,
      items: filterNavigation(section.items, role),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40">
        <div className="flex items-center gap-2 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-800 px-4 py-1.5 shadow">
          <Link
            to="/"
            className="mr-3 flex items-center gap-2 text-white"
          >
            <Building2 className="h-6 w-6" />
            <span className="text-sm font-bold leading-tight">
              Koraf
              <br />
              Hotels
            </span>
          </Link>

          {canViewNextCheckout && (
            <Link
              to="/next-checkout"
              className={cn(trigger, 'bg-white/10')}
            >
              <DoorOpen className="h-4 w-4" />
              Next Checkout

              {!!due?.count && (
                <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {due.count}
                </span>
              )}
            </Link>
          )}
          {['RECEPTIONIST', 'WAITER'].includes(role ?? '') && (
  <Link
    to="/my-shift"
    className={cn(trigger, 'bg-white/10')}
  >
    <Clock3 className="h-4 w-4" />
    My Shift
  </Link>
)}

                   {visibleSections.map((section) => (
            <SectionMenu
              key={section.label}
              section={section}
              unpaid={unpaid?.count ?? 0}
              salesPoints={salesPoints ?? []}
            />
          ))}

          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger className={trigger}>
                <UserCircle className="h-5 w-5" />

                <span className="text-left text-xs leading-tight">
                  Welcome,
                  <br />
                  {user?.fullName ?? user?.username}
                </span>

                <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-sm">
                  <div className="font-semibold">
                    {user?.fullName ?? user?.username}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {user?.username}
                    <br />
                    {user?.email}
                  </div>
                </div>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onSelect={() => nav('/change-password')}
                >
                  <KeyRound className="h-4 w-4" />
                  Change Password
                </DropdownMenuItem>

                <DropdownMenuItem
                  onSelect={() => nav('/security')}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Security &amp; Devices
                </DropdownMenuItem>

                {user?.role === 'ADMIN' && (
                  <DropdownMenuItem onSelect={() => nav('/users')}>
                    <Users className="h-4 w-4" />
                    Users
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem onSelect={() => nav('/')}>
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="text-red-600"
                  onSelect={logout}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {canViewDashboardNotifications && (
          <div className="flex items-center justify-between bg-blue-600 px-4 py-1 text-xs text-white">
            <div
              className="relative flex items-center gap-1"
              title={`${notes?.overdueCheckouts ?? 0} overdue checkouts, ${notes?.unpaidBills ?? 0} unpaid bills, ${notes?.lowStock ?? 0} low stock${notes?.guardHigh ? `, ${notes.guardHigh} high-risk Revenue Guard flags` : ''}`}
            >
              <Bell className="h-4 w-4" />

              {!!notes?.total && (
                <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold">
                  {notes.total > 9 ? '9+' : notes.total}
                </span>
              )}
            </div>

            <span className="opacity-90">
              Last updated: Just now
            </span>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1500px] p-6">
        <Outlet />
      </main>
    </div>
  );
}