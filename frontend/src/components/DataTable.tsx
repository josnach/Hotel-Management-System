import { type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Empty, ErrorBox, Loading } from './common';

export interface Col<T> { header: string; cell: (row: T) => ReactNode; className?: string }

export function DataTable<T>({ rows, cols, loading, error, empty, rowClass }: { rows?: T[]; cols: Col<T>[]; loading?: boolean; error?: unknown; empty?: string; rowClass?: (r: T) => string | undefined }) {
  if (error) return <ErrorBox error={error} />;
  if (loading) return <Loading />;
  if (!rows?.length) return <Empty>{empty}</Empty>;
  return (
    <Table>
      <THead><TR>{cols.map((c) => <TH key={c.header} className={c.className}>{c.header}</TH>)}</TR></THead>
      <TBody>{rows.map((r, i) => <TR key={(r as any).id ?? i} className={rowClass?.(r)}>{cols.map((c) => <TD key={c.header} className={c.className}>{c.cell(r)}</TD>)}</TR>)}</TBody>
    </Table>
  );
}

/** A titled card wrapping a table, used by most list screens. */
export function ListCard<T>({ title, ...p }: { title?: string } & Parameters<typeof DataTable<T>>[0]) {
  return <Card className="overflow-hidden">{title && <div className="border-b px-5 py-3 font-semibold">{title}</div>}<DataTable {...p} /></Card>;
}
