
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Plus, Trash2, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { d, dt, money } from '@/lib/utils';
import { Field, PageHeader, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive?: boolean;
};

type JournalLineInput = {
  accountId: string;
  side: 'DEBIT' | 'CREDIT';
  amount: string;
  memo: string;
};

const emptyFilters = {
  start: '',
  end: '',
  accountId: '',
  type: '',
  txnNo: '',
};

const newLine = (): JournalLineInput => ({
  accountId: '',
  side: 'DEBIT',
  amount: '',
  memo: '',
});

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? '');
          return `"${text.replace(/"/g, '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');

  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
  );

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function formatDate(value?: string) {
  return value ? d(value) : '—';
}

function JournalHeaderActions() {
  const nav = useNavigate();

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => nav('/finance/accounts')}>
        Chart of Accounts
      </Button>
      <Button onClick={() => nav('/finance/journal/new')}>
        <Plus className="mr-2 h-4 w-4" />
        New Entry
      </Button>
    </div>
  );
}

export function Journal() {
  const nav = useNavigate();

  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const { data: accounts } = useGet<Account[]>('/finance/accounts');

  const { data, isLoading } = useGet<any>(
    '/finance/journal',
    { ...applied, page },
  );

  const rows = data?.rows ?? [];

  const exportCsv = () => {
    downloadCsv('journal-entries.csv', [
      [
        'Date',
        'Transaction Number',
        'Reference',
        'Account Code',
        'Account',
        'Entry Type',
        'Description',
        'Memo',
        'Amount',
      ],
      ...rows.map((row: any) => [
        formatDate(row.date),
        row.txnNo,
        row.reference,
        row.accountCode,
        row.account,
        row.type,
        row.description,
        row.memo,
        row.amount,
      ]),
    ]);
  };

  const applyFilters = () => {
    const clean = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== ''),
    );

    setApplied(clean);
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setApplied({});
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Journal Entries">
        <JournalHeaderActions />
      </PageHeader>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Field label="Start Date">
            <Input
              type="date"
              value={filters.start}
              onChange={(e) =>
                setFilters({ ...filters, start: e.target.value })
              }
            />
          </Field>

          <Field label="End Date">
            <Input
              type="date"
              value={filters.end}
              onChange={(e) =>
                setFilters({ ...filters, end: e.target.value })
              }
            />
          </Field>

          <Field label="Account">
            <NativeSelect
              value={filters.accountId}
              onChange={(e) =>
                setFilters({ ...filters, accountId: e.target.value })
              }
            >
              <option value="">All Accounts</option>
              {accounts?.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} — {account.name}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Entry Type">
            <NativeSelect
              value={filters.type}
              onChange={(e) =>
                setFilters({ ...filters, type: e.target.value })
              }
            >
              <option value="">All Types</option>
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </NativeSelect>
          </Field>

          <Field label="Transaction Number">
            <Input
              type="number"
              placeholder="Transaction number"
              value={filters.txnNo}
              onChange={(e) =>
                setFilters({ ...filters, txnNo: e.target.value })
              }
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={applyFilters}>Apply Filters</Button>
          <Button variant="outline" onClick={clearFilters}>
            Clear Filters
          </Button>
        </div>
      </Card>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat
          tone="blue"
          label="Total Debits"
          value={money(data?.totalDebits ?? 0)}
        />
        <Stat
          tone="green"
          label="Total Credits"
          value={money(data?.totalCredits ?? 0)}
        />
        <Stat
          tone={data?.balanced === false ? 'red' : 'green'}
          label="Balance Status"
          value={data?.balanced === false ? 'Unbalanced' : 'Balanced'}
          sub={`Difference: ${money(data?.difference ?? 0)}`}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {data?.total ?? 0} journal lines found
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={!rows.length}
          onClick={exportCsv}
        >
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <ListCard
        title="Journal Entries"
        rows={rows}
        loading={isLoading}
        cols={[
          {
            header: 'Date',
            cell: (row: any) => formatDate(row.date),
          },
          {
            header: 'Transaction',
            cell: (row: any) => (
              <button
                type="button"
                className="font-semibold text-blue-700 hover:underline"
                onClick={() =>
                  nav(`/finance/journal/${row.entryId}`)
                }
              >
                #{row.txnNo}
              </button>
            ),
          },
          {
            header: 'Reference',
            cell: (row: any) => row.reference || '—',
          },
          {
            header: 'Account',
            cell: (row: any) => (
              <div>
                <div className="font-medium">{row.account}</div>
                <div className="text-xs text-muted-foreground">
                  {row.accountCode}
                </div>
              </div>
            ),
          },
          {
            header: 'Type',
            cell: (row: any) => (
              <Badge variant={row.type === 'Debit' ? 'blue' : 'green'}>
                {row.type}
              </Badge>
            ),
          },
          {
            header: 'Description',
            cell: (row: any) => (
              <span className="text-xs">{row.description}</span>
            ),
          },
          {
            header: 'Amount',
            cell: (row: any) => (
              <span
                className={
                  row.type === 'Debit'
                    ? 'font-semibold text-blue-700'
                    : 'font-semibold text-green-700'
                }
              >
                {money(row.amount)}
              </span>
            ),
          },
          {
            header: 'Action',
            cell: (row: any) => (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  nav(`/finance/journal/${row.entryId}`)
                }
              >
                <Eye className="mr-1 h-4 w-4" />
                View
              </Button>
            ),
          },
        ]}
      />

      <div className="mt-4 flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous
        </Button>

        <span className="flex items-center px-3 text-sm">
          Page {page}
        </span>

        <Button
          size="sm"
          variant="outline"
          disabled={rows.length < 50}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </Button>
      </div>
    </>
  );
}

export function JournalCreate() {
  const nav = useNavigate();

  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalLineInput[]>([
    newLine(),
    { ...newLine(), side: 'CREDIT' },
  ]);

  const { data: accounts } = useGet<Account[]>('/finance/accounts');

  const activeAccounts = useMemo(
    () => (accounts ?? []).filter((account) => account.isActive !== false),
    [accounts],
  );

  const totalDebit = lines.reduce(
    (sum, line) =>
      sum + (line.side === 'DEBIT' ? Number(line.amount || 0) : 0),
    0,
  );

  const totalCredit = lines.reduce(
    (sum, line) =>
      sum + (line.side === 'CREDIT' ? Number(line.amount || 0) : 0),
    0,
  );

  const difference = totalDebit - totalCredit;

  const updateLine = (
    index: number,
    patch: Partial<JournalLineInput>,
  ) => {
    setLines((current) =>
      current.map((line, i) =>
        i === index ? { ...line, ...patch } : line,
      ),
    );
  };

  const addLine = () => {
    setLines((current) => [...current, newLine()]);
  };

  const removeLine = (index: number) => {
    setLines((current) => current.filter((_, i) => i !== index));
  };

  const mutation = useAction(
    (body: any) => api.post('/finance/journal', body),
    {
      success: 'Journal entry posted successfully.',
      invalidate: ['/finance/journal', '/finance/reports'],
      onSuccess: (result: any) => {
        if (result?.id) {
          nav(`/finance/journal/${result.id}`);
        } else {
          nav('/finance/journal');
        }
      },
    },
  );

  const validLines = lines.filter(
    (line) =>
      line.accountId &&
      Number(line.amount) > 0 &&
      Number.isFinite(Number(line.amount)),
  );

  const canSubmit =
    description.trim().length >= 3 &&
    validLines.length >= 2 &&
    validLines.length === lines.length &&
    totalDebit > 0 &&
    totalCredit > 0 &&
    Math.abs(difference) < 0.005 &&
    !mutation.isPending;

  const submit = () => {
    if (!canSubmit) return;

    mutation.mutate({
      date: date || undefined,
      reference: reference.trim() || undefined,
      description: description.trim(),
      lines: lines.map((line) => ({
        code: activeAccounts.find(
          (account) => account.id === line.accountId,
        )?.code,
        debit: line.side === 'DEBIT' ? Number(line.amount) : 0,
        credit: line.side === 'CREDIT' ? Number(line.amount) : 0,
        memo: line.memo.trim() || undefined,
      })),
    });
  };

  return (
    <>
      <PageHeader title="New Journal Entry">
        <Button
          variant="outline"
          onClick={() => nav('/finance/journal')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Journal
        </Button>
      </PageHeader>

      <Card className="mb-4 p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Journal Date">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          <Field label="Reference Number">
            <Input
              placeholder="Optional reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>

          <Field label="Description">
            <Input
              placeholder="Describe this journal transaction"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="mb-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h3 className="font-semibold">Journal Lines</h3>
            <p className="text-sm text-muted-foreground">
              Every journal entry must have equal debit and credit totals.
            </p>
          </div>

          <Button size="sm" variant="outline" onClick={addLine}>
            <Plus className="mr-2 h-4 w-4" />
            Add Line
          </Button>
        </div>

        <div className="space-y-4 p-4">
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid items-end gap-3 rounded-lg border p-3 md:grid-cols-12"
            >
              <div className="md:col-span-4">
                <Field label={`Account ${index + 1}`}>
                  <NativeSelect
                    value={line.accountId}
                    onChange={(e) =>
                      updateLine(index, { accountId: e.target.value })
                    }
                  >
                    <option value="">Select account</option>
                    {activeAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} — {account.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>

              <div className="md:col-span-2">
                <Field label="Entry Type">
                  <NativeSelect
                    value={line.side}
                    onChange={(e) =>
                      updateLine(index, {
                        side: e.target.value as 'DEBIT' | 'CREDIT',
                      })
                    }
                  >
                    <option value="DEBIT">Debit</option>
                    <option value="CREDIT">Credit</option>
                  </NativeSelect>
                </Field>
              </div>

              <div className="md:col-span-2">
                <Field label="Amount (₦)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={line.amount}
                    onChange={(e) =>
                      updateLine(index, { amount: e.target.value })
                    }
                  />
                </Field>
              </div>

              <div className="md:col-span-3">
                <Field label="Line Description">
                  <Input
                    placeholder="Optional memo"
                    value={line.memo}
                    onChange={(e) =>
                      updateLine(index, { memo: e.target.value })
                    }
                  />
                </Field>
              </div>

              <div className="flex justify-end md:col-span-1">
                <Button
                  size="icon"
                  variant="destructive"
                  disabled={lines.length <= 2}
                  title="Remove line"
                  onClick={() => removeLine(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat
          tone="blue"
          label="Total Debits"
          value={money(totalDebit)}
        />
        <Stat
          tone="green"
          label="Total Credits"
          value={money(totalCredit)}
        />
        <Stat
          tone={Math.abs(difference) < 0.005 ? 'green' : 'red'}
          label="Difference"
          value={money(Math.abs(difference))}
          sub={
            Math.abs(difference) < 0.005
              ? 'Entry is balanced'
              : difference > 0
                ? 'Debits exceed credits'
                : 'Credits exceed debits'
          }
        />
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm text-muted-foreground">
          The journal will be posted immediately after submission.
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => nav('/finance/journal')}
          >
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {mutation.isPending ? 'Posting...' : 'Post Journal Entry'}
          </Button>
        </div>
      </Card>
    </>
  );
}


export function JournalDetails() {
  const nav = useNavigate();
  const { id } = useParams();

  const { data, isLoading, error } = useGet<any>(
    `/finance/journal/${id}`,
    {},
    Boolean(id),
  );

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading journal entry...
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6">
        <h2 className="font-semibold">Journal entry not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This transaction could not be loaded.
        </p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => nav('/finance/journal')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Journal
        </Button>
      </Card>
    );
  }

  const lines = data.lines ?? [];

  const totalDebit = Number(
    data.totalDebits ?? data.totalDebit ?? 0,
  );

  const totalCredit = Number(
    data.totalCredits ?? data.totalCredit ?? 0,
  );

  const difference = totalDebit - totalCredit;
  const balanced = data.balanced === true;

  return (
    <>
      <PageHeader title={`Journal Transaction #${data.txnNo}`}>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => nav('/finance/journal')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Journal
          </Button>

          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(`journal-${data.txnNo}.csv`, [
                ['Account Code', 'Account Name', 'Memo', 'Debit', 'Credit'],
                ...lines.map((line: any) => [
                  line.code ?? '',
                  line.account ?? '',
                  line.memo ?? '',
                  line.debit ?? 0,
                  line.credit ?? 0,
                ]),
                [
                  '',
                  'TOTAL',
                  '',
                  totalDebit,
                  totalCredit,
                ],
              ])
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </PageHeader>

      {/* Transaction information */}
      <Card className="mb-4 overflow-hidden">
        <div className="border-b bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-800">
                Journal Entry Details
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Transaction #{data.txnNo}
              </p>
            </div>

            <Badge variant={balanced ? 'green' : 'red'}>
              {balanced ? 'Balanced' : 'Unbalanced'}
            </Badge>
          </div>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">
              Transaction Number
            </p>
            <p className="mt-1 font-semibold">
              #{data.txnNo}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">
              Journal Date
            </p>
            <p className="mt-1 font-semibold">
              {formatDate(data.date)}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">
              Reference Number
            </p>
            <p className="mt-1 font-semibold">
              {data.reference || '—'}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">
              Date Created
            </p>
            <p className="mt-1 font-semibold">
              {data.createdAt ? formatDate(data.createdAt) : '—'}
            </p>
          </div>
        </div>

        <div className="border-t px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Transaction Description
          </p>
          <p className="mt-1 text-sm font-medium">
            {data.description || '—'}
          </p>
        </div>
      </Card>

      {/* Debit and credit summary */}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat
          tone="blue"
          label="Total Debit"
          value={money(totalDebit)}
        />

        <Stat
          tone="green"
          label="Total Credit"
          value={money(totalCredit)}
        />

        <Stat
          tone={balanced ? 'green' : 'red'}
          label="Balance Difference"
          value={money(Math.abs(difference))}
          sub={balanced ? 'Journal entry is balanced' : 'Journal entry is not balanced'}
        />
      </div>

      {/* Journal lines */}
      <Card className="overflow-hidden">
        <div className="border-b px-5 py-4">
          <h3 className="font-semibold text-slate-800">
            Journal Entry Lines
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Detailed debit and credit postings for this transaction.
          </p>
        </div>

        <ListCard
          title="Account Postings"
          rows={lines}
          loading={false}
          cols={[
            {
              header: 'Account Code',
              cell: (line: any) => (
                <span className="font-medium">
                  {line.code || '—'}
                </span>
              ),
            },
            {
              header: 'Account Name',
              cell: (line: any) => (
                <span className="font-medium">
                  {line.account || '—'}
                </span>
              ),
            },
            {
              header: 'Description',
              cell: (line: any) => (
                <span className="text-xs">
                  {line.memo || '—'}
                </span>
              ),
            },
            {
              header: 'Debit (₦)',
              cell: (line: any) => (
                <span className="font-semibold tabular-nums text-blue-700">
                  {Number(line.debit ?? 0) > 0
                    ? money(line.debit)
                    : '—'}
                </span>
              ),
            },
            {
              header: 'Credit (₦)',
              cell: (line: any) => (
                <span className="font-semibold tabular-nums text-green-700">
                  {Number(line.credit ?? 0) > 0
                    ? money(line.credit)
                    : '—'}
                </span>
              ),
            },
          ]}
        />

        <div className="border-t bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="font-bold text-slate-800">
              Journal Totals
            </span>

            <div className="flex flex-wrap gap-6 text-sm">
              <span>
                Total Debit:{' '}
                <strong className="text-blue-700">
                  {money(totalDebit)}
                </strong>
              </span>

              <span>
                Total Credit:{' '}
                <strong className="text-green-700">
                  {money(totalCredit)}
                </strong>
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Balance verification */}
      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">
              Accounting Balance Verification
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Total debits must equal total credits.
            </p>
          </div>

          <Badge variant={balanced ? 'green' : 'red'}>
            {balanced ? 'Entry Balanced' : 'Entry Unbalanced'}
          </Badge>
        </div>

        {!balanced && (
          <p className="mt-3 text-sm font-medium text-red-600">
            Difference: {money(Math.abs(difference))}
          </p>
        )}
      </Card>
    </>
  );
}
