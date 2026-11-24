
import { useMemo, useState } from 'react';
import { useGet } from '@/lib/hooks';
import { dt, money, today } from '@/lib/utils';
import {
  Empty,
  ErrorBox,
  Field,
  Loading,
  PageHeader,
  PrintButton,
  Stat,
} from '@/components/common';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';

type Filters = {
  start: string;
  end: string;
  salesPointIds: string[];
  method: string;
  userId: string;
};

const initialFilters = (): Filters => ({
  start: today(),
  end: today(),
  salesPointIds: [],
  method: '',
  userId: '',
});

function useSalesFilters() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [applied, setApplied] = useState<Filters>(initialFilters);

  const params = useMemo(() => ({
    start: applied.start,
    end: applied.end,
    salesPointIds: applied.salesPointIds.join(','),
    method: applied.method,
    userId: applied.userId,
  }), [applied]);

  const apply = () => setApplied({ ...filters });
  const reset = () => {
    const next = initialFilters();
    setFilters(next);
    setApplied(next);
  };

  const toggleSalesPoint = (id: string) => {
    setFilters((current) => ({
      ...current,
      salesPointIds: current.salesPointIds.includes(id)
        ? current.salesPointIds.filter((value) => value !== id)
        : [...current.salesPointIds, id],
    }));
  };

  return {
    filters,
    setFilters,
    applied,
    params,
    apply,
    reset,
    toggleSalesPoint,
  };
}

