
import { useState } from 'react';
import { Check, CheckCircle2, Download } from 'lucide-react';
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
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

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
    URL.revokeObjectURL(a.href);
  };

  const reportDate = (value: unknown) => {
    if (!value) return '—';

    return new Date(String(value)).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  };

  const generatedAt = new Date()
    .toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(/, (\d{1,2}:\d{2} [AP]M)$/, ' at $1');

  const rows = data?.rows ?? [];

  const typeVariant = (type: string) => {
    switch (type.toLowerCase()) {
      case 'asset':
        return 'blue' as const;
      case 'liability':
        return 'yellow' as const;
      case 'revenue':
        return 'green' as const;
      default:
        return 'gray' as const;
    }
  };

  const amount = (value: unknown) =>
    Number(value ?? 0) === 0 ? '—' : money(value);

  return (
    <>
      <PageHeader title="Trial Balance">
        <Button variant="success" onClick={csv}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </PageHeader>

      <DateRange {...r} onGo={r.go} />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="flex min-h-[104px] items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/80 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <CheckCircle2 className="h-6 w-6 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-blue-900">
              Total Debit
            </p>
            <p className="mt-0.5 text-xl font-bold text-blue-700">
              {money(data?.totalDebit)}
            </p>
          </div>
        </div>

        <div className="flex min-h-[104px] items-center gap-3 rounded-lg border border-green-100 bg-green-50/80 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-green-900">
              Total Credit
            </p>
            <p className="mt-0.5 text-xl font-bold text-green-700">
              {money(data?.totalCredit)}
            </p>
          </div>
        </div>

        <div
          className={`flex min-h-[104px] items-center gap-3 rounded-lg border p-5 ${
            data?.balanced === false
              ? 'border-red-100 bg-red-50/80'
              : 'border-green-100 bg-green-50/80'
          }`}
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              data?.balanced === false ? 'bg-red-100' : 'bg-green-100'
            }`}
          >
            <Check
              className={`h-6 w-6 ${
                data?.balanced === false ? 'text-red-600' : 'text-green-600'
              }`}
            />
          </div>
          <div className="min-w-0">
            <p
              className={`text-xs font-medium ${
                data?.balanced === false ? 'text-red-900' : 'text-green-900'
              }`}
            >
              Balance Status
            </p>
            <p
              className={`mt-0.5 text-xl font-bold ${
                data?.balanced === false ? 'text-red-700' : 'text-green-700'
              }`}
            >
              {data?.balanced === false ? 'Unbalanced' : 'Balanced'}
            </p>
            <p
              className={`text-xs ${
                data?.balanced === false ? 'text-red-700' : 'text-green-700'
              }`}
            >
              Difference: {money(data?.difference)}
            </p>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b bg-white px-5 py-4 font-semibold">
          Trial Balance Report ({reportDate(data?.from)} - {reportDate(data?.to)})
        </div>

        <Table>
          <THead>
            <TR>
              <TH className="px-5">Account Code</TH>
              <TH>Account Name</TH>
              <TH>Type</TH>
              <TH className="text-right">Debit (₦)</TH>
              <TH className="px-5 text-right">Credit (₦)</TH>
            </TR>
          </THead>

          <TBody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Nothing to show yet
                </TD>
              </TR>
            ) : (
              rows.map((x: any, i: number) => (
                <TR key={x.code ?? i}>
                  <TD className="px-5 font-medium">{x.code}</TD>
                  <TD>{x.name}</TD>
                  <TD>
                    <Badge variant={typeVariant(String(x.type ?? ''))}>
                      {x.type}
                    </Badge>
                  </TD>
                  <TD className="text-right font-medium tabular-nums">
                    {amount(x.debit)}
                  </TD>
                  <TD className="px-5 text-right font-medium tabular-nums">
                    {amount(x.credit)}
                  </TD>
                </TR>
              ))
            )}

            {rows.length > 0 && (
              <TR className="bg-slate-50 font-bold hover:bg-slate-50">
                <TD colSpan={3} className="px-5">
                  Totals
                </TD>
                <TD className="text-right tabular-nums">
                  {money(data?.totalDebit)}
                </TD>
                <TD className="px-5 text-right tabular-nums">
                  {money(data?.totalCredit)}
                </TD>
              </TR>
            )}
          </TBody>
        </Table>

        <div className="border-t bg-white px-5 py-3 text-xs text-muted-foreground">
          Report generated on {generatedAt}
        </div>
      </Card>
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

  const assets = data?.assets ?? [];
  const liabilities = data?.liabilities ?? [];
  const equity = data?.equity ?? [];

  const retainedEarnings = Number(data?.retainedEarnings ?? 0);
  const totalAssets = Number(data?.totalAssets ?? 0);
  const totalLiabilities = Number(data?.totalLiabilities ?? 0);
  const totalEquity = Number(data?.totalEquity ?? 0);

  const difference = totalAssets - totalLiabilities - totalEquity;
  const isBalanced = data?.balanced === true;

  const reportDate = asAt
    ? new Date(`${asAt}T00:00:00`).toLocaleDateString()
    : '';

  const csvEscape = (value: unknown) =>
    `"${String(value ?? '').replace(/"/g, '""')}"`;

  const exportCsv = () => {
    if (!data) return;

    const rows: unknown[][] = [
      ['BALANCE SHEET'],
      ['As at', asAt],
      [],
      ['ASSETS'],
      ['Account Code', 'Account Name', 'Amount'],
      ...assets.map((item: any) => [
        item.code,
        item.name,
        item.amount,
      ]),
      ['TOTAL ASSETS', '', totalAssets],
      [],
      ['LIABILITIES'],
      ['Account Code', 'Account Name', 'Amount'],
      ...liabilities.map((item: any) => [
        item.code,
        item.name,
        item.amount,
      ]),
      ['TOTAL LIABILITIES', '', totalLiabilities],
      [],
      ['EQUITY'],
      ['Account Code', 'Account Name', 'Amount'],
      ...equity.map((item: any) => [
        item.code,
        item.name,
        item.amount,
      ]),
      ['RE', 'Retained earnings', retainedEarnings],
      ['TOTAL EQUITY', '', totalEquity],
      [],
      ['TOTAL LIABILITIES AND EQUITY', '', totalLiabilities + totalEquity],
      ['DIFFERENCE', '', difference],
      ['STATUS', '', isBalanced ? 'Balanced' : 'Out of balance'],
    ];

    const csv = rows
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `balance-sheet-${asAt}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const section = (
    title: string,
    description: string,
    rows: any[],
    total: number,
    tone: string,
  ) => (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/30 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {description}
            </p>
          </div>
         <Badge variant="gray">{rows.length} accounts</Badge>
        </div>
      </div>

      <div className="p-4">
        {rows.length > 0 ? (
          <div className="space-y-0">
            {rows.map((item: any) => (
              <div
                key={item.code}
                className="flex items-center justify-between gap-4 border-b py-3 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="font-medium">{item.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Account code: {item.code}
                  </div>
                </div>
                <div className="shrink-0 text-right font-medium tabular-nums">
                  {money(item.amount)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No account balances recorded for this section.
          </div>
        )}

        <div className="mt-3 flex items-center justify-between border-t pt-4">
          <span className="font-semibold">Total {title}</span>
          <span className={`text-base font-bold tabular-nums ${tone}`}>
            {money(total)}
          </span>
        </div>
      </div>
    </Card>
  );

  const equityRows = [
    ...equity,
    {
      code: 'RE',
      name: 'Retained earnings',
      amount: retainedEarnings,
    },
  ];

  return (
    <>
      <PageHeader title="Balance Sheet">
        <Button
          variant="outline"
          onClick={exportCsv}
          disabled={!data}
        >
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
        <PrintButton />
      </PageHeader>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">
              Statement of Financial Position
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              A summary of the hotel's assets, liabilities and equity.
            </p>
          </div>

          <Field label="Reporting Date">
            <Input
              type="date"
              className="w-44"
              value={asAt}
              onChange={(e) => setAsAt(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4 border-t pt-3 text-sm text-muted-foreground">
          Reporting position as at{' '}
          <span className="font-semibold text-foreground">
            {reportDate}
          </span>
        </div>
      </Card>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat
          tone="blue"
          label="Total Assets"
          value={money(data?.totalAssets)}
        />
        <Stat
          tone="orange"
          label="Total Liabilities"
          value={money(data?.totalLiabilities)}
        />
        <Stat
          tone="purple"
          label="Total Equity"
          value={money(data?.totalEquity)}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          {section(
            'Assets',
            'Resources owned or controlled by the hotel',
            assets,
            totalAssets,
            'text-blue-600',
          )}
        </div>

        <div className="space-y-4">
          {section(
            'Liabilities',
            'Amounts owed by the hotel',
            liabilities,
            totalLiabilities,
            'text-orange-600',
          )}

          {section(
            'Equity',
            'Owners’ interest and accumulated earnings',
            equityRows,
            totalEquity,
            'text-purple-600',
          )}
        </div>
      </div>

      <Card className="mt-4 p-4">
        <h3 className="font-semibold">
          Accounting Equation
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Total Assets must equal Total Liabilities plus Total Equity.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">
              Total Assets
            </div>
            <div className="mt-1 font-semibold tabular-nums">
              {money(totalAssets)}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">
              Liabilities + Equity
            </div>
            <div className="mt-1 font-semibold tabular-nums">
              {money(totalLiabilities + totalEquity)}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">
              Difference
            </div>
            <div className="mt-1 font-semibold tabular-nums">
              {money(difference)}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t pt-4">
          {isBalanced ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="green">Balanced</Badge>
              <span className="text-sm text-muted-foreground">
                The accounting equation is satisfied.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="red">Out of balance</Badge>
              <span className="text-sm text-muted-foreground">
                The accounting equation does not currently balance.
              </span>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}



export function CashFlow() {
  const r = useRange();
  const { data } = useGet('/finance/reports/cash-flow', r.ap);

  const cashAtBeginning = Number(data?.cashAtBeginning ?? 0);
  const operating = Number(data?.operating ?? 0);
  const investing = Number(data?.investing ?? 0);
  const financing = Number(data?.financing ?? 0);

  const netChange = operating + investing + financing;

  const cashAtEnd = Number(
    data?.cashAtEnd ?? cashAtBeginning + netChange,
  );

  const reportPeriod =
    data?.from && data?.to
      ? `${d(data.from)} – ${d(data.to)}`
      : 'Selected reporting period';

  const movementLabel =
    netChange > 0
      ? 'Positive cash movement'
      : netChange < 0
        ? 'Negative cash movement'
        : 'No net cash movement';

  const movementDescription =
    netChange > 0
      ? `Cash increased by ${money(netChange)} during the reporting period.`
      : netChange < 0
        ? `Cash decreased by ${money(Math.abs(netChange))} during the reporting period.`
        : 'There was no net change in cash during the reporting period.';

  const positionLabel =
    cashAtEnd > 0
      ? 'Positive cash position'
      : cashAtEnd < 0
        ? 'Negative cash position'
        : 'Zero cash position';

  return (
    <>
      <PageHeader title="Cash Flow Statement">
        <PrintButton />
      </PageHeader>

      <DateRange {...r} onGo={r.go} />

      {/* Cash flow overview */}
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Stat
          tone="blue"
          label="Cash at Beginning"
          value={money(cashAtBeginning)}
        />

        <Stat
          tone="green"
          label="Operating Activities"
          value={money(operating)}
        />

        <Stat
          tone="purple"
          label="Investing Activities"
          value={money(investing)}
        />

        <Stat
          tone="yellow"
          label="Financing Activities"
          value={money(financing)}
        />
      </div>

      {/* Formal cash flow statement */}
      <Card className="overflow-hidden">
        <div className="border-b bg-slate-50 px-5 py-4">
          <h3 className="font-semibold text-slate-800">
            Cash Flow Statement
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            For the period: {reportPeriod}
          </p>
        </div>

        <div className="p-5">
          <div className="mb-5">
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">
              Cash and Cash Equivalents
            </h4>

            <div className="flex items-center justify-between border-b py-3 text-sm">
              <span className="text-slate-600">
                Cash at Beginning of Period
              </span>
              <span className="font-semibold tabular-nums">
                {money(cashAtBeginning)}
              </span>
            </div>
          </div>

          <div className="mb-5">
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">
              Cash Flows from Operating Activities
            </h4>

            <div className="flex items-center justify-between border-b py-3 text-sm">
              <span className="text-slate-600">
                Net Cash from Operating Activities
              </span>
              <span className="font-semibold tabular-nums">
                {money(operating)}
              </span>
            </div>
          </div>

          <div className="mb-5">
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">
              Cash Flows from Investing Activities
            </h4>

            <div className="flex items-center justify-between border-b py-3 text-sm">
              <span className="text-slate-600">
                Net Cash from Investing Activities
              </span>
              <span className="font-semibold tabular-nums">
                {money(investing)}
              </span>
            </div>
          </div>

          <div className="mb-5">
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">
              Cash Flows from Financing Activities
            </h4>

            <div className="flex items-center justify-between border-b py-3 text-sm">
              <span className="text-slate-600">
                Net Cash from Financing Activities
              </span>
              <span className="font-semibold tabular-nums">
                {money(financing)}
              </span>
            </div>
          </div>

          <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-blue-900">
                Net Increase / (Decrease) in Cash
              </span>
              <span className="text-base font-bold tabular-nums text-blue-900">
                {money(netChange)}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-slate-800">
                Cash at End of Period
              </span>
              <span className="text-xl font-bold tabular-nums text-slate-900">
                {money(cashAtEnd)}
              </span>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Opening cash balance plus net cash movement during the reporting period.
            </p>
          </div>
        </div>
      </Card>

      {/* Cash Flow Analysis */}
      <Card className="mt-5 overflow-hidden">
        <div className="border-b bg-slate-50 px-5 py-4">
          <h3 className="font-semibold text-slate-800">
            Cash Flow Analysis
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Analysis of cash movements for {reportPeriod}
          </p>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-muted-foreground">
              Overall Cash Movement
            </p>

            <p
              className={`mt-2 text-lg font-bold ${
                netChange < 0 ? 'text-red-600' : 'text-green-700'
              }`}
            >
              {movementLabel}
            </p>

            <p className="mt-2 text-sm text-slate-600">
              {movementDescription}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-muted-foreground">
              Operating Cash Flow
            </p>

            <p className="mt-2 text-lg font-bold text-slate-900">
              {money(operating)}
            </p>

            <p className="mt-2 text-sm text-slate-600">
              {operating > 0
                ? 'Operating activities contributed a net increase in cash.'
                : operating < 0
                  ? 'Operating activities resulted in a net decrease in cash.'
                  : 'No net operating cash movement was recorded.'}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-muted-foreground">
              Investing Activities
            </p>

            <p className="mt-2 text-lg font-bold text-slate-900">
              {money(investing)}
            </p>

            <p className="mt-2 text-sm text-slate-600">
              Net cash movement classified under investing activities.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-muted-foreground">
              Financing Activities
            </p>

            <p className="mt-2 text-lg font-bold text-slate-900">
              {money(financing)}
            </p>

            <p className="mt-2 text-sm text-slate-600">
              Net cash movement classified under financing activities.
            </p>
          </div>
        </div>

        <div className="border-t bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-700">
              Net Cash Movement
            </span>
            <span className="text-lg font-bold tabular-nums text-slate-900">
              {money(netChange)}
            </span>
          </div>
        </div>
      </Card>

      {/* Cash Position Summary */}
      <Card className="mt-5 overflow-hidden">
        <div className="border-b bg-slate-50 px-5 py-4">
          <h3 className="font-semibold text-slate-800">
            Cash Position Summary
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Overview of the opening and closing cash position
          </p>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-3">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-800">
              Opening Cash Balance
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-blue-950">
              {money(cashAtBeginning)}
            </p>
            <p className="mt-2 text-xs text-blue-700">
              Cash available at the beginning of the period.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-600">
              Net Cash Movement
            </p>
            <p
              className={`mt-2 text-xl font-bold tabular-nums ${
                netChange < 0 ? 'text-red-700' : 'text-green-700'
              }`}
            >
              {netChange > 0 ? '+' : ''}
              {money(netChange)}
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Combined movement across the reported activities.
            </p>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">
              Closing Cash Balance
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-green-950">
              {money(cashAtEnd)}
            </p>
            <p className="mt-2 text-xs text-green-700">
              {positionLabel} at the end of the reporting period.
            </p>
          </div>
        </div>

        <div className="border-t px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-800">
                Closing Cash Position
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Opening balance plus net cash movement.
              </p>
            </div>

            <p className="text-2xl font-bold tabular-nums text-slate-900">
              {money(cashAtEnd)}
            </p>
          </div>
        </div>
      </Card>

      {/* Reporting Note */}
      {data?.note && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">
            Reporting Note
          </p>
          <p className="mt-1 text-sm text-amber-700">
            {data.note}
          </p>
        </div>
      )}
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
