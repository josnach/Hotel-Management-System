
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Download, ArrowLeft, Eye, Pencil, Plus, Search } from 'lucide-react';

import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { d, dt, money } from '@/lib/utils';
import { PageHeader, Stat } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';

type AccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE';

type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  category?: string | null;
  description?: string | null;
  isActive: boolean;
  isSystem: boolean;
  balance: number | string;
  createdAt?: string;
  updatedAt?: string;
};

type RecentEntry = {
  id: string;
  date: string;
  txnNo: number;
  reference?: string | null;
  description: string;
  memo?: string | null;
  debit: number | string;
  credit: number | string;
};

type AccountDetail = Account & {
  hasEntries: boolean;
  entryCount: number;
  recentEntries: RecentEntry[];
};

type AccountFormData = {
  code: string;
  name: string;
  type: AccountType;
  category: string;
  description: string;
  isActive: boolean;
};

const accountTypes: AccountType[] = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
];

const typeTone: Record<AccountType, string> = {
  ASSET: 'blue',
  LIABILITY: 'orange',
  EQUITY: 'purple',
  REVENUE: 'green',
  EXPENSE: 'red',
};

const emptyForm: AccountFormData = {
  code: '',
  name: '',
  type: 'EXPENSE',
  category: '',
  description: '',
  isActive: true,
};

const accountGuidelines = [
  { type: 'ASSET', range: '100000–199999', description: 'Cash, bank, inventory, receivables and other resources.' },
  { type: 'LIABILITY', range: '200000–299999', description: 'Payables, taxes, deposits and other obligations.' },
  { type: 'EQUITY', range: '300000–399999', description: 'Owner capital, retained earnings and reserves.' },
  { type: 'REVENUE', range: '400000–499999', description: 'Room revenue, food and beverage revenue, and other income.' },
  { type: 'EXPENSE', range: '500000–599999', description: 'Payroll, utilities, operating costs and cost of sales.' },
];

function AccountTypeBadge({ type }: { type: AccountType }) {
  return <Badge variant={typeTone[type] as any}>{type}</Badge>;
}

