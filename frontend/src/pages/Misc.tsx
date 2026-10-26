import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bug,
  ClipboardList,
  FileText,
  Users as UsersIcon,
  Clock,
} from 'lucide-react';

import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { d, dt, money, num } from '@/lib/utils';
import { Field, PageHeader } from '@/components/common';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { ListPage } from './ListPage';

const ROLES = [
  'ADMIN',
  'MANAGER',
  'RECEPTIONIST',
  'HOUSEKEEPING',
  'WAITER',
  'CHEF',
  'ACCOUNTANT',
  'STOREKEEPER',
  'MAINTENANCE',
];

/** Tiny "create by name" form used above simple lists. */
function QuickAdd({
  endpoint,
  label,
  invalidate,
  extra,
}: {
  endpoint: string;
  label: string;
  invalidate: string;
  extra?: Record<string, unknown>;
}) {
  const [name, setName] = useState('');

  const add = useAction(
    () => api.post(endpoint, { name, ...extra }),
    {
      success: `${label} added`,
      invalidate: [invalidate],
      onSuccess: () => setName(''),
    },
  );

  return (
    <div className="flex gap-2">
      <Input
        className="w-56"
        placeholder={`New ${label.toLowerCase()} name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button
        disabled={!name.trim() || add.isPending}
        onClick={() => add.mutate(undefined)}
      >
        Add
      </Button>
    </div>
  );
}

export const SalesPoints = () => (
  <ListPage
    title="Sales Points"
    endpoint="/sales-points"
    actions={
      <QuickAdd
        endpoint="/sales-points"
        label="Sales point"
        invalidate="/sales-points"
      />
    }
    cols={[
      {
        header: 'Name',
        cell: (s: any) => <b>{s.name}</b>,
      },
      {
        header: 'Status',
        cell: (u: any) => (
          <div className="flex gap-1">
            <Badge variant={u.isActive ? 'green' : 'gray'}>
              {u.isActive ? 'Active' : 'Disabled'}
            </Badge>
            {u.twoFactorEnabled && (
              <Badge variant="blue">2FA</Badge>
            )}
          </div>
        ),
      },
    ]}
  />
);

export const Groups = () => (
  <ListPage
    title="Groups"
    subtitle="Corporate and group accounts"
    endpoint="/groups"
    actions={
      <QuickAdd
        endpoint="/groups"
        label="Group"
        invalidate="/groups"
      />
    }
    cols={[
      {
        header: 'Group',
        cell: (g: any) => <b>{g.name}</b>,
      },
      {
        header: 'Contact',
        cell: (g: any) => g.contact ?? '—',
      },
      {
        header: 'Stays',
        cell: (g: any) => g._count.stays,
      },
    ]}
  />
);

export const Categories = () => (
  <ListPage
    title="Inventory Categories"
    endpoint="/inventory/categories"
    actions={
      <QuickAdd
        endpoint="/inventory/categories"
        label="Category"
        invalidate="/inventory/categories"
      />
    }
    cols={[
      {
        header: 'Category',
        cell: (c: any) => <b>{c.name}</b>,
      },
      {
        header: 'Items',
        cell: (c: any) => c._count.items,
      },
    ]}
  />
);

export const Stores = () => (
  <ListPage
    title="Stores"
    endpoint="/stores"
    actions={
      <QuickAdd
        endpoint="/stores"
        label="Store"
        invalidate="/stores"
      />
    }
    cols={[
      {
        header: 'Store',
        cell: (s: any) => <b>{s.name}</b>,
      },
    ]}
  />
);

export const Staff = () => (
  <ListPage
    title="Staff Management"
    subtitle="Employee records used by payroll"
    endpoint="/finance/employees"
    cols={[
      {
        header: 'Name',
        cell: (e: any) => <b>{e.fullName}</b>,
      },
      {
        header: 'Position',
        cell: (e: any) => e.position ?? '—',
      },
      {
        header: 'Department',
        cell: (e: any) => e.department ?? '—',
      },
      {
        header: 'Base salary',
        cell: (e: any) => money(e.baseSalary),
      },
    ]}
  />
);

export const Maintenance = () => {
  const resolve = useAction(
    (id: string) => api.post(`/maintenance/${id}/resolve`),
    {
      success: 'Marked resolved',
      invalidate: ['/maintenance', '/rooms'],
    },
  );

  return (
    <ListPage
      title="Maintenance"
      endpoint="/maintenance"
      cols={[
        {
          header: 'Room',
          cell: (t: any) => t.room?.number ?? '—',
        },
        {
          header: 'Issue',
          cell: (t: any) => (
            <div>
              <b>{t.title}</b>
              <div className="text-xs text-muted-foreground">
                {t.description}
              </div>
            </div>
          ),
        },
        {
          header: 'Status',
          cell: (t: any) => (
            <Badge
              variant={statusVariant(
                t.status === 'RESOLVED' ? 'COMPLETED' : 'PENDING',
              )}
            >
              {t.status}
            </Badge>
          ),
        },
        {
          header: 'Opened',
          cell: (t: any) => d(t.createdAt),
        },
        {
          header: 'Actions',
          cell: (t: any) =>
            t.status !== 'RESOLVED' && (
              <Button
                size="sm"
                variant="success"
                onClick={() => resolve.mutate(t.id)}
              >
                Resolve
              </Button>
            ),
        },
      ]}
    />
  );
};

export const StockReturns = () => (
  <ListPage
    title="Stock Returns"
    endpoint="/stores/returns"
    empty="No stock returns yet"
    cols={[
      {
        header: 'Return #',
        cell: (r: any) => r.returnNo,
      },
      {
        header: 'Item',
        cell: (r: any) => r.item.name,
      },
      {
        header: 'Sales point',
        cell: (r: any) => r.salesPoint.name,
      },
      {
        header: 'Quantity',
        cell: (r: any) => num(r.quantity, 0),
      },
      {
        header: 'Amount',
        cell: (r: any) => money(r.amount),
      },
      {
        header: 'Disposition',
        cell: (r: any) => r.disposition,
      },
      {
        header: 'Status',
        cell: (r: any) => (
          <Badge variant={statusVariant(r.status)}>
            {r.status}
          </Badge>
        ),
      },
      {
        header: 'Date',
        cell: (r: any) => d(r.createdAt),
      },
    ]}
  />
);

export const StockIssues = () => (
  <ListPage
    title="Stock Issues"
    subtitle="Issued from store to sales points"
    endpoint="/stores/issues"
    empty="No issues yet"
    cols={[
      {
        header: 'Date',
        cell: (r: any) => dt(r.createdAt),
      },
      {
        header: 'Item',
        cell: (r: any) => r.itemId,
      },
      {
        header: 'Quantity',
        cell: (r: any) => num(r.quantity, 0),
      },
    ]}
  />
);

export const StockTransfers = () => (
  <ListPage
    title="Stock Transfers"
    endpoint="/stores/transfers"
    empty="No transfers yet"
    cols={[
      {
        header: 'Date',
        cell: (r: any) => dt(r.createdAt),
      },
      {
        header: 'From',
        cell: (r: any) => r.from.name,
      },
      {
        header: 'To',
        cell: (r: any) => r.to.name,
      },
      {
        header: 'Quantity',
        cell: (r: any) => num(r.quantity, 0),
      },
    ]}
  />
);

export const AutoExtensionLogs = () => (
  <ListPage
    title="Auto Extension Logs"
    endpoint="/stays/auto-extension/logs"
    empty="No auto extension activity has been recorded yet."
    actions={
      <Button variant="outline" asChild>
        <Link to="/stats/auto-extension">View Statistics</Link>
      </Button>
    }
    cols={[
      {
        header: 'Time',
        cell: (l: any) => dt(l.createdAt),
      },
      {
        header: 'Action',
        cell: (l: any) => l.action,
      },
      {
        header: 'Guests',
        cell: (l: any) => l.count,
      },
      {
        header: 'Revenue',
        cell: (l: any) => money(l.revenue),
      },
      {
        header: 'User',
        cell: (l: any) => l.userId ?? 'system',
      },
      {
        header: 'IP address',
        cell: (l: any) => l.ip ?? '—',
      },
    ]}
  />
);

export function AutoExtensionStats() {
  const { data } = useGet('/stays/auto-extension/stats');
  const { data: logs } = useGet<any[]>(
    '/stays/auto-extension/logs',
  );

  const run = useAction(
    () => api.post('/stays/auto-extension/run'),
    {
      success: 'Auto extension run complete',
      invalidate: [
        '/stays/auto-extension/stats',
        '/stays/auto-extension/logs',
        '/stays/next-checkout',
      ],
    },
  );

  const tile = (
    icon: any,
    label: string,
    value: any,
    subtitle: any,
  ) => (
    <Card className="flex items-center gap-3 p-4">
      <div className="rounded-lg bg-slate-100 p-3">
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">
          {label}
        </div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">
          {subtitle}
        </div>
      </div>
    </Card>
  );

  return (
    <>
      <PageHeader
        title="Auto Extension Statistics"
        subtitle="Automated stay extension system for checked-in guests"
      >
        <Button variant="outline" asChild>
          <Link to="/">Back to Dashboard</Link>
        </Button>
        <Button
          onClick={() =>
            confirm('Extend every overdue guest now?') &&
            run.mutate(undefined)
          }
          disabled={run.isPending}
        >
          <Bug className="h-4 w-4" />
          Run now
        </Button>
      </PageHeader>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {tile(
          <UsersIcon className="h-5 w-5" />,
          'Eligible Guests',
          data?.eligible ?? 0,
          <>
            <Badge variant="blue">
              {data?.individual ?? 0} Individual
            </Badge>{' '}
            <Badge variant="green">
              {data?.group ?? 0} Group
            </Badge>
          </>,
        )}

        {tile(
          <FileText className="h-5 w-5" />,
          'Potential Revenue',
          money(data?.potentialRevenue),
          'Total revenue from next auto-extension run',
        )}

        {tile(
          <Clock className="h-5 w-5" />,
          'Next Scheduled Run',
          data?.nextRun
            ? new Date(data.nextRun).toLocaleTimeString(
                'en-NG',
                {
                  hour: 'numeric',
                  minute: '2-digit',
                },
              )
            : '—',
          'Daily at 14:00',
        )}

        {tile(
          <ClipboardList className="h-5 w-5" />,
          'Last Run',
          data?.lastRun ? dt(data.lastRun) : 'Never',
          data?.lastRun ? '' : 'No runs recorded yet',
        )}
      </div>

      <Card className="p-4">
        <b>Recent Activity Logs</b>

        {!logs?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No auto extension activity has been recorded yet.
          </p>
        ) : (
          logs.slice(0, 8).map((l) => (
            <div
              key={l.id}
              className="flex justify-between border-b py-2 text-sm"
            >
              <span>
                {dt(l.createdAt)} — {l.action}
              </span>
              <span>
                {l.count} guests · {money(l.revenue)}
              </span>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

export function Users() {
  const [open, setOpen] = useState(false);

  const [f, setF] = useState({
    username: '',
    email: '',
    role: 'RECEPTIONIST',
    password: '',
  });

  const add = useAction(
    () => api.post('/users', f),
    {
      success: 'User created',
      invalidate: ['/users'],
      onSuccess: () => setOpen(false),
    },
  );

  const toggle = useAction(
    (id: string) => api.post(`/users/${id}/toggle`),
    {
      invalidate: ['/users'],
    },
  );

  const del = useAction(
    (id: string) => api.del(`/users/${id}`),
    {
      success: 'User deleted',
      invalidate: ['/users'],
    },
  );

  const forceLogout = useAction(
    (id: string) => api.post(`/users/${id}/force-logout`),
    {
      success: 'User signed out of all devices',
      invalidate: ['/users'],
    },
  );

  const reset2fa = useAction(
    (id: string) => api.post(`/users/${id}/reset-2fa`),
    {
      success: 'Two-factor reset. The user can enrol again.',
      invalidate: ['/users'],
    },
  );

  return (
    <>
      <ListPage
        title="Users Management"
        endpoint="/users"
        actions={
          <Button
            variant="default"
            onClick={() => setOpen(!open)}
          >
            Add New User
          </Button>
        }
        cols={[
          {
            header: 'User',
            cell: (u: any) => (
              <div>
                <b>{u.username}</b>
                <div className="text-xs text-muted-foreground">
                  {u.email}
                </div>
              </div>
            ),
          },
          {
            header: 'Role',
            cell: (u: any) => <Badge>{u.role}</Badge>,
          },
          {
            header: 'Status',
            cell: (u: any) => (
              <Badge variant={u.isActive ? 'green' : 'gray'}>
                {u.isActive ? 'Active' : 'Disabled'}
              </Badge>
            ),
          },
          {
            header: 'Actions',
            cell: (u: any) => (
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                <button
                  type="button"
                  className="text-blue-700 hover:text-blue-900 disabled:opacity-50"
                  disabled={forceLogout.isPending}
                  onClick={() =>
                    confirm(
                      `Sign ${u.username} out of every device?`,
                    ) && forceLogout.mutate(u.id)
                  }
                >
                  Force logout
                </button>

                {u.twoFactorEnabled && (
                  <button
                    type="button"
                    className="text-purple-700 hover:text-purple-900 disabled:opacity-50"
                    disabled={reset2fa.isPending}
                    onClick={() =>
                      confirm(
                        `Reset two-factor for ${u.username}? They will be signed out and must enrol again.`,
                      ) && reset2fa.mutate(u.id)
                    }
                  >
                    Reset 2FA
                  </button>
                )}

                <button
                  type="button"
                  className="text-orange-600 hover:text-orange-800 disabled:opacity-50"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(u.id)}
                >
                  {u.isActive ? 'Disable' : 'Enable'}
                </button>

                <button
                  type="button"
                  className="text-red-600 hover:text-red-800 disabled:opacity-50"
                  disabled={del.isPending}
                  onClick={() =>
                    confirm(`Delete ${u.username}?`) &&
                    del.mutate(u.id)
                  }
                >
                  Delete
                </button>
              </div>
            ),
          },
        ]}
      />

      {open && (
        <Card className="mt-4 grid gap-3 p-4 md:grid-cols-5">
          <Field label="Username">
            <Input
              value={f.username}
              onChange={(e) =>
                setF({ ...f, username: e.target.value })
              }
            />
          </Field>

          <Field label="Email">
            <Input
              type="email"
              value={f.email}
              onChange={(e) =>
                setF({ ...f, email: e.target.value })
              }
            />
          </Field>

          <Field label="Role">
            <NativeSelect
              value={f.role}
              onChange={(e) =>
                setF({ ...f, role: e.target.value })
              }
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Password (8+ chars)">
            <Input
              type="password"
              value={f.password}
              onChange={(e) =>
                setF({ ...f, password: e.target.value })
              }
            />
          </Field>

          <div className="flex items-end">
            <Button
              onClick={() => add.mutate(undefined)}
              disabled={
                f.password.length < 8 ||
                !f.username.trim() ||
                !f.email.trim() ||
                add.isPending
              }
            >
              Create
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}

export function ChangePassword() {
  const [f, setF] = useState({
    currentPassword: '',
    newPassword: '',
  });

  const save = useAction(
    () => api.post('/auth/change-password', f),
    {
      success: 'Password changed',
      onSuccess: () =>
        setF({
          currentPassword: '',
          newPassword: '',
        }),
    },
  );

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Change Password" />

      <Card className="space-y-4 p-6">
        <Field label="Current password">
          <Input
            type="password"
            value={f.currentPassword}
            onChange={(e) =>
              setF({
                ...f,
                currentPassword: e.target.value,
              })
            }
          />
        </Field>

        <Field
          label="New password"
          hint="At least 8 characters"
        >
          <Input
            type="password"
            value={f.newPassword}
            onChange={(e) =>
              setF({
                ...f,
                newPassword: e.target.value,
              })
            }
          />
        </Field>

        <Button
          disabled={
            f.newPassword.length < 8 ||
            !f.currentPassword ||
            save.isPending
          }
          onClick={() => save.mutate(undefined)}
        >
          Update password
        </Button>
      </Card>
    </div>
  );
}
