
import { useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { d, dt, money, monthStart, today } from '@/lib/utils';
import { Field, PageHeader, PrintButton, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { ListPage } from './ListPage';

const typeTone: Record<string, any> = {
  ASSET: 'blue',
  LIABILITY: 'orange',
  EQUITY: 'purple',
  REVENUE: 'green',
  EXPENSE: 'red',
};

function DateRange({ s, e, setS, setE, onGo, children }: any) {
  return (
    <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
      <Field label="Start Date">
        <Input type="date" value={s} onChange={(x) => setS(x.target.value)} />
      </Field>
      <Field label="End Date">
        <Input type="date" value={e} onChange={(x) => setE(x.target.value)} />
      </Field>
      <Button onClick={onGo}>Generate Report</Button>
      {children}
    </Card>
  );
}

const useRange = () => {
  const [s, setS] = useState(monthStart());
  const [e, setE] = useState(today());
  const [ap, setAp] = useState({ start: s, end: e });

  return {
    s,
    e,
    setS,
    setE,
    ap,
    go: () => setAp({ start: s, end: e }),
  };
};

export function ChartOfAccounts() {
  const { data, isLoading } = useGet<any[]>('/finance/accounts');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({
    code: '',
    name: '',
    type: 'EXPENSE',
    category: '',
  });

  const save = useAction(() => api.post('/finance/accounts', f), {
    success: 'Account created',
    invalidate: ['/finance/accounts'],
    onSuccess: () => setOpen(false),
  });

  const toggle = useAction(
    (id: string) => api.post(`/finance/accounts/${id}/toggle`),
    { invalidate: ['/finance/accounts'] },
  );

  const del = useAction((id: string) => api.del(`/finance/accounts/${id}`), {
    success: 'Account deleted',
    invalidate: ['/finance/accounts'],
  });

  return (
    <>
      <PageHeader
        title="Chart of Accounts"
        subtitle="Accounts with entries cannot be deleted"
      >
        <Button onClick={() => setOpen(true)}>New Account</Button>
      </PageHeader>

      <ListCard
        rows={data}
        loading={isLoading}
        cols={[
          {
            header: 'Code',
            cell: (a: any) => <span className="font-mono">{a.code}</span>,
          },
          { header: 'Name', cell: (a: any) => <b>{a.name}</b> },
          {
            header: 'Type',
            cell: (a: any) => (
              <Badge variant={typeTone[a.type]}>
                {a.type[0] + a.type.slice(1).toLowerCase()}
              </Badge>
            ),
          },
          { header: 'Category', cell: (a: any) => a.category },
          { header: 'Balance', cell: (a: any) => money(a.balance) },
          {
            header: 'Status',
            cell: (a: any) => (
              <Badge variant={a.isActive ? 'green' : 'gray'}>
                {a.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
          {
            header: 'Actions',
            cell: (a: any) => (
              <div className="flex gap-3 text-xs font-medium">
                <button
                  className="text-yellow-700"
                  onClick={() => toggle.mutate(a.id)}
                >
                  {a.isActive ? 'Deactivate' : 'Activate'}
                </button>
                {!a.isSystem && (
                  <button
                    className="text-red-600"
                    onClick={() =>
                      confirm('Delete this account?') && del.mutate(a.id)
                    }
                  >
                    Delete
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />

      <Card className="mt-4 bg-blue-50 p-4 text-sm">
        <b>Account Code Structure</b>
        <div className="mt-1 grid gap-1 text-muted-foreground md:grid-cols-2">
          <div>
            100000–199999 Assets · 200000–299999 Liabilities · 300000–399999
            Equity · 400000–499999 Revenue · 500000–599999 Expenses
          </div>
          <div>
            Accounts with entries cannot be deleted. System accounts cannot be
            removed.
          </div>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New account</DialogTitle>
          </DialogHeader>

          <Field label="Code (6 digits)">
            <Input
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value })}
            />
          </Field>

          <Field label="Name">
            <Input
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>

          <Field label="Type">
            <NativeSelect
              value={f.type}
              onChange={(e) => setF({ ...f, type: e.target.value })}
            >
              {Object.keys(typeTone).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Category">
            <Input
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value })}
            />
          </Field>

          <Button onClick={() => save.mutate(undefined)}>Create</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Journal() {
  const [f, setF] = useState<any>({
    start: '',
    end: '',
    accountId: '',
    type: '',
    txnNo: '',
  });
  const [ap, setAp] = useState<any>({});
  const [page, setPage] = useState(1);

  const { data: accts } = useGet<any[]>('/finance/accounts');
  const { data, isLoading } = useGet('/finance/journal', { ...ap, page });

  return (
    <>
      <PageHeader title="Journal Entries" />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Start Date">
            <Input
              type="date"
              value={f.start}
              onChange={(e) => setF({ ...f, start: e.target.value })}
            />
          </Field>

          <Field label="End Date">
            <Input
              type="date"
              value={f.end}
              onChange={(e) => setF({ ...f, end: e.target.value })}
            />
          </Field>

          <Field label="Account">
            <NativeSelect
              value={f.accountId}
              onChange={(e) => setF({ ...f, accountId: e.target.value })}
            >
              <option value="">All Accounts</option>
              {accts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Entry Type">
            <NativeSelect
              value={f.type}
              onChange={(e) => setF({ ...f, type: e.target.value })}
            >
              <option value="">All Types</option>
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </NativeSelect>
          </Field>

          <Field label="Transaction ID">
            <Input
              placeholder="Enter transaction ID"
              value={f.txnNo}
              onChange={(e) => setF({ ...f, txnNo: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            onClick={() => {
              setAp(f);
              setPage(1);
            }}
          >
            Filter
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setF({
                start: '',
                end: '',
                accountId: '',
                type: '',
                txnNo: '',
              });
              setAp({});
              setPage(1);
            }}
          >
            Clear
          </Button>
        </div>
      </Card>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat tone="blue" label="Total Debits" value={money(data?.totalDebits)} />
        <Stat tone="green" label="Total Credits" value={money(data?.totalCredits)} />
        <Stat
          tone={data?.balanced === false ? 'red' : 'green'}
          label="Balance Status"
          value={data?.balanced === false ? 'Unbalanced' : 'Balanced'}
          sub={`Diff: ${money(data?.difference)}`}
        />
      </div>

      <ListCard
        title={`Journal Entries — ${data?.total ?? 0} entries found`}
        rows={data?.rows}
        loading={isLoading}
        cols={[
          { header: 'Date', cell: (r: any) => d(r.date) },
          {
            header: 'Transaction',
            cell: (r: any) => (
              <span className="text-blue-700">#{r.txnNo}</span>
            ),
          },
          {
            header: 'Account',
            cell: (r: any) => (
              <div>
                {r.account}
                <div className="text-xs text-muted-foreground">
                  {r.accountCode}
                </div>
              </div>
            ),
          },
          {
            header: 'Type',
            cell: (r: any) => (
              <Badge variant={r.type === 'Debit' ? 'blue' : 'green'}>
                {r.type}
              </Badge>
            ),
          },
          {
            header: 'Description',
            cell: (r: any) => (
              <span className="text-xs">{r.description}</span>
            ),
          },
          {
            header: 'Amount (₦)',
            cell: (r: any) => (
              <b
                className={
                  r.type === 'Debit' ? 'text-blue-700' : 'text-green-700'
                }
              >
                {money(r.amount)}
              </b>
            ),
          },
        ]}
      />

      <div className="mt-3 flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={(data?.rows?.length ?? 0) < 50}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </>
  );
}

export function TrialBalance() {
  const r = useRange();
  const { data } = useGet('/finance/reports/trial-balance', r.ap);

  const csv = () => {
    const rows = [
      ['Code', 'Account', 'Type', 'Debit', 'Credit'],
      ...(data?.rows ?? []).map((x: any) => [
        x.code,
        x.name,
        x.type,
        x.debit,
        x.credit,
      ]),
    ];

    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([rows.map((x) => x.join(',')).join('\n')], {
        type: 'text/csv',
      }),
    );
    a.download = 'trial-balance.csv';
    a.click();
  };

  return (
    <>
      <PageHeader title="Trial Balance">
        <Button variant="success" onClick={csv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </PageHeader>

      <DateRange {...r} onGo={r.go} />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat tone="blue" label="Total Debit" value={money(data?.totalDebit)} />
        <Stat tone="green" label="Total Credit" value={money(data?.totalCredit)} />
        <Stat
          tone={data?.balanced === false ? 'red' : 'green'}
          label="Balance Status"
          value={data?.balanced === false ? 'Unbalanced' : 'Balanced'}
          sub={`Difference: ${money(data?.difference)}`}
        />
      </div>

      <ListCard
        title={`Trial Balance Report (${d(data?.from)} – ${d(data?.to)})`}
        rows={data?.rows}
        cols={[
          { header: 'Account Code', cell: (x: any) => x.code },
          { header: 'Account Name', cell: (x: any) => x.name },
          { header: 'Type', cell: (x: any) => x.type },
          {
            header: 'Debit (₦)',
            cell: (x: any) => money(x.debit),
            className: 'text-right',
          },
          {
            header: 'Credit (₦)',
            cell: (x: any) => money(x.credit),
            className: 'text-right',
          },
        ]}
      />
    </>
  );
}

export function ProfitLoss() {
  const r = useRange();
  const { data } = useGet('/finance/reports/profit-loss', r.ap);

  return (
    <>
      <PageHeader title="Profit & Loss Statement">
        <PrintButton />
      </PageHeader>

      <DateRange {...r} onGo={r.go} />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat tone="green" label="Total Revenue" value={money(data?.totalRevenue)} />
        <Stat tone="red" label="Total Expenses" value={money(data?.totalExpenses)} />
        <Stat
          tone="green"
          label="Net Profit"
          value={money(data?.netProfit)}
          sub={`Margin: ${Number(data?.margin ?? 0).toFixed(0)}%`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ListCard
          title="Revenue"
          rows={data?.revenue}
          cols={[
            { header: 'Account', cell: (x: any) => x.name },
            {
              header: 'Amount (₦)',
              cell: (x: any) => money(x.amount),
              className: 'text-right',
            },
          ]}
        />
        <ListCard
          title="Expenses"
          rows={data?.expenses}
          cols={[
            { header: 'Account', cell: (x: any) => x.name },
            {
              header: 'Amount (₦)',
              cell: (x: any) => money(x.amount),
              className: 'text-right',
            },
          ]}
        />
      </div>

      <div className="mt-4">
        <ListCard
          title="Sales by Sales Point"
          rows={data?.salesByPoint}
          empty="No transactions found for the selected criteria."
          cols={[
            { header: 'Sales Point', cell: (x: any) => x.salesPoint },
            {
              header: 'Total Income',
              cell: (x: any) => money(x.income),
              className: 'text-right',
            },
          ]}
        />
      </div>
    </>
  );
}

export function BalanceSheet() {
  const [asAt, setAsAt] = useState(today());
  const { data } = useGet('/finance/reports/balance-sheet', { asAt });

  const block = (t: string, rows: any[] | undefined, total: any) => (
    <Card className="p-4">
      <div className="mb-2 font-semibold">{t}</div>
      {rows?.map((x) => (
        <div
          key={x.code}
          className="flex justify-between border-b py-1 text-sm"
        >
          <span>{x.name}</span>
          <span>{money(x.amount)}</span>
        </div>
      ))}
      <div className="mt-2 flex justify-between font-bold">
        <span>Total {t}</span>
        <span>{money(total)}</span>
      </div>
    </Card>
  );

  return (
    <>
      <PageHeader title="Balance Sheet">
        <Input
          type="date"
          className="w-44"
          value={asAt}
          onChange={(e) => setAsAt(e.target.value)}
        />
        <PrintButton />
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          {block('Assets', data?.assets, data?.totalAssets)}
        </div>
        <div className="space-y-4">
          {block('Liabilities', data?.liabilities, data?.totalLiabilities)}
          {block(
            'Equity',
            [
              ...(data?.equity ?? []),
              {
                code: 'RE',
                name: 'Retained earnings',
                amount: data?.retainedEarnings,
              },
            ],
            data?.totalEquity,
          )}
        </div>
      </div>

      <p className="mt-3 text-sm">
        {data?.balanced ? (
          <Badge variant="green">Balanced</Badge>
        ) : (
          <Badge variant="red">Out of balance</Badge>
        )}
      </p>
    </>
  );
}

export function CashFlow() {
  const r = useRange();
  const { data } = useGet('/finance/reports/cash-flow', r.ap);

  return (
    <>
      <PageHeader title="Cash Flow Statement">
        <PrintButton />
      </PageHeader>

      <DateRange {...r} onGo={r.go} />

      <div className="grid gap-3 md:grid-cols-4">
        <Stat tone="blue" label="Cash at Beginning" value={money(data?.cashAtBeginning)} />
        <Stat tone="green" label="Operating Activities" value={money(data?.operating)} />
        <Stat tone="purple" label="Investing Activities" value={money(data?.investing)} />
        <Stat tone="yellow" label="Financing Activities" value={money(data?.financing)} />
      </div>

      <Card className="mt-4 p-4 text-sm">
        <div className="flex justify-between font-bold">
          <span>Cash at End of Period</span>
          <span>{money(data?.cashAtEnd)}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{data?.note}</p>
      </Card>
    </>
  );
}

export function PurchaseOrders() {
  const { data } = useGet('/finance/purchase-orders');
  const s = data?.summary ?? {};

  const act = useAction(
    (v: { id: string; path: string; body?: any }) =>
      api.post(`/finance/purchase-orders/${v.id}/${v.path}`, v.body ?? {}),
    {
      success: 'Updated',
      invalidate: ['/finance/purchase-orders'],
    },
  );

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Manage your procurement and supplier orders"
      />

      <div className="mb-4 grid gap-3 md:grid-cols-6">
        {[
          ['Total', s.total],
          ['Draft', s.DRAFT],
          ['Pending', s.PENDING],
          ['Approved', s.APPROVED],
          ['Received', s.RECEIVED],
          ['Cancelled', s.CANCELLED],
        ].map(([l, v]) => (
          <Stat
            key={l as string}
            label={l as string}
            value={v ?? 0}
            className="text-center"
          />
        ))}
      </div>

      <ListCard
        title={`Purchase Orders — ${data?.rows?.length ?? 0} found`}
        rows={data?.rows}
        cols={[
          { header: 'PO #', cell: (p: any) => p.poNo },
          { header: 'Supplier', cell: (p: any) => p.supplier.name },
          { header: 'Total', cell: (p: any) => money(p.total) },
          {
            header: 'Status',
            cell: (p: any) => (
              <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
            ),
          },
          { header: 'Date', cell: (p: any) => d(p.createdAt) },
          {
            header: 'Actions',
            cell: (p: any) => (
              <div className="flex gap-2">
                {p.status === 'DRAFT' && (
                  <Button
                    size="sm"
                    onClick={() =>
                      act.mutate({
                        id: p.id,
                        path: 'status',
                        body: { status: 'PENDING' },
                      })
                    }
                  >
                    Submit
                  </Button>
                )}
                {p.status === 'PENDING' && (
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() =>
                      act.mutate({
                        id: p.id,
                        path: 'status',
                        body: { status: 'APPROVED' },
                      })
                    }
                  >
                    Approve
                  </Button>
                )}
                {p.status === 'APPROVED' && (
                  <Button
                    size="sm"
                    variant="purple"
                    onClick={() => act.mutate({ id: p.id, path: 'receive' })}
                  >
                    Receive
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

export const GuestPayments = () => (
  <ListPage
    title="Guest Payments"
    endpoint="/finance/payments"
    cols={[
      { header: 'Date', cell: (t: any) => dt(t.createdAt) },
      {
        header: 'Guest / Group',
        cell: (t: any) =>
          t.folio.guest
            ? `${t.folio.guest.firstName} ${t.folio.guest.lastName}`
            : t.folio.group?.name,
      },
      { header: 'Description', cell: (t: any) => t.description },
      { header: 'Method', cell: (t: any) => t.method },
      {
        header: 'Amount',
        cell: (t: any) => (
          <b className="text-green-700">{money(t.payment)}</b>
        ),
      },
    ]}
  />
);

export const GuestLedger = () => (
  <ListPage
    title="Guest Ledger"
    subtitle="Balances of in-house guests"
    endpoint="/finance/ledgers/guest"
    cols={[
      { header: 'Guest', cell: (r: any) => r.guest },
      { header: 'Room', cell: (r: any) => r.room },
      {
        header: 'Balance',
        cell: (r: any) => <b className="text-red-600">{money(r.balance)}</b>,
      },
    ]}
  />
);

export const CityLedger = () => (
  <ListPage
    title="City Ledger"
    subtitle="Receivables from groups and companies"
    endpoint="/finance/ledgers/city"
    cols={[
      { header: 'Group / Company', cell: (r: any) => r.name },
      {
        header: 'Outstanding',
        cell: (r: any) => <b className="text-red-600">{money(r.balance)}</b>,
      },
    ]}
  />
);