function ReportFilters({
  filters,
  setFilters,
  apply,
  reset,
  showSalesPoints = true,
  showMethod = true,
  showUser = true,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  apply: () => void;
  reset: () => void;
  showSalesPoints?: boolean;
  showMethod?: boolean;
  showUser?: boolean;
}) {
  const { data: salesPoints } = useGet<any[]>('/sales-points');

  return (
    <Card className="mb-4 space-y-4 p-4">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Start Date">
          <Input
            type="date"
            value={filters.start}
            onChange={(event) => setFilters((f) => ({ ...f, start: event.target.value }))}
          />
        </Field>

        <Field label="End Date">
          <Input
            type="date"
            value={filters.end}
            onChange={(event) => setFilters((f) => ({ ...f, end: event.target.value }))}
          />
        </Field>

        {showMethod && (
          <Field label="Payment Method">
            <NativeSelect
              value={filters.method}
              onChange={(event) => setFilters((f) => ({ ...f, method: event.target.value }))}
            >
              <option value="">All Methods</option>
              {['CASH', 'CARD', 'TRANSFER', 'ROOM_CHARGE', 'STAFF_CREDIT', 'CITY_LEDGER'].map((method) => (
                <option key={method} value={method}>{method.replace('_', ' ')}</option>
              ))}
            </NativeSelect>
          </Field>
        )}

        {showUser && (
          <Field label="User ID">
            <Input
              value={filters.userId}
              placeholder="Filter by user ID"
              onChange={(event) => setFilters((f) => ({ ...f, userId: event.target.value }))}
            />
          </Field>
        )}
      </div>

      {showSalesPoints && (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">Sales Points</span>
            <button
              type="button"
              className="text-xs text-blue-700"
              onClick={() => setFilters((f) => ({
                ...f,
                salesPointIds: salesPoints?.map((point) => point.id) ?? [],
              }))}
            >
              Select All
            </button>
            <button
              type="button"
              className="text-xs text-blue-700"
              onClick={() => setFilters((f) => ({ ...f, salesPointIds: [] }))}
            >
              Clear All
            </button>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {salesPoints?.map((point) => (
              <label key={point.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.salesPointIds.includes(point.id)}
                  onChange={() => setFilters((f) => ({
                    ...f,
                    salesPointIds: f.salesPointIds.includes(point.id)
                      ? f.salesPointIds.filter((id) => id !== point.id)
                      : [...f.salesPointIds, point.id],
                  }))}
                />
                {point.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={apply}>Apply Filters</Button>
        <Button variant="outline" onClick={reset}>Reset Filters</Button>
      </div>
    </Card>
  );
}

function ReportTable({
  headers,
  children,
  empty = 'No transactions found for the selected criteria.',
}: {
  headers: string[];
  children: React.ReactNode;
  empty?: string;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              {headers.map((header) => (
                <th key={header} className="whitespace-nowrap px-3 py-3 font-semibold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {!hasRows && <Empty>{empty}</Empty>}
    </Card>
  );
}

function TableRow({ children }: { children: React.ReactNode }) {
  return <tr className="border-t">{children}</tr>;
}

function Cell({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-3 py-3 ${right ? 'text-right' : ''}`}>
      {children ?? '—'}
    </td>
  );
}

export function SalesReportsOverview() {
  const report = useSalesFilters();
  const { data, isLoading, error } = useGet<any>(
    '/reports/sales-reports/overview',
    report.params,
  );

  return (
    <>
      <PageHeader title="Sales Reports" subtitle="Sales performance across hotel sales points">
        <PrintButton />
      </PageHeader>

      <ReportFilters
        filters={report.filters}
        setFilters={report.setFilters}
        apply={report.apply}
        reset={report.reset}
        showMethod={false}
        showUser={false}
      />

      {isLoading && <Loading />}
      {error && <ErrorBox error={error} />}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="blue" label="Total Sales" value={money(data?.totalSales)} />
        <Stat tone="green" label="Total Payments" value={money(data?.totalPayments)} />
        <Stat tone="purple" label="Transactions" value={data?.transactions ?? 0} />
        <Stat tone="yellow" label="Customers" value={data?.customers ?? 0} />
      </div>

      <h2 className="mb-2 font-semibold">Sales by Sales Point</h2>
      <ReportTable headers={['Sales Point', 'Total Sales', 'Total Payments', 'Net', 'Transactions', 'Customers']}>
        {data?.groups?.map((group: any) => (
          <TableRow key={group.salesPointId}>
            <Cell>{group.salesPoint}</Cell>
            <Cell right>{money(group.totalSales)}</Cell>
            <Cell right>{money(group.totalPayments)}</Cell>
            <Cell right>{money(group.net)}</Cell>
            <Cell right>{group.transactions}</Cell>
            <Cell right>{group.customers}</Cell>
          </TableRow>
        ))}
      </ReportTable>
    </>
  );
}

export function DetailedSalesReport() {
  const report = useSalesFilters();
  const { data, isLoading, error } = useGet<any>(
    '/reports/sales-reports/detailed',
    report.params,
  );

  return (
    <>
      <PageHeader title="Detailed Sales Report" subtitle="Transaction-level sales and payment details">
        <PrintButton />
      </PageHeader>

      <ReportFilters
        filters={report.filters}
        setFilters={report.setFilters}
        apply={report.apply}
        reset={report.reset}
      />

      {isLoading && <Loading />}
      {error && <ErrorBox error={error} />}

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat label="Total Transactions" value={data?.totalTransactions ?? 0} />
        <Stat tone="blue" label="Total Sales" value={money(data?.totalSales)} />
        <Stat tone="green" label="Total Payments" value={money(data?.totalPayments)} />
      </div>

      <ReportTable headers={['Date & Time', 'Sales Point', 'Description', 'Customer', 'Type', 'Amount Paid']}>
        {data?.transactions?.map((transaction: any) => (
          <TableRow key={transaction.id}>
            <Cell>{dt(transaction.date)}</Cell>
            <Cell>{transaction.salesPoint}</Cell>
            <Cell>{transaction.description || transaction.orderNo}</Cell>
            <Cell>{transaction.customer}</Cell>
            <Cell>
              <span className={transaction.type === 'CREDIT' ? 'font-medium text-green-700' : 'font-medium text-orange-700'}>
                {transaction.type === 'CREDIT' ? 'Payment' : 'Bill'}
              </span>
            </Cell>
            <Cell right>{money(transaction.amountPaid)}</Cell>
          </TableRow>
        ))}
      </ReportTable>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Stat label="Total Billing" value={money(data?.totalBilling)} />
        <Stat tone="green" label="Total Payments" value={money(data?.totalPayments)} />
        <Stat tone="yellow" label="Balance Amount" value={money(data?.totalBalance)} />
      </div>
    </>
  );
}

export function ControlSheetReport() {
  const report = useSalesFilters();
  const { data, isLoading, error } = useGet<any>(
    '/reports/sales-reports/control-sheet',
    report.params,
  );

  return (
    <>
      <PageHeader title="Control Sheet" subtitle="Printable sales transaction control sheet">
        <PrintButton />
      </PageHeader>

      <ReportFilters
        filters={report.filters}
        setFilters={report.setFilters}
        apply={report.apply}
        reset={report.reset}
        showMethod={false}
        showUser={false}
      />

      {isLoading && <Loading />}
      {error && <ErrorBox error={error} />}

      <Card className="mb-4 p-4">
        <h2 className="text-center text-lg font-bold">CONTROL SHEET</h2>
        <p className="text-center text-sm text-muted-foreground">
          {report.applied.start} — {report.applied.end}
        </p>
      </Card>

      <ReportTable headers={['Date & Time', 'Order No.', 'Sales Point', 'Customer', 'Description', 'Qty', 'Total']}>
        {data?.transactions?.map((transaction: any) => (
          <TableRow key={transaction.id}>
            <Cell>{dt(transaction.date)}</Cell>
            <Cell>{transaction.orderNo}</Cell>
            <Cell>{transaction.salesPoint}</Cell>
            <Cell>{transaction.customer}</Cell>
            <Cell>{transaction.description}</Cell>
            <Cell right>{transaction.quantity}</Cell>
            <Cell right>{money(transaction.total)}</Cell>
          </TableRow>
        ))}
      </ReportTable>

      <div className="mt-4 flex justify-end">
        <div className="w-full max-w-xs">
          <Stat label="Grand Total" value={money(data?.grandTotal)} />
        </div>
      </div>
    </>
  );
}

export function SalesSummaryReport() {
  const report = useSalesFilters();
  const [transactionType, setTransactionType] = useState('ALL_TYPES');

  const params = {
    ...report.params,
    transactionType,
  };

  const { data, isLoading, error } = useGet<any>(
    '/reports/sales-reports/summary',
    params,
  );

  const maxDaily = Math.max(
    1,
    ...(data?.dailyTrend ?? []).map((day: any) => Number(day.bills ?? 0)),
  );

  return (
    <>
      <PageHeader title="Sales Summary Report" subtitle="Payments, bills, refunds and daily sales activity">
        <PrintButton />
      </PageHeader>

      <ReportFilters
        filters={report.filters}
        setFilters={report.setFilters}
        apply={report.apply}
        reset={report.reset}
      />

      <Card className="mb-4 p-4">
        <Field label="Transaction Type">
          <NativeSelect value={transactionType} onChange={(event) => setTransactionType(event.target.value)}>
            <option value="ALL_TYPES">All Types</option>
            <option value="CREDIT">Credit (Payment)</option>
            <option value="DEBIT">Debit (Bill)</option>
          </NativeSelect>
        </Field>
      </Card>

      {isLoading && <Loading />}
      {error && <ErrorBox error={error} />}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="green" label="Total Payments" value={money(data?.totalPayments)} />
        <Stat tone="blue" label="Total Bills" value={money(data?.totalBills)} />
        <Stat tone="yellow" label="POS Refunds" value={data?.posRefundTrackingAvailable ? money(data?.posRefunds) : 'Not tracked'} sub="No separate POS refund records exist yet" />
        <Stat tone="purple" label="Net Sales" value={money(data?.netSales)} />
      </div>

      <Card className="mb-4 p-4">
        <h2 className="mb-2 font-semibold">City Ledger Refunds (Separate)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          These refunds are not deducted from POS sales or included in POS refund totals.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total" value={money(data?.cityLedgerRefunds?.total)} />
          <Stat label="Cash" value={money(data?.cityLedgerRefunds?.cash)} />
          <Stat label="Bank Transfer" value={money(data?.cityLedgerRefunds?.bankTransfer)} />
          <Stat label="Credit Note" value={money(data?.cityLedgerRefunds?.creditNote)} />
        </div>
      </Card>

      <h2 className="mb-2 font-semibold">Sales by Sales Point</h2>
      <ReportTable headers={['Sales Point', 'Payments', 'Refunds', 'Bills', 'Net Sales']}>
        {data?.salesByPoint?.map((point: any) => (
          <TableRow key={point.salesPointId}>
            <Cell>{point.salesPoint}</Cell>
            <Cell right>{money(point.payments)}</Cell>
            <Cell right>{money(point.refunds)}</Cell>
            <Cell right>{money(point.bills)}</Cell>
            <Cell right>{money(point.netSales)}</Cell>
          </TableRow>
        ))}
      </ReportTable>

      <h2 className="mb-2 mt-5 font-semibold">Daily Sales Trend</h2>
      <Card className="mb-4 space-y-3 p-4">
        {!data?.dailyTrend?.length && <Empty>No daily sales data for this period.</Empty>}
        {data?.dailyTrend?.map((day: any) => (
          <div key={day.date} className="grid grid-cols-[100px_1fr_100px] items-center gap-3 text-sm">
            <span>{day.date}</span>
            <div className="h-5 overflow-hidden rounded bg-slate-100">
              <div
                className="h-full rounded bg-blue-600"
                style={{ width: `${Math.max(1, Number(day.bills) / maxDaily * 100)}%` }}
              />
            </div>
            <span className="text-right font-medium">{money(day.bills)}</span>
          </div>
        ))}
      </Card>

      <h2 className="mb-2 font-semibold">Detailed Transactions</h2>
      <ReportTable headers={['Date & Time', 'Sales Point', 'Description', 'Type', 'Amount', 'Payment Method', 'User']}>
        {data?.transactions?.map((transaction: any) => (
          <TableRow key={transaction.id}>
            <Cell>{dt(transaction.date)}</Cell>
            <Cell>{transaction.salesPoint}</Cell>
            <Cell>{transaction.description || transaction.orderNo}</Cell>
            <Cell>{transaction.type === 'CREDIT' ? 'Payment' : 'Bill'}</Cell>
            <Cell right>{money(transaction.amount)}</Cell>
            <Cell>{transaction.paymentMethod}</Cell>
            <Cell>{transaction.user}</Cell>
          </TableRow>
        ))}
      </ReportTable>
    </>
  );
}

export function ItemSalesSummary() {
  const report = useSalesFilters();
  const { data, isLoading, error } = useGet<any>(
    '/reports/sales-reports/items',
    report.params,
  );

  return (
    <>
      <PageHeader title="Item Sales Summary" subtitle="Items sold by category, quantity, VAT and sales value">
        <PrintButton />
      </PageHeader>

      <ReportFilters
        filters={report.filters}
        setFilters={report.setFilters}
        apply={report.apply}
        reset={report.reset}
        showMethod={false}
        showUser={false}
      />

      {isLoading && <Loading />}
      {error && <ErrorBox error={error} />}

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat tone="blue" label="Total Items Sold" value={data?.totalItemsSold ?? 0} />
        <Stat tone="green" label="Total Sales Value" value={money(data?.totalSalesValue)} />
        <Stat tone="purple" label="Total VAT" value={money(data?.totalVat)} />
      </div>

      {data?.categories?.map((category: any) => (
        <Card key={category.categoryId ?? 'uncategorized'} className="mb-4 overflow-hidden">
          <div className="flex justify-between bg-slate-100 px-4 py-3 font-semibold">
            <span>{category.category}</span>
            <span>{money(category.total)}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2">Item Code</th>
                  <th className="px-4 py-2">Item Name</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">VAT</th>
                </tr>
              </thead>
              <tbody>
                {category.items.map((item: any) => (
                  <TableRow key={item.itemId}>
                    <Cell>{item.itemCode}</Cell>
                    <Cell>{item.itemName}</Cell>
                    <Cell right>{money(item.price)}</Cell>
                    <Cell right>{item.quantity}</Cell>
                    <Cell right>{money(item.total)}</Cell>
                    <Cell right>{money(item.vat)}</Cell>
                  </TableRow>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      <div className="flex justify-end">
        <div className="w-full max-w-sm">
          <Stat label="Grand Total" value={money(data?.totalSalesValue)} sub={`VAT: ${money(data?.totalVat)}`} />
        </div>
      </div>
    </>
  );
}

export function DetailedSalesSummaryReport() {
  const report = useSalesFilters();
  const { data, isLoading, error } = useGet<any>(
    '/reports/sales-reports/detailed-summary',
    report.params,
  );

  return (
    <>
      <PageHeader title="Detailed Sales Summary" subtitle="Sales-point totals with itemized breakdown">
        <PrintButton />
      </PageHeader>

      <ReportFilters
        filters={report.filters}
        setFilters={report.setFilters}
        apply={report.apply}
        reset={report.reset}
      />

      {isLoading && <Loading />}
      {error && <ErrorBox error={error} />}

      {data?.salesPoints?.map((point: any) => (
        <Card key={point.salesPointId} className="mb-4 overflow-hidden">
          <div className="flex flex-wrap justify-between gap-3 bg-slate-100 px-4 py-3">
            <h2 className="font-semibold">{point.salesPoint}</h2>
            <div className="flex gap-4 text-sm">
              <span>Sales: <b>{money(point.totalSales)}</b></span>
              <span>Payments: <b>{money(point.totalPayments)}</b></span>
              <span>Transactions: <b>{point.transactions}</b></span>
            </div>
          </div>

          <ReportTable headers={['Item Code', 'Item Name', 'Category', 'Quantity', 'Total']}>
            {point.items.map((item: any) => (
              <TableRow key={item.itemId}>
                <Cell>{item.itemCode}</Cell>
                <Cell>{item.itemName}</Cell>
                <Cell>{item.category}</Cell>
                <Cell right>{item.quantity}</Cell>
                <Cell right>{money(item.total)}</Cell>
              </TableRow>
            ))}
          </ReportTable>
        </Card>
      ))}

      {!isLoading && !error && !data?.salesPoints?.length && (
        <Card className="p-8"><Empty>No sales points found for this period.</Empty></Card>
      )}
    </>
  );
}
