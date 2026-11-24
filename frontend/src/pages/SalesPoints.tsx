import { useState } from 'react';

import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';

import { Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/pages/groups/shared';

type SalesPoint = {
  id: string;
  name: string;
  location: string | null;
  isActive: boolean;
  itemCount: number;
  transactionCount: number;
};

const INVALIDATE = ['/sales-points', '/sales-points/overview'];

function SalesPointForm({ sp, onClose }: { sp: SalesPoint | null; onClose: () => void }) {
  const [name, setName] = useState(sp?.name ?? '');
  const [location, setLocation] = useState(sp?.location ?? '');

  const save = useAction(
    (body: { name: string; location: string }) =>
      sp ? api.put(`/sales-points/${sp.id}`, body) : api.post('/sales-points', body),
    {
      success: sp ? 'Sales point updated' : 'Sales point created',
      invalidate: INVALIDATE,
      onSuccess: () => onClose(),
    },
  );

  return (
    <Modal title={sp ? 'Edit Sales Point' : 'Add New Sales Point'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name *">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Main Restaurant" />
        </Field>
        <Field label="Location">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., Ground Floor" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={save.isPending || !name.trim()}
            onClick={() => save.mutate({ name: name.trim(), location: location.trim() })}
          >
            {save.isPending ? 'Saving…' : sp ? 'Save Changes' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteSalesPoint({ sp, onClose }: { sp: SalesPoint; onClose: () => void }) {
  const del = useAction(() => api.del(`/sales-points/${sp.id}`), {
    success: 'Sales point updated',
    invalidate: INVALIDATE,
    onSuccess: () => onClose(),
  });
  const hasRecords = sp.itemCount > 0 || sp.transactionCount > 0;

  return (
    <Modal title={hasRecords ? 'Remove sales point' : 'Delete sales point'} onClose={onClose}>
      <p className="text-sm">
        {hasRecords ? 'Remove' : 'Delete'} <b>{sp.name}</b>?
      </p>
      <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        {hasRecords ? (
          <>
            It has {sp.itemCount} item(s) and {sp.transactionCount} transaction(s), so it will be{' '}
            <b>deactivated</b> instead of deleted. Its history stays intact.
          </>
        ) : (
          <>
            A sales point that has never been used is deleted for good. If it turns out to have
            orders or stock returns, it is deactivated instead.
          </>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <button
          type="button"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          disabled={del.isPending}
          onClick={() => del.mutate(undefined)}
        >
          {del.isPending ? 'Working…' : hasRecords ? 'Deactivate instead' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}

export default function SalesPoints() {
  const { data, isLoading } = useGet<SalesPoint[]>('/sales-points/overview');
  const [editing, setEditing] = useState<SalesPoint | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SalesPoint | null>(null);

   const toggle = useAction(
    (sp: SalesPoint) => api.put(`/sales-points/${sp.id}`, { isActive: !sp.isActive }),
    { success: 'Sales point updated', invalidate: INVALIDATE },
  );

  const onToggle = (sp: SalesPoint) => {
    if (sp.isActive && !window.confirm(`Deactivate ${sp.name}? It will no longer be available for sales.`)) return;
    toggle.mutate(sp);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Sales Points Management</h1>
        <button
          type="button"
          className="rounded-md bg-blue-600 px-5 py-2.5 text-base font-medium text-white hover:bg-blue-700"
          onClick={() => setEditing('new')}
        >
          Add New Sales Point
        </button>
      </div>

      <Card className="p-0">
        <div className="border-b px-8 py-5 text-xl font-semibold">All Sales Points</div>

        <div className="p-8">
          {isLoading && <p className="py-8 text-center text-muted-foreground">Loading…</p>}
          {!isLoading && !data?.length && (
            <p className="py-8 text-center text-muted-foreground">No sales points yet.</p>
          )}

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {data?.map((sp) => (
              <div
                key={sp.id}
                className={`rounded-lg border p-5 ${
                  sp.isActive ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-100'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-medium">{sp.name}</h2>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      sp.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {sp.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <p className="mt-1 text-slate-600">{sp.location || '—'}</p>

                <div className="mt-5 space-y-1 text-slate-700">
                  <div>Items: {sp.itemCount}</div>
                  <div>Transactions: {sp.transactionCount}</div>
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700"
                    onClick={() => setEditing(sp)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={toggle.isPending}
                    className={`flex-1 rounded-md py-2 text-white disabled:opacity-50 ${
                      sp.isActive ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
                    }`}
                    onClick={() => onToggle(sp)}
                  >
                    {sp.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-md bg-red-600 py-2 text-white hover:bg-red-700"
                    onClick={() => setDeleting(sp)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {editing && (
        <SalesPointForm sp={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {deleting && <DeleteSalesPoint sp={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}