function AccountStatus({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? 'green' : 'gray'}>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

function AccountFields({
  form,
  setForm,
  editing = false,
 lockType = false,
}: {
  form: AccountFormData;
  setForm: React.Dispatch<React.SetStateAction<AccountFormData>>;
  editing?: boolean;
  lockType?: boolean;

}) {
  const update = (key: keyof AccountFormData, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Account Code *</span>
          <Input
            value={form.code}
            disabled={editing}
            maxLength={6}
            placeholder="e.g. 510000"
            onChange={(event) => update('code', event.target.value.replace(/\D/g, ''))}
          />
          {editing && (
            <span className="text-xs text-muted-foreground">
              Account codes cannot be changed after creation.
            </span>
          )}
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Account Name *</span>
          <Input
            value={form.name}
            maxLength={120}
            placeholder="Enter account name"
            onChange={(event) => update('name', event.target.value)}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Account Type *</span>

            <NativeSelect
                   value={form.type}
                  disabled={lockType}
                  onChange={(event) => update('type', event.target.value)}
>
            {accountTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </NativeSelect>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Category</span>
          <Input
            value={form.category}
            maxLength={80}
            placeholder="e.g. Operating Expenses"
            onChange={(event) => update('category', event.target.value)}
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Description</span>
        <textarea
          value={form.description}
          maxLength={500}
          rows={4}
          placeholder="Add an optional description for this account..."
          onChange={(event) => update('description', event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) => update('isActive', event.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        Account is active
      </label>
    </div>
  );
}

function AccountGuidelines() {
  return (
    <Card className="p-5">
      <h3 className="font-semibold">Account Code Guidelines</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Use the existing six-digit account code structure.
      </p>
      <div className="mt-4 space-y-3">
        {accountGuidelines.map((item) => (
          <div key={item.type} className="flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium">{item.type}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <span className="whitespace-nowrap text-sm font-medium">{item.range}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}


function AccountRowActions({ account }: { account: Account }) {
  const toggle = useAction(
    () => api.post(`/finance/accounts/${account.id}/toggle`),
    {
      success: account.isActive
        ? 'Account deactivated.'
        : 'Account activated.',
      invalidate: ['/finance/accounts'],
    },
  );

  const remove = useAction(
    () => api.del(`/finance/accounts/${account.id}`),
    {
      success: 'Account deleted successfully.',
      invalidate: ['/finance/accounts'],
    },
  );

  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button variant="ghost" size="sm" asChild>
        <Link to={`/finance/accounts/${account.id}`}>
          <Eye className="mr-1 h-4 w-4" />
          View
        </Link>
      </Button>

      <Button variant="ghost" size="sm" asChild>
        <Link to={`/finance/accounts/${account.id}/edit`}>
          <Pencil className="mr-1 h-4 w-4" />
          Edit
        </Link>
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={toggle.isPending}
        onClick={() => toggle.mutate(undefined)}
      >
        {toggle.isPending
          ? 'Updating...'
          : account.isActive
            ? 'Deactivate'
            : 'Activate'}
      </Button>

      {!account.isSystem && (
        <Button
          variant="outline"
          size="sm"
          disabled={remove.isPending}
          onClick={() => {
            if (
              window.confirm(
                `Permanently delete account ${account.code} - ${account.name}?`
              )
            ) {
              remove.mutate(undefined);
            }
          }}
        >
          {remove.isPending ? 'Deleting...' : 'Delete'}
        </Button>
      )}
    </div>
  );
}


export function ChartOfAccounts() {
  const { data = [], isLoading, error } = useGet<Account[]>('/finance/accounts');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const accounts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return data.filter((account) => {
      const matchesSearch =
        !query ||
        account.code.toLowerCase().includes(query) ||
        account.name.toLowerCase().includes(query) ||
        (account.category ?? '').toLowerCase().includes(query);

      const matchesType =
        typeFilter === 'ALL' || account.type === typeFilter;

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && account.isActive) ||
        (statusFilter === 'INACTIVE' && !account.isActive);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [data, search, typeFilter, statusFilter]);

  const summary = useMemo(() => {
    return accountTypes.map((type) => {
      const matching = data.filter((account) => account.type === type);
      return {
        type,
        count: matching.length,
        active: matching.filter((account) => account.isActive).length,
      };
    });
  }, [data]);

  const exportCsv = () => {
    const headers = [
      'Code',
      'Account Name',
      'Type',
      'Category',
      'Description',
      'Balance',
      'Status',
    ];

    const escapeCsv = (value: unknown) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;

    const rows = accounts.map((account) => [
      account.code,
      account.name,
      account.type,
      account.category,
      account.description,
      account.balance,
      account.isActive ? 'Active' : 'Inactive',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');

    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    );

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'chart-of-accounts.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chart of Accounts"
        subtitle="Manage the hotel's accounting structure and account balances."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!accounts.length}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button asChild>
            <Link to="/finance/accounts/new">
              <Plus className="mr-2 h-4 w-4" />
              New Account
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {summary.map((item) => (
          <Card key={item.type} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{item.type}</span>
              <AccountTypeBadge type={item.type} />
            </div>
            <p className="mt-3 text-2xl font-semibold">{item.count}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.active} active account{item.active === 1 ? '' : 's'}
            </p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_190px_170px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              placeholder="Search by code, name or category..."
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <NativeSelect value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="ALL">All Types</option>
            {accountTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </NativeSelect>

          <NativeSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </NativeSelect>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="font-semibold">Accounts</h3>
            <p className="text-sm text-muted-foreground">
              {accounts.length} account{accounts.length === 1 ? '' : 's'} shown
            </p>
          </div>
        </div>

        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading accounts...</p>
        ) : error ? (
          <p className="p-6 text-sm text-red-600">Unable to load accounts.</p>
        ) : accounts.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No accounts match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Account Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 font-mono">{account.code}</td>
                    <td className="min-w-48 px-4 py-3">
                      <Link className="font-medium hover:underline" to={`/finance/accounts/${account.id}`}>
                        {account.name}
                      </Link>
                      {account.isSystem && (
                        <span className="ml-2 text-xs text-muted-foreground">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><AccountTypeBadge type={account.type} /></td>
                    <td className="px-4 py-3">{account.category || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {money(Number(account.balance))}
                    </td>
                    <td className="px-4 py-3"><AccountStatus active={account.isActive} /></td>
                   <td className="px-4 py-3">
                    <AccountRowActions account={account} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export function AccountCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState<AccountFormData>(emptyForm);

  const save = useAction(
    (body: AccountFormData) => api.post('/finance/accounts', body),
    {
      success: 'Account created successfully.',
      invalidate: ['/finance/accounts'],
      onSuccess: () => navigate('/finance/accounts'),
    },
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    save.mutate(form);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Create Account" subtitle="Add a new account to the chart of accounts.">
        <Button variant="outline" onClick={() => navigate('/finance/accounts')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Accounts
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-5">
            <AccountFields form={form} setForm={setForm} />
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => navigate('/finance/accounts')}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Creating...' : 'Create Account'}
              </Button>
            </div>
          </form>
        </Card>
        <AccountGuidelines />
      </div>
    </div>
  );
}

export function AccountDetails() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGet<AccountDetail>(`/finance/accounts/${id}`, undefined, !!id);

  const toggle = useAction(
    () => api.post(`/finance/accounts/${id}/toggle`),
    {
      success: 'Account status updated.',
      invalidate: ['/finance/accounts', `/finance/accounts/${id}`],
    },
  );

  const remove = useAction(
    () => api.del(`/finance/accounts/${id}`),
    {
      success: 'Account deleted.',
      invalidate: ['/finance/accounts'],
      onSuccess: () => navigate('/finance/accounts'),
    },
  );

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading account...</p>;
  if (error || !data) return <p className="p-6 text-sm text-red-600">Unable to load this account.</p>;

  return (
    <div className="space-y-6">
      <PageHeader title={data.name} subtitle={`Account ${data.code}`}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate('/finance/accounts')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Accounts
          </Button>
          <Button variant="outline" onClick={() => navigate(`/finance/accounts/${id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Button>
          <Button
            variant="outline"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate(undefined)}
          >
            {data.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          {!data.isSystem && !data.hasEntries && (
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm('Delete this account permanently?')) {
                  remove.mutate(undefined);
                }
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Current Balance" value={money(Number(data.balance))} />
        <Stat label="Account Type" value={data.type} />
        <Stat label="Status" value={data.isActive ? 'Active' : 'Inactive'} />
        <Stat label="Journal Entries" value={String(data.entryCount)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5">
          <h3 className="font-semibold">Account Information</h3>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Account Code</dt>
              <dd className="mt-1 font-mono">{data.code}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Account Name</dt>
              <dd className="mt-1 font-medium">{data.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Type</dt>
              <dd className="mt-1"><AccountTypeBadge type={data.type} /></dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Category</dt>
              <dd className="mt-1">{data.category || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd className="mt-1">{data.createdAt ? dt(data.createdAt) : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last Updated</dt>
              <dd className="mt-1">{data.updatedAt ? dt(data.updatedAt) : '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Description</dt>
              <dd className="mt-1 whitespace-pre-wrap">{data.description || 'No description provided.'}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold">Account Usage</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Account classification</span>
              <AccountTypeBadge type={data.type} />
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">System account</span>
              <span>{data.isSystem ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Has journal entries</span>
              <span>{data.hasEntries ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Entry count</span>
              <span>{data.entryCount}</span>
            </div>
          </div>
          <Button className="mt-5 w-full" variant="outline" asChild>
            <Link to="/finance/trial-balance">View in Reports</Link>
          </Button>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <h3 className="font-semibold">Recent Journal Entries</h3>
          <p className="text-sm text-muted-foreground">Latest transactions posted to this account.</p>
        </div>
        {!data.recentEntries?.length ? (
          <p className="p-5 text-sm text-muted-foreground">No journal entries have been posted to this account.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.recentEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-4 py-3">{d(entry.date)}</td>
                    <td className="px-4 py-3 font-mono">JE-{entry.txnNo}</td>
                    <td className="min-w-48 px-4 py-3">
                      <p>{entry.description}</p>
                      {entry.memo && <p className="text-xs text-muted-foreground">{entry.memo}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{money(Number(entry.debit))}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{money(Number(entry.credit))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export function AccountEdit() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGet<AccountDetail>(`/finance/accounts/${id}`, undefined, !!id);
  const [form, setForm] = useState<AccountFormData>(emptyForm);

  useEffect(() => {
    if (!data) return;
    setForm({
      code: data.code,
      name: data.name,
      type: data.type,
      category: data.category ?? '',
      description: data.description ?? '',
      isActive: data.isActive,
    });
  }, [data]);

  const save = useAction(
    (body: Omit<AccountFormData, 'code'>) => api.put(`/finance/accounts/${id}`, body),
    {
      success: 'Account updated successfully.',
      invalidate: ['/finance/accounts', `/finance/accounts/${id}`],
      onSuccess: () => navigate(`/finance/accounts/${id}`),
    },
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const { code, ...body } = form;
    save.mutate(body);
  };

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading account...</p>;
  if (error || !data) return <p className="p-6 text-sm text-red-600">Unable to load this account.</p>;

  return (
    <div className="space-y-6">
      <PageHeader title="Edit Account" subtitle={`${data.code} · ${data.name}`}>
        <Button variant="outline" onClick={() => navigate(`/finance/accounts/${id}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Account Details
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-5">
            <AccountFields form={form} setForm={setForm} editing lockType={data.hasEntries}/>
            {data.hasEntries && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                This account has journal entries. Its account type cannot be changed.
              </p>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => navigate(`/finance/accounts/${id}`)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <AccountGuidelines />
          <Card className="p-5">
            <h3 className="font-semibold">Important Notes</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Account codes are permanent and cannot be edited.</li>
              <li>System accounts cannot be deleted.</li>
              <li>Accounts with journal entries cannot be deleted.</li>
              <li>Accounts with journal entries cannot be reclassified.</li>
              <li>Deactivate an account to prevent further use while retaining its history.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
