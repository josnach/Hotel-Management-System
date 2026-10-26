
import { useState } from 'react';

import { Link, useNavigate } from 'react-router-dom';

import { Plus } from 'lucide-react';

import { api } from '@/lib/api';

import { useAuth } from '@/lib/auth';

import { useAction, useGet } from '@/lib/hooks';

import { dt, money, num } from '@/lib/utils';

import {
  Field,
  FilterBar,
  PageHeader,
  PrintButton,
  Stat,
} from '@/components/common';

import { ListCard } from '@/components/DataTable';

import { Badge, statusVariant } from '@/components/ui/badge';

import { Button } from '@/components/ui/button';

import { Card } from '@/components/ui/card';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { Input, NativeSelect } from '@/components/ui/input';

import { ListPage } from './ListPage';

const SECTIONS = [
  ['FOOD', 'Foods'],
  ['DRINKS', 'Drinks'],
  ['PASTRIES', 'Pastries'],
] as const;

type ItemDialogProps = {
  open: boolean;
  onClose: () => void;
  item?: any;
};

function ItemDialog({ open, onClose, item }: ItemDialogProps) {
  const { user } = useAuth();
  const canPrice = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const editing = !!item;

  const { data: cats } = useGet<any[]>('/inventory/categories');
  const { data: sps } = useGet<any[]>('/sales-points');

  const [f, setF] = useState<any>(() =>
    editing
      ? {
          name: item.name ?? '',
          description: item.description ?? '',
          categoryId: item.categoryId ?? item.category?.id ?? '',
          salesPointId: item.salesPointId ?? item.salesPoint?.id ?? '',
          sellPrice: String(item.sellPrice ?? ''),
          costPrice: String(item.costPrice ?? ''),
          minLevel: Number(item.minLevel ?? 5),
        }
      : {
          name: '',
          description: '',
          categoryId: '',
          salesPointId: '',
          sellPrice: '',
          costPrice: '',
          quantity: '',
          minLevel: 5,
        },
  );

  const save = useAction(
    () => {
      const body = {
        name: f.name.trim(),
        description: f.description,
        categoryId: f.categoryId,
        salesPointId: f.salesPointId,
        sellPrice: Number(f.sellPrice),
        costPrice: Number(f.costPrice || 0),
        minLevel: Number(f.minLevel),
      };

      return editing
        ? api.put(`/inventory/items/${item.id}`, body)
        : api.post('/inventory/items', {
            ...body,
            quantity: Number(f.quantity || 0),
          });
    },
    {
      success: editing ? 'Item updated' : 'Item added',
      invalidate: ['/inventory/items', '/sales-points'],
      onSuccess: onClose,
    },
  );

  const s = (key: string) => (e: any) => {
    const value = e.target.value;

    setF((prev: any) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Edit Item' : 'Add New Item'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name">
            <Input
              value={f.name}
              onChange={s('name')}
              placeholder="Enter item name"
            />
          </Field>

          <Field label="Description">
            <Input
              value={f.description}
              onChange={s('description')}
              placeholder="Enter item description"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Category">
              <NativeSelect
                value={f.categoryId}
                onChange={s('categoryId')}
              >
                <option value="">Select category</option>

                {SECTIONS.map(([key, label]) => {
                  const sectionCategories = cats?.filter(
                    (category: any) => category.section === key,
                  );

                  if (!sectionCategories?.length) return null;

                  return (
                    <optgroup key={key} label={label}>
                      {sectionCategories.map((category: any) => (
                        <option
                          key={category.id}
                          value={category.id}
                        >
                          {category.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </NativeSelect>
            </Field>

            <Field label="Sales Point">
              <NativeSelect
                value={f.salesPointId}
                onChange={s('salesPointId')}
              >
                <option value="">Select sales point</option>

                {sps?.map((salesPoint: any) => (
                  <option
                    key={salesPoint.id}
                    value={salesPoint.id}
                  >
                    {salesPoint.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Selling price (₦)">
              <Input
                type="number"
                min="0"
                step="0.01"
                disabled={!canPrice}
                value={f.sellPrice}
                onChange={s('sellPrice')}
                placeholder="0.00"
              />
            </Field>

            <Field label="Cost price (₦)">
              <Input
                type="number"
                min="0"
                step="0.01"
                disabled={!canPrice}
                value={f.costPrice}
                onChange={s('costPrice')}
                placeholder="0.00"
              />
            </Field>

            {!editing && (
              <Field label="Opening stock">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={f.quantity}
                  onChange={s('quantity')}
                  placeholder="0"
                />
              </Field>
            )}

            <Field label="Low-stock level">
              <Input
                type="number"
                min="0"
                step="1"
                value={f.minLevel}
                onChange={s('minLevel')}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={save.isPending}
            >
              Cancel
            </Button>

            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => save.mutate(undefined)}
              disabled={
                save.isPending ||
                !f.name.trim() ||
                !f.categoryId ||
                !f.salesPointId ||
                f.sellPrice === '' ||
                !Number.isFinite(Number(f.sellPrice)) ||
                Number(f.sellPrice) < 0 ||
                !Number.isFinite(Number(f.costPrice || 0)) ||
                Number(f.costPrice || 0) < 0 ||
                !Number.isFinite(Number(f.minLevel)) ||
                Number(f.minLevel) < 0 ||
                (!editing &&
                  (!Number.isFinite(Number(f.quantity || 0)) ||
                    Number(f.quantity || 0) < 0))
              }
            >
              {save.isPending
                ? 'Saving...'
                : editing
                  ? 'Save changes'
                  : 'Save item'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const canPrice = user?.role === 'ADMIN' || user?.role === 'MANAGER'; // only they add/delete items or change prices

  const [f, setF] = useState({
    q: '',
    categoryId: '',
    salesPointId: '',
  });

  const [applied, setApplied] = useState({ ...f });

  const [page, setPage] = useState(1);

  const [add, setAdd] = useState(false);

  const [editingItem, setEditingItem] = useState<any>(null);

  const { data, isLoading } = useGet('/inventory/items', {
    ...applied,
    page,
  });

  const { data: cats } = useGet<any[]>('/inventory/categories');

  const { data: sps } = useGet<any[]>('/sales-points');

  const adjust = useAction(
    (v: { id: string; delta: number; reason: string }) =>
      api.post(`/inventory/items/${v.id}/adjust`, v),
    {
      success: 'Adjustment submitted for approval',
      invalidate: ['/inventory/adjustments'],
    },
  );

  const del = useAction(
    (id: string) => api.del(`/inventory/items/${id}`),
    {
      success: 'Item removed',
      invalidate: ['/inventory/items'],
    },
  );

  const ask = (id: string) => {
    const delta = Number(
      prompt(
        'Quantity change (use a negative number to reduce stock)',
      ),
    );

    if (!delta || !Number.isFinite(delta)) return;

    const reason = prompt('Reason for adjustment?');

    if (reason) {
      adjust.mutate({ id, delta, reason });
    }
  };

  const openAddDialog = () => {
    setEditingItem(null);
    setAdd(true);
  };

  const openEditDialog = (item: any) => {
    setAdd(false);
    setEditingItem(item);
  };

  const closeItemDialog = () => {
    setAdd(false);
    setEditingItem(null);
  };

  return (
    <>
      <PageHeader title="Inventory Items">
        {canPrice && (        <Button
          className="bg-indigo-600 hover:bg-indigo-700"
          onClick={openAddDialog}
        >
          <Plus className="h-4 w-4" />
          Add New Item
        </Button>)}
      </PageHeader>

      <FilterBar>
        <Field label="Item Name">
          <Input
            placeholder="Search items…"
            value={f.q}
            onChange={(e) =>
              setF({ ...f, q: e.target.value })
            }
          />
        </Field>

        <Field label="Category">
          <NativeSelect
            value={f.categoryId}
            onChange={(e) =>
              setF({ ...f, categoryId: e.target.value })
            }
          >
            <option value="">All Categories</option>

            {cats?.map((category: any) => (
              <option
                key={category.id}
                value={category.id}
              >
                {category.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Sales Point">
          <NativeSelect
            value={f.salesPointId}
            onChange={(e) =>
              setF({ ...f, salesPointId: e.target.value })
            }
          >
            <option value="">All Sales Points</option>

            {sps?.map((salesPoint: any) => (
              <option
                key={salesPoint.id}
                value={salesPoint.id}
              >
                {salesPoint.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="flex items-end">
          <Button
            className="w-full bg-indigo-600 hover:bg-indigo-700"
            onClick={() => {
              setApplied({ ...f });
              setPage(1);
            }}
          >
            Apply Filters
          </Button>
        </div>
      </FilterBar>

      <p className="mb-2 text-sm text-muted-foreground">
        Showing {data?.rows?.length ?? 0} of {data?.total ?? 0}{' '}
        items
      </p>

      <ListCard
        rows={data?.rows}
        loading={isLoading}
        cols={[
          {
            header: 'Name',
            cell: (i: any) => (
              <div>
                <div className="font-medium">{i.name}</div>
                <div className="text-xs text-muted-foreground">
                  {i.description}
                </div>
              </div>
            ),
          },
          {
            header: 'Category',
            cell: (i: any) => (
              <Badge variant="blue">
                {i.category?.name ?? 'Uncategorized'}
              </Badge>
            ),
          },
          {
            header: 'Sales Point',
            cell: (i: any) =>
              i.salesPoint?.name ?? '—',
          },
          {
            header: 'Price',
            cell: (i: any) => (
              <div className="text-xs">
                <span className="text-green-600">
                  Sell: {money(i.sellPrice)}
                </span>
                <br />
                <span className="text-muted-foreground">
                  Cost: {money(i.costPrice)}
                </span>
              </div>
            ),
          },
          {
            header: 'Stock',
            cell: (i: any) => (
              <Badge variant={statusVariant(i.status)}>
                {num(i.quantity)}
              </Badge>
            ),
          },
          {
            header: 'Actions',
            cell: (i: any) => (
              <div className="flex flex-wrap gap-3 text-xs font-medium">
                <Link
                  className="text-blue-700"
                  to={`/inventory/bin-card?item=${i.id}`}
                >
                  View
                </Link>

                <button
                  type="button"
                  className="text-indigo-600 hover:text-indigo-800"
                  onClick={() => openEditDialog(i)}
                >
                  Edit
                </button>

                <button
                  type="button"
                  className="text-orange-600"
                  onClick={() => ask(i.id)}
                >
                  Adjust Stock
                </button>

                {canPrice && (                <button
                  type="button"
                  className="text-red-600"
                  onClick={() =>
                    confirm(`Remove ${i.name}?`) &&
                    del.mutate(i.id)
                  }
                >
                  Delete
                </button>)}
              </div>
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
          disabled={(data?.rows?.length ?? 0) < 10}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>

      {(add || editingItem) && (
        <ItemDialog
          key={editingItem?.id ?? 'new-item'}
          open={add || !!editingItem}
          item={editingItem ?? undefined}
          onClose={closeItemDialog}
        />
      )}
    </>
  );
}

/** Shared by Inventory Stock Position and Store Stock Position. */
export function StockPosition({
  scope,
}: {
  scope: 'inventory' | 'stores';
}) {
  const { data } = useGet(`/${scope}/stock-position`);

  const t = data?.totals;

  const title =
    scope === 'inventory'
      ? 'Inventory Stock Position Report'
      : 'Store Stock Position Report';

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={title}
        subtitle="Current stock levels by category"
      >
        <PrintButton label="Print Report" />
      </PageHeader>

      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <Stat label="TOTAL ITEMS" value={t?.items ?? 0} />

        <Stat
          label="STOCK VALUE"
          value={
            <span className="text-green-700">
              {money(t?.stockValue)}
            </span>
          }
        />

        <Stat
          label="SELLING VALUE"
          value={
            <span className="text-blue-700">
              {money(t?.sellingValue)}
            </span>
          }
        />

        <Stat
          label="LOW STOCK"
          value={
            <span className="text-orange-600">
              {t?.lowStock ?? 0}
            </span>
          }
        />

        <Stat
          label="OUT OF STOCK"
          value={
            <span className="text-red-600">
              {t?.outOfStock ?? 0}
            </span>
          }
        />
      </div>

      {data?.groups?.map((g: any) => (
        <Card
          key={g.category}
          className="mb-4 overflow-hidden"
        >
          <div className="flex justify-between bg-slate-100 px-4 py-2 text-sm font-semibold">
            <span>
              {g.category}{' '}
              <span className="font-normal text-muted-foreground">
                {g.items.length} items
              </span>
            </span>

            <span>Stock Value: {money(g.stockValue)}</span>
          </div>

          <table className="w-full text-xs">
            <thead className="border-b text-muted-foreground">
              <tr>
                {[
                  'S/N',
                  'Code',
                  'Item Name',
                  scope === 'inventory' ? 'Sales Point' : 'Store',
                  'Cost',
                  'Sell',
                  'Qty',
                  'Value',
                  'Status',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-1.5 text-left"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {g.items.map((r: any, i: number) => {
                const it =
                  scope === 'inventory' ? r : r.item;

                return (
                  <tr key={r.id} className="border-b">
                    <td className="px-3 py-1.5">
                      {i + 1}
                    </td>

                    <td className="px-3">{it.code}</td>

                    <td className="px-3">{it.name}</td>

                    <td className="px-3">
                      {scope === 'inventory'
                        ? r.salesPoint?.name
                        : r.store?.name}
                    </td>

                    <td className="px-3">
                      {money(it.costPrice)}
                    </td>

                    <td className="px-3">
                      {money(it.sellPrice)}
                    </td>

                    <td className="px-3">
                      {num(r.quantity, 0)}
                    </td>

                    <td className="px-3">
                      {money(r.value)}
                    </td>

                    <td className="px-3">
                      <Badge variant={statusVariant(r.status)}>
                        {r.status === 'IN' ? 'In' : r.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

export function BinCard({
  scope,
}: {
  scope: 'inventory' | 'stores';
}) {
  const nav = useNavigate();

  const item =
    new URLSearchParams(window.location.search).get('item') ?? '';

  const [itemId, setItemId] = useState(item);

  const [storeId, setStoreId] = useState('');

  const { data: items } = useGet<any>(
    '/inventory/items',
    { pageSize: 200 },
  );

  const { data: stores } = useGet<any[]>(
    '/stores',
    undefined,
    scope === 'stores',
  );

  const inv = useGet(
    `/inventory/items/${itemId}/bin-card`,
    undefined,
    scope === 'inventory' && !!itemId,
  );

  const st = useGet<any[]>(
    '/stores/bin-card',
    { storeId, itemId },
    scope === 'stores' && !!itemId && !!storeId,
  );

  const rows =
    scope === 'inventory'
      ? inv.data?.movements
      : st.data;

  return (
    <>
      <PageHeader
        title={
          scope === 'inventory'
            ? 'Inventory Bin Card'
            : 'Bin Card Management'
        }
      />

      <FilterBar>
        {scope === 'stores' && (
          <Field label="Store">
            <NativeSelect
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
            >
              <option value="">Choose a store</option>

              {stores?.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}

        <Field label="Item">
          <NativeSelect
            value={itemId}
            onChange={(e) => {
              setItemId(e.target.value);
              nav(`?item=${e.target.value}`, {
                replace: true,
              });
            }}
          >
            <option value="">Choose an item</option>

            {items?.rows?.map((i: any) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </FilterBar>

      <ListCard
        rows={rows}
        empty="Choose an item to see its movement history"
        cols={[
          {
            header: 'Date',
            cell: (m: any) => dt(m.createdAt),
          },
          {
            header: 'Type',
            cell: (m: any) => (
              <Badge>{m.type.replace('_', ' ')}</Badge>
            ),
          },
          {
            header: 'Reference',
            cell: (m: any) => m.reference ?? '—',
          },
          {
            header: 'Quantity',
            cell: (m: any) => (
              <span
                className={
                  Number(m.quantity) < 0
                    ? 'text-red-600'
                    : 'text-green-600'
                }
              >
                {num(m.quantity, 0)}
              </span>
            ),
          },
          {
            header: 'Balance',
            cell: (m: any) => (
              <b>{num(m.balance, 0)}</b>
            ),
          },
        ]}
      />
    </>
  );
}

export function Adjustments({
  scope,
}: {
  scope: 'inventory' | 'stores';
}) {
  const approve = useAction(
    (v: { id: string; approve: boolean }) =>
      api.post(`/inventory/adjustments/${v.id}/decide`, {
        approve: v.approve,
      }),
    {
      success: 'Decision saved',
      invalidate: ['/inventory/adjustments'],
    },
  );

  return (
    <ListPage
      title={
        scope === 'inventory'
          ? 'Pending Adjustments'
          : 'Store Stock Adjustments'
      }
      endpoint="/inventory/adjustments"
      pick={(d) =>
        (d ?? []).filter((a: any) =>
          scope === 'stores' ? a.storeId : !a.storeId,
        )
      }
      cols={[
        {
          header: 'Date',
          cell: (a: any) => dt(a.createdAt),
        },
        {
          header: 'Item',
          cell: (a: any) => a.item.name,
        },
        {
          header: 'Change',
          cell: (a: any) => (
            <b
              className={
                Number(a.delta) < 0
                  ? 'text-red-600'
                  : 'text-green-600'
              }
            >
              {num(a.delta, 0)}
            </b>
          ),
        },
        {
          header: 'Reason',
          cell: (a: any) => a.reason,
        },
        {
          header: 'Requested by',
          cell: (a: any) => a.requestedBy.username,
        },
        {
          header: 'Status',
          cell: (a: any) => (
            <Badge variant={statusVariant(a.status)}>
              {a.status}
            </Badge>
          ),
        },
        {
          header: 'Actions',
          cell: (a: any) =>
            a.status === 'PENDING' && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="success"
                  onClick={() =>
                    approve.mutate({
                      id: a.id,
                      approve: true,
                    })
                  }
                >
                  Approve
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    approve.mutate({
                      id: a.id,
                      approve: false,
                    })
                  }
                >
                  Reject
                </Button>
              </div>
            ),
        },
      ]}
    />
  );
}
