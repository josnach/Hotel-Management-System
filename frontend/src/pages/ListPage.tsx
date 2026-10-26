import { useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/common';
import { ListCard, type Col } from '@/components/DataTable';
import { Input } from '@/components/ui/input';
import { useGet } from '@/lib/hooks';

/** Generic read-only list screen: endpoint + columns. Used for the long tail of simple screens. */
export function ListPage<T = any>({ title, subtitle, endpoint, params, pick, cols, search, actions, empty }: {
  title: string; subtitle?: string; endpoint: string; params?: Record<string, unknown>; pick?: (data: any) => T[];
  cols: Col<T>[]; search?: boolean; actions?: ReactNode; empty?: string;
}) {
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useGet(endpoint, { ...params, ...(search ? { q } : {}) });
  const rows = pick ? pick(data) : (data as T[] | undefined);
  return (
    <>
      <PageHeader title={title} subtitle={subtitle}>{search && <Input className="w-64" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}{actions}</PageHeader>
      <ListCard rows={rows} loading={isLoading} error={error} cols={cols} empty={empty} />
    </>
  );
}
