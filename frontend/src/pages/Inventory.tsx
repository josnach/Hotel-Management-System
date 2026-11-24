import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
                        <option key={category.id} value={category.id}>
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
                  <option key={salesPoint.id} value={salesPoint.id}>
                    {salesPoint.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Selling price (â‚¦)">
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

            <Field label="Cost price (â‚¦)">
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

function CentralMenuManagement() {
  const { user } = useAuth();

  const canManage =
    user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const { data: menu, isLoading } =
    useGet<any[]>('/inventory/menu');

  const { data: cats } =
    useGet<any[]>('/inventory/categories');

  const { data: sps } =
    useGet<any[]>('/sales-points');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [salesPointFilter, setSalesPointFilter] = useState('');

  const refreshKeys = [
    '/inventory/menu',
    '/inventory/items',
    '/sales-points',
  ];

  const create = useAction(
    () =>
      api.post('/inventory/menu', {
        name: name.trim(),
        description,
        categoryId,
        sellPrice: Number(sellPrice),
      }),
    {
      success: 'Menu item added to all sales points',
      invalidate: refreshKeys,
      onSuccess: () => {
        setName('');
        setDescription('');
        setCategoryId('');
        setSellPrice('');
      },
    },
  );

  const update = useAction(
    (v: any) => api.put(`/inventory/menu/${v.id}`, v.body),
    {
      success: 'Menu item updated across all sales points',
      invalidate: refreshKeys,
      onSuccess: () => setEditing(null),
    },
  );

  const availability = useAction(
    (v: any) =>
      api.patch(`/inventory/menu/${v.id}/availability`, {
        salesPointId: v.salesPointId,
        available: v.available,
      }),
    {
      success: 'Sales-point availability updated',
      invalidate: refreshKeys,
    },
  );

  // Toggle the global active status of a shared menu item.
  const toggleGlobalStatus = (item: any) => {
    update.mutate({
      id: item.id,
      body: {
        isActive: !item.isActive,
      },
    });
  };

  const beginEdit = (item: any) => {
    setEditing({
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      categoryId: item.categoryId ?? item.category?.id ?? '',
      sellPrice: String(item.sellPrice ?? ''),
    });
  };

  const saveEdit = () => {
    if (
      !editing?.name.trim() ||
      !editing.categoryId ||
      editing.sellPrice === '' ||
      !Number.isFinite(Number(editing.sellPrice)) ||
      Number(editing.sellPrice) < 0
    ) {
      return;
    }

    update.mutate({
      id: editing.id,
      body: {
        name: editing.name.trim(),
        description: editing.description,
        categoryId: editing.categoryId,
        sellPrice: Number(editing.sellPrice),
      },
    });
  };

  return (
    <Card className="mb-6 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            Central Menu Setup
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Create each menu item once. Names, categories and selling
            prices are shared across sales points. Global status controls
            whether the item is active, while availability is managed
            separately for each sales point.
          </p>
        </div>

        <Badge variant="gray">Shared menu</Badge>
      </div>

      {canManage && (
        <div className="mb-5 grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Item name">
            <Input
              value={name}
              onChange={(e: any) => setName(e.target.value)}
              placeholder="e.g. Jollof Rice"
            />
          </Field>

          <Field label="Category">
            <NativeSelect
              value={categoryId}
              onChange={(e: any) => setCategoryId(e.target.value)}
            >
              <option value="">Select category</option>

              {SECTIONS.map(([key, label]) => {
                const sectionCats = cats?.filter(
                  (c: any) => c.section === key,
                );

                return sectionCats?.length ? (
                  <optgroup key={key} label={label}>
                    {sectionCats.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </NativeSelect>
          </Field>

          <Field label="Shared selling price (â‚¦)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={sellPrice}
              onChange={(e: any) => setSellPrice(e.target.value)}
              placeholder="0.00"
            />
          </Field>

          <Field label="Description">
            <Input
              value={description}
              onChange={(e: any) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </Field>

          <div className="flex items-end">
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              disabled={
                create.isPending ||
                !name.trim() ||
                !categoryId ||
                sellPrice === '' ||
                !Number.isFinite(Number(sellPrice)) ||
                Number(sellPrice) < 0
              }
              onClick={() => create.mutate(undefined)}
            >
              <Plus className="mr-1 h-4 w-4" />

              {create.isPending
                ? 'Addingâ€¦'
                : 'Add to all sales points'}
            </Button>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Menu items</h3>

        <NativeSelect
          value={salesPointFilter}
          onChange={(e: any) => setSalesPointFilter(e.target.value)}
        >
          <option value="">All sales points</option>

          {sps?.map((sp: any) => (
            <option key={sp.id} value={sp.id}>
              {sp.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {isLoading ? (
        <p className="py-4 text-sm text-slate-500">
          Loading menuâ€¦
        </p>
      ) : !menu?.length ? (
        <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">
          No menu items yet. Add an item above to make it available
          across all sales points.
        </p>
      ) : (
        <div className="space-y-3">
          {menu.map((item: any) => {
            const salesPoints = (item.salesPoints ?? []).filter(
              (sp: any) =>
                !salesPointFilter || sp.id === salesPointFilter,
            );

            const isGloballyActive = item.isActive !== false;

            return (
              <div
                key={item.id}
                className="rounded-lg border p-3"
              >
                {editing?.id === item.id ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <Field label="Name">
                      <Input
                        value={editing.name}
                        onChange={(e: any) =>
                          setEditing({
                            ...editing,
                            name: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="Category">
                      <NativeSelect
                        value={editing.categoryId}
                        onChange={(e: any) =>
                          setEditing({
                            ...editing,
                            categoryId: e.target.value,
                          })
                        }
                      >
                        <option value="">Select category</option>

                        {SECTIONS.map(([key, label]) => {
                          const sectionCats = cats?.filter(
                            (c: any) => c.section === key,
                          );

                          return sectionCats?.length ? (
                            <optgroup key={key} label={label}>
                              {sectionCats.map((c: any) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </optgroup>
                          ) : null;
                        })}
                      </NativeSelect>
                    </Field>

                    <Field label="Shared price (â‚¦)">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editing.sellPrice}
                        onChange={(e: any) =>
                          setEditing({
                            ...editing,
                            sellPrice: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="Description">
                      <Input
                        value={editing.description}
                        onChange={(e: any) =>
                          setEditing({
                            ...editing,
                            description: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <div className="flex items-end gap-2">
                      <Button
                        onClick={saveEdit}
                        disabled={
                          update.isPending ||
                          !editing.name.trim() ||
                          !editing.categoryId ||
                          editing.sellPrice === '' ||
                          !Number.isFinite(
                            Number(editing.sellPrice),
                          ) ||
                          Number(editing.sellPrice) < 0
                        }
                      >
                        {update.isPending ? 'Savingâ€¦' : 'Save'}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => setEditing(null)}
                        disabled={update.isPending}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {item.name}
                        </span>

                        <span className="text-sm font-normal text-slate-500">
                          {item.category?.name ?? 'Uncategorized'}
                        </span>

                        <Badge
                          variant={
                           isGloballyActive ? 'green' : 'gray'
                          }
                        >
                          {isGloballyActive
                            ? 'Globally Active'
                            : 'Globally Inactive'}
                        </Badge>
                      </div>

                      <div className="mt-1 text-sm text-slate-600">
                        {item.description || 'No description'} Â·{' '}
                        <strong>{money(item.sellPrice)}</strong>
                      </div>

                      {item.priceConflict && (
                        <p className="mt-1 text-sm font-medium text-amber-700">
                          Price mismatch detected in existing records.
                          Edit and save the shared price to synchronize
                          all sales points.
                        </p>
                      )}
                    </div>

                    {canManage && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={update.isPending}
                          className={
                            isGloballyActive
                              ? 'border-red-200 text-red-700 hover:bg-red-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }
                          onClick={() => {
                            const action = isGloballyActive
                              ? 'deactivate'
                              : 'activate';

                            if (
                              confirm(
                                `${action === 'deactivate' ? 'Deactivate' : 'Activate'} "${item.name}" ${action === 'deactivate' ? 'everywhere' : 'for all sales points'}?`,
                              )
                            ) {
                              toggleGlobalStatus(item);
                            }
                          }}
                        >
                          {update.isPending
                            ? 'Updatingâ€¦'
                            : isGloballyActive
                              ? 'Deactivate Everywhere'
                              : 'Activate Everywhere'}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={update.isPending}
                          onClick={() => beginEdit(item)}
                        >
                          Edit shared item
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {salesPoints.map((sp: any) => (
                    <label
                      key={sp.id}
                      className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={!!sp.available}
                        disabled={
                          !canManage ||
                          availability.isPending ||
                          !isGloballyActive
                        }
                        onChange={(e) =>
                          availability.mutate({
                            id: item.id,
                            salesPointId: sp.id,
                            available: e.target.checked,
                          })
                        }
                      />

                      <span>{sp.name}</span>

                      <span
                        className={
                          sp.available
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }
                      >
                        {sp.available ? 'Available' : 'Disabled'}
                      </span>
                    </label>
                  ))}

                  {salesPoints.length === 0 && (
                    <p className="text-sm text-slate-500">
                      No sales points match the selected filter.
                    </p>
                  )}
                </div>

                {!isGloballyActive && (
                  <p className="mt-2 text-xs text-amber-700">
                    This item is globally inactive. Its sales-point
                    availability settings are preserved, but the item
                    should not be offered for sale until reactivated.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function InventoryItemActions({
  item,
  canDelete,
  onDelete,
}: {
  item: any;
  canDelete: boolean;
  onDelete: (item: any) => void;
}) {
  const itemUrl = `/inventory/items/${item.id}`;

  return (
    <details className="relative inline-block text-left">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50">
        Options
        <span className="text-xs">▼</span>
      </summary>

      <div className="absolute right-0 z-40 mt-2 w-44 rounded-lg border bg-white p-1 shadow-lg">
        <Link
          to={itemUrl}
          className="flex items-center rounded-md px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
        >
          View
        </Link>

        <Link
          to={`${itemUrl}/edit`}
          className="flex items-center rounded-md px-3 py-2 text-sm text-purple-700 hover:bg-purple-50"
        >
          Edit
        </Link>

        <Link
          to={`${itemUrl}/adjust-stock`}
          className="flex items-center rounded-md px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
        >
          Adjust Stock
        </Link>

        {canDelete && (
          <>
            <div className="my-1 border-t" />

            <button
              type="button"
              onClick={() => onDelete(item)}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </details>
  );
}

export function ItemView() {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const canSeeCost =
    user?.role === 'ADMIN' ||
    user?.role === 'MANAGER' ||
    user?.role === 'ACCOUNTANT';

  // The existing bin-card endpoint returns both the item and its
  // movement history. This avoids depending on a new backend endpoint.
  const { data, isLoading, isError } = useGet<any>(
    `/inventory/items/${id}/bin-card`,
    undefined,
    Boolean(id),
  );

  const item = data?.item;

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-slate-500">Loading item...</p>;
  }

  if (isError || !item) {
    return (
      <div className="space-y-4">
        <PageHeader title="Item Details" />
        <Card className="p-6">
          <p className="text-sm text-red-600">
            Unable to load this inventory item.
          </p>

          <Button
            className="mt-4"
            variant="outline"
            onClick={() => navigate('/inventory')}
          >
            Back to Inventory
          </Button>
        </Card>
      </div>
    );
  }

  const quantity = Number(item.quantity ?? 0);
  const minLevel = Number(item.minLevel ?? 0);
  const sellPrice = Number(item.sellPrice ?? 0);
  const costPrice = Number(item.costPrice ?? 0);

  const profitPerUnit = sellPrice - costPrice;
  const profitMargin =
    sellPrice > 0 ? (profitPerUnit / sellPrice) * 100 : 0;

  const stockProgress =
    minLevel > 0
      ? Math.min(100, Math.max(0, (quantity / minLevel) * 100))
      : quantity > 0
        ? 100
        : 0;

  const totalInvestment = quantity * costPrice;
  const potentialRevenue = quantity * sellPrice;
  const potentialProfit = potentialRevenue - totalInvestment;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Item Details"
        subtitle={item.name}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => navigate(`/inventory/items/${id}/edit`)}
          >
            Edit Item
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate('/inventory')}
          >
            Back
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canSeeCost && (
          <Card className="p-4">
            <p className="text-sm text-slate-500">Purchase Price</p>
            <p className="mt-2 text-2xl font-semibold">
              {money(item.costPrice)}
            </p>
          </Card>
        )}

        <Card className="p-4">
          <p className="text-sm text-slate-500">Selling Price</p>
          <p className="mt-2 text-2xl font-semibold text-green-700">
            {item.sellPrice == null ? '—' : money(item.sellPrice)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-slate-500">Stock Quantity</p>
          <p className="mt-2 text-2xl font-semibold">
            {num(quantity)}
          </p>
        </Card>

        {canSeeCost && (
          <Card className="p-4">
            <p className="text-sm text-slate-500">Profit Margin</p>
            <p className="mt-2 text-2xl font-semibold text-indigo-700">
              {item.sellPrice == null || item.costPrice == null
                ? '—'
                : `${profitMargin.toFixed(1)}%`}
            </p>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Item Information</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">Item Name</p>
              <p className="mt-1 font-medium">{item.name}</p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Item Code</p>
              <p className="mt-1 font-medium">{item.code ?? '—'}</p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Category</p>
              <p className="mt-1 font-medium">
                {item.category?.name ?? 'Uncategorized'}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Sales Point</p>
              <p className="mt-1 font-medium">
                {item.salesPoint?.name ?? '—'}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Low-stock Level</p>
              <p className="mt-1 font-medium">{num(minLevel)}</p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Status</p>
              <div className="mt-1">
                <Badge variant={statusVariant(item.status)}>
                  {item.status ?? 'Unknown'}
                </Badge>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs text-slate-500">Description</p>
            <p className="mt-1 text-sm">
              {item.description || 'No description provided.'}
            </p>
          </div>

          <div className="border-t pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Created</p>
                <p className="mt-1 text-sm">
                  {item.createdAt ? dt(item.createdAt) : '—'}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Last Updated</p>
                <p className="mt-1 text-sm">
                  {item.updatedAt ? dt(item.updatedAt) : '—'}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="space-y-5 p-5">
          <h2 className="font-semibold">Stock Status</h2>

          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-500">Current Stock</span>
              <span className="font-semibold">{num(quantity)}</span>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${stockProgress}%` }}
              />
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Low-stock level: {num(minLevel)}
            </p>
          </div>

          {canSeeCost && (
            <>
              <div className="border-t pt-4">
                <h3 className="font-semibold">Financial Summary</h3>

                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-500">
                      Total Investment
                    </span>
                    <span className="font-semibold">
                      {money(totalInvestment)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-500">
                      Potential Revenue
                    </span>
                    <span className="font-semibold text-green-700">
                      {item.sellPrice == null
                        ? '—'
                        : money(potentialRevenue)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t pt-3">
                    <span className="text-sm text-slate-500">
                      Total Profit Potential
                    </span>
                    <span className="font-semibold text-indigo-700">
                      {item.sellPrice == null || item.costPrice == null
                        ? '—'
                        : money(potentialProfit)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Recent Stock Movements</h2>

          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              navigate(`/inventory/bin-card?item=${item.id}`)
            }
          >
            View Full Bin Card
          </Button>
        </div>

        <ListCard
          rows={(data?.movements ?? []).slice(0, 5)}
          empty="No stock movements recorded for this item."
          cols={[
            {
              header: 'Date',
              cell: (movement: any) => dt(movement.createdAt),
            },
            {
              header: 'Type',
              cell: (movement: any) => (
                <Badge>{String(movement.type ?? '').replace(/_/g, ' ')}</Badge>
              ),
            },
            {
              header: 'Reference',
              cell: (movement: any) => movement.reference ?? '—',
            },
            {
              header: 'Quantity',
              cell: (movement: any) => num(movement.quantity),
            },
            {
              header: 'Balance',
              cell: (movement: any) => num(movement.balance),
            },
          ]}
        />
      </Card>
    </div>
  );
}


function InventoryItemEditForm({ item }: { item: any }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const canPrice =
    user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const { data: cats } = useGet<any[]>('/inventory/categories');
  const { data: sps } = useGet<any[]>('/sales-points');

  const [f, setF] = useState<any>(() => ({
    name: item.name ?? '',
    description: item.description ?? '',
    categoryId: item.categoryId ?? item.category?.id ?? '',
    salesPointId: item.salesPointId ?? item.salesPoint?.id ?? '',
    sellPrice: String(item.sellPrice ?? ''),
    costPrice: String(item.costPrice ?? ''),
    minLevel: String(item.minLevel ?? 5),
  }));

  const save = useAction(
    (body: any) => api.put(`/inventory/items/${item.id}`, body),
    {
      success: 'Inventory item updated successfully',
      invalidate: ['/inventory/items', '/sales-points'],
      onSuccess: () => navigate(`/inventory/items/${item.id}`),
    },
  );

  const updateField = (key: string) => (e: any) => {
    setF((previous: any) => ({
      ...previous,
      [key]: e.target.value,
    }));
  };

  const submit = () => {
    const body: any = {
      name: f.name.trim(),
      description: f.description,
      categoryId: f.categoryId,
      salesPointId: f.salesPointId,
      minLevel: Number(f.minLevel),
    };

    // Storekeepers can edit item details but cannot set prices.
    if (canPrice) {
      body.sellPrice = Number(f.sellPrice);
      body.costPrice = Number(f.costPrice || 0);
    }

    save.mutate(body);
  };

  const valid =
    f.name.trim() &&
    f.categoryId &&
    f.salesPointId &&
    Number.isFinite(Number(f.minLevel)) &&
    Number(f.minLevel) >= 0 &&
    (
      !canPrice ||
      (
        f.sellPrice !== '' &&
        Number.isFinite(Number(f.sellPrice)) &&
        Number(f.sellPrice) >= 0 &&
        Number.isFinite(Number(f.costPrice || 0)) &&
        Number(f.costPrice || 0) >= 0
      )
    );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Edit Inventory Item"
        subtitle={`Update details for ${item.name}`}
      >
        <Button
          variant="outline"
          onClick={() => navigate(`/inventory/items/${item.id}`)}
        >
          Back
        </Button>
      </PageHeader>

      <Card className="space-y-5 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Item Name">
            <Input
              value={f.name}
              onChange={updateField('name')}
              placeholder="Enter item name"
            />
          </Field>

          <Field label="Category">
            <NativeSelect
              value={f.categoryId}
              onChange={updateField('categoryId')}
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
                      <option key={category.id} value={category.id}>
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
              onChange={updateField('salesPointId')}
            >
              <option value="">Select sales point</option>

              {sps?.map((salesPoint: any) => (
                <option key={salesPoint.id} value={salesPoint.id}>
                  {salesPoint.name}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Low-stock Level">
            <Input
              type="number"
              min="0"
              step="0.001"
              value={f.minLevel}
              onChange={updateField('minLevel')}
            />
          </Field>

          <Field label="Purchase Price (₦)">
            <Input
              type="number"
              min="0"
              step="0.01"
              disabled={!canPrice}
              value={f.costPrice}
              onChange={updateField('costPrice')}
              placeholder="0.00"
            />
          </Field>

          <Field label="Selling Price (₦)">
            <Input
              type="number"
              min="0"
              step="0.01"
              disabled={!canPrice}
              value={f.sellPrice}
              onChange={updateField('sellPrice')}
              placeholder="0.00"
            />
          </Field>
        </div>

        {!canPrice && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            You can update item details, but only an Admin or Manager can
            change purchase and selling prices.
          </p>
        )}

        <Field label="Description">
          <textarea
            className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            value={f.description}
            onChange={updateField('description')}
            placeholder="Enter item description"
          />
        </Field>

        <div className="rounded-lg border bg-slate-50 p-4">
          <h3 className="font-medium">Profit Preview</h3>

          {canPrice ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-500">Purchase Price</p>
                <p className="font-semibold">
                  {money(Number(f.costPrice || 0))}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Selling Price</p>
                <p className="font-semibold">
                  {money(Number(f.sellPrice || 0))}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Profit Per Unit</p>
                <p className="font-semibold text-green-700">
                  {money(
                    Number(f.sellPrice || 0) -
                    Number(f.costPrice || 0),
                  )}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Profit information is available to authorised roles.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => navigate(`/inventory/items/${item.id}`)}
            disabled={save.isPending}
          >
            Cancel
          </Button>

          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={!valid || save.isPending}
            onClick={submit}
          >
            {save.isPending ? 'Updating...' : 'Update Item'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function ItemEdit() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useGet<any>(
    `/inventory/items/${id}/bin-card`,
    undefined,
    Boolean(id),
  );

  if (isLoading) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        Loading item...
      </p>
    );
  }

  if (isError || !data?.item) {
    return (
      <Card className="p-6">
        <p className="text-sm text-red-600">
          Unable to load this inventory item.
        </p>

        <Button
          className="mt-4"
          variant="outline"
          onClick={() => navigate('/inventory')}
        >
          Back to Inventory
        </Button>
      </Card>
    );
  }

  return <InventoryItemEditForm key={data.item.id} item={data.item} />;
}


export function ItemAdjust() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [adjustmentType, setAdjustmentType] = useState<
    'INCREASE' | 'DECREASE'
  >('INCREASE');

  const [quantity, setQuantity] = useState('');
  const [reasonCategory, setReasonCategory] = useState('');
  const [detailedReason, setDetailedReason] = useState('');
  const [notes, setNotes] = useState('');

  const { data, isLoading, isError } = useGet<any>(
    `/inventory/items/${id}/bin-card`,
    undefined,
    Boolean(id),
  );

  const adjust = useAction(
    () =>
      api.post(`/inventory/items/${id}/adjust`, {
        delta:
          adjustmentType === 'INCREASE'
            ? Number(quantity)
            : -Number(quantity),
        reason: detailedReason.trim(),
        reasonCategory,
        notes: notes.trim(),
      }),
    {
      success: 'Stock adjustment submitted for approval',
      invalidate: [
        '/inventory/adjustments',
        '/inventory/items',
      ],
      onSuccess: () => navigate('/inventory/adjustments'),
    },
  );

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading item details...
      </div>
    );
  }

  if (isError || !data?.item) {
    return (
      <Card className="p-6">
        <p className="text-sm text-red-600">
          Unable to load this inventory item.
        </p>

        <Button
          className="mt-4"
          variant="outline"
          onClick={() => navigate('/inventory')}
        >
          Back to Inventory
        </Button>
      </Card>
    );
  }

  const item = data.item;

  const validQuantity =
    quantity.trim() !== '' &&
    Number.isFinite(Number(quantity)) &&
    Number(quantity) > 0;

  const canSubmit =
    validQuantity &&
    Boolean(reasonCategory) &&
    detailedReason.trim().length >= 3;

  const submit = () => {
    if (!canSubmit) return;
    adjust.mutate(undefined);
  };

  const inputClass =
    'w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

  const labelClass =
    'mb-2 block text-sm font-medium text-foreground';

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-8">
      <PageHeader
        title={`Adjust Stock - ${item.name}`}
        subtitle="Submit a stock adjustment request for approval."
      />

      <Card className="overflow-hidden border border-border bg-card shadow-sm">
        <div className="space-y-6 p-5 sm:p-7">

          {/* Current stock information */}
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Item
                </p>
                <p className="mt-1 font-semibold text-foreground">
                  {item.name}
                </p>
                {item.code && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Item Code: {item.code}
                  </p>
                )}
              </div>

              <div className="sm:text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current Stock
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                  {num(item.quantity, 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Adjustment Type */}
          <div>
            <label className={labelClass}>
              Adjustment Type <span className="text-red-500">*</span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition ${
                  adjustmentType === 'INCREASE'
                    ? 'border-green-500 bg-green-50 ring-1 ring-green-500 dark:bg-green-950/20'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                <input
                  type="radio"
                  name="adjustmentType"
                  value="INCREASE"
                  checked={adjustmentType === 'INCREASE'}
                  onChange={() => setAdjustmentType('INCREASE')}
                  className="h-4 w-4 accent-green-600"
                />

                <div>
                  <p className="font-semibold text-green-700 dark:text-green-400">
                    Increase Stock (+)
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add quantity to existing stock
                  </p>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition ${
                  adjustmentType === 'DECREASE'
                    ? 'border-red-500 bg-red-50 ring-1 ring-red-500 dark:bg-red-950/20'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                <input
                  type="radio"
                  name="adjustmentType"
                  value="DECREASE"
                  checked={adjustmentType === 'DECREASE'}
                  onChange={() => setAdjustmentType('DECREASE')}
                  className="h-4 w-4 accent-red-600"
                />

                <div>
                  <p className="font-semibold text-red-700 dark:text-red-400">
                    Decrease Stock (-)
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Remove quantity from existing stock
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Reason Category */}
          <div>
            <label htmlFor="reasonCategory" className={labelClass}>
              Reason Category <span className="text-red-500">*</span>
            </label>

            <select
              id="reasonCategory"
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className={inputClass}
            >
              <option value="">Select Reason</option>
              <option value="Damaged Goods">Damaged Goods</option>
              <option value="Theft/Loss">Theft/Loss</option>
              <option value="Expired Items">Expired Items</option>
              <option value="Inventory Count Adjustment">
                Inventory Count Adjustment
              </option>
              <option value="Quality Issue">Quality Issue</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label htmlFor="adjustmentQuantity" className={labelClass}>
              Quantity <span className="text-red-500">*</span>
            </label>

            <input
              id="adjustmentQuantity"
              type="number"
              min="0"
              step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              className={inputClass}
            />

            {validQuantity && (
              <p className="mt-2 text-xs text-muted-foreground">
                {adjustmentType === 'INCREASE'
                  ? 'Stock will increase by'
                  : 'Stock will decrease by'}{' '}
                <strong>{Number(quantity)}</strong>.
              </p>
            )}
          </div>

          {/* Detailed Reason */}
          <div>
            <label htmlFor="detailedReason" className={labelClass}>
              Detailed Reason <span className="text-red-500">*</span>
            </label>

            <textarea
              id="detailedReason"
              rows={4}
              value={detailedReason}
              onChange={(e) => setDetailedReason(e.target.value)}
              placeholder="Provide detailed explanation for this adjustment..."
              className={inputClass}
            />
          </div>

          {/* Additional Notes */}
          <div>
            <label htmlFor="adjustmentNotes" className={labelClass}>
              Additional Notes
            </label>

            <textarea
              id="adjustmentNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional information..."
              className={inputClass}
            />
          </div>

          {/* Approval information */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Approval required:</strong> This adjustment will
              be submitted as a pending request. Stock quantities will
              only change after an authorized user approves it.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/inventory/items/${id}`)}
              disabled={adjust.isPending}
              className="sm:min-w-32"
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={submit}
              disabled={!canSubmit || adjust.isPending}
              className="sm:min-w-56"
            >
              {adjust.isPending
                ? 'Submitting...'
                : 'Submit Adjustment Request'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
export default function Inventory() {
  const { user } = useAuth();

  const canPrice =
    user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [f, setF] = useState({
    q: '',
    categoryId: '',
    salesPointId: '',
  });

  const [applied, setApplied] = useState({ ...f });
  const [page, setPage] = useState(1);
  const [add, setAdd] = useState(false);

  const { data, isLoading } = useGet('/inventory/items', {
    ...applied,
    page,
  });

  const { data: cats } =
    useGet<any[]>('/inventory/categories');

  const { data: sps } =
    useGet<any[]>('/sales-points');

  const del = useAction(
    (id: string) => api.del(`/inventory/items/${id}`),
    {
      success: 'Item removed',
      invalidate: ['/inventory/items'],
    },
  );

  const openAddDialog = () => {
    setAdd(true);
  };

  return (
    <>
      <CentralMenuManagement />

      <PageHeader title="Inventory Items">
        {canPrice && (
          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={openAddDialog}
          >
            <Plus className="h-4 w-4" />
            Add New Item
          </Button>
        )}
      </PageHeader>

      <FilterBar>
        <Field label="Item Name">
          <Input
            placeholder="Search itemsâ€¦"
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
              <option key={category.id} value={category.id}>
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
              <option key={salesPoint.id} value={salesPoint.id}>
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
        Showing {data?.rows?.length ?? 0} of {data?.total ?? 0} items
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
            cell: (i: any) => i.salesPoint?.name ?? 'â€”',
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
              <InventoryItemActions
                item={i}
                canDelete={canPrice}
                onDelete={(item) => {
                  if (confirm(`Remove ${item.name}?`)) {
                    del.mutate(item.id);
                  }
                }}
              />
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

      {add && (
        <ItemDialog
          key="new-item"
          open={add}
          onClose={() => setAdd(false)}
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
                    <td className="px-3 py-1.5">{i + 1}</td>

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
  if (scope === 'inventory') {
    return <InventoryBinCardPage />;
  }

  return <StoreBinCardPage />;
}


function StoreBinCardPage() {
  const nav = useNavigate();

  const params = new URLSearchParams(window.location.search);
  const initialItemId = params.get('item') ?? '';
  const initialStoreId = params.get('store') ?? '';

  const [storeId, setStoreId] = useState(initialStoreId);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

const [selected, setSelected] = useState<any>(() => {
  const store = params.get('store');
  const item = params.get('item');

  return store && item
    ? {
        storeId: store,
        itemId: item,
      }
    : null;
});

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStart, setAppliedStart] = useState('');
  const [appliedEnd, setAppliedEnd] = useState('');

  const { user } = useAuth();

  const canSeeCost = [
    'ADMIN',
    'MANAGER',
    'ACCOUNTANT',
  ].includes(user?.role ?? '');

  const { data: stores, isLoading: storesLoading } =
    useGet<any[]>('/stores');

  const { data: storeItems, isLoading: itemsLoading } =
    useGet<any[]>(
      '/stores/items',
      {
        ...(storeId ? { storeId } : {}),
        ...(appliedSearch ? { q: appliedSearch } : {}),
      },
    );

  const binCardQuery = useGet<any>(
    '/stores/bin-card',
    {
      storeId: selected?.storeId ?? '',
      itemId: selected?.itemId ?? '',
      ...(appliedStart ? { startDate: appliedStart } : {}),
      ...(appliedEnd ? { endDate: appliedEnd } : {}),
    },
    !!selected?.storeId && !!selected?.itemId,
  );

  const detail = binCardQuery.data;
  const rows = storeItems ?? [];

  const moneyValue = (value: any) =>
    money(Number(value ?? 0));

  const numberValue = (value: any) =>
    num(Number(value ?? 0), 2);

  const openBinCard = (row: any) => {
    setSelected({
      storeId: row.storeId,
      itemId: row.itemId,
      storeName: row.store?.name,
      itemName: row.item?.name,
    });

    setStartDate('');
    setEndDate('');
    setAppliedStart('');
    setAppliedEnd('');

    nav(
      `?store=${encodeURIComponent(row.storeId)}&item=${encodeURIComponent(row.itemId)}`,
      { replace: true },
    );
  };

  const backToList = () => {
    setSelected(null);
    setStartDate('');
    setEndDate('');
    setAppliedStart('');
    setAppliedEnd('');
    nav('/bin-card', { replace: true });
  };

  const applyDateFilter = () => {
    if (
      startDate &&
      endDate &&
      startDate > endDate
    ) {
      return;
    }

    setAppliedStart(startDate);
    setAppliedEnd(endDate);
  };

  const printBinCard = () => {
    window.print();
  };

  const applySearch = () => {
    setAppliedSearch(search.trim());
  };

  const getStatus = (row: any) => {
    if (row.status === 'OUT') return 'Out of Stock';
    if (row.status === 'LOW') return 'Low Stock';
    return 'In Stock';
  };

  const getStatusClass = (row: any) => {
    if (row.status === 'OUT') {
      return 'bg-red-100 text-red-700';
    }

    if (row.status === 'LOW') {
      return 'bg-amber-100 text-amber-700';
    }

    return 'bg-green-100 text-green-700';
  };

  const dateLabel = (value: any) =>
    value ? dt(value) : '—';

  const statCard = (
    title: string,
    value: any,
    subtitle?: string,
  ) => (
    <Card className="p-4">
      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </p>

      {subtitle && (
        <p className="mt-1 text-xs text-slate-500">
          {subtitle}
        </p>
      )}
    </Card>
  );

  // --------------------------------------------------
  // DETAILED BIN CARD
  // --------------------------------------------------

  if (selected) {
    const item = detail?.item;
    const summary = detail?.summary;
    const movements = detail?.movements ?? [];

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Bin Card - {item?.name ?? selected.itemName}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {item?.store?.name ?? selected.storeName}
              {' · '}
              {item?.category?.name ?? 'Uncategorized'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={backToList}
            >
              Back to List
            </Button>

            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={printBinCard}
            >
              <span className="mr-2">⎙</span>
              Print Bin Card
            </Button>
          </div>
        </div>

        {binCardQuery.isLoading ? (
          <Card className="p-8 text-center text-sm text-slate-500">
            Loading bin card...
          </Card>
        ) : binCardQuery.isError ? (
          <Card className="p-8 text-center text-sm text-red-600">
            Unable to load this bin card. Please try again.
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {statCard(
                'Current Stock',
                numberValue(summary?.currentStock),
                'Current store stock balance',
              )}

              {canSeeCost &&
                statCard(
                  'Average Cost',
                  moneyValue(summary?.averageCost),
                  'Current item cost',
                )}

              {canSeeCost &&
                statCard(
                  'Total Stock Value',
                  moneyValue(summary?.totalStockValue),
                  'Based on current cost',
                )}

              {statCard(
                'Last Movement',
                summary?.lastMovement
                  ? dateLabel(summary.lastMovement)
                  : 'No movements',
                'Most recent recorded transaction',
              )}
            </div>

            <Card className="p-4 print:hidden">
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
                <Field label="Start Date">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e: any) =>
                      setStartDate(e.target.value)
                    }
                  />
                </Field>

                <Field label="End Date">
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e: any) =>
                      setEndDate(e.target.value)
                    }
                  />
                </Field>

                <Button
                  className="bg-indigo-600 hover:bg-indigo-700"
                  disabled={
                    !!startDate &&
                    !!endDate &&
                    startDate > endDate
                  }
                  onClick={applyDateFilter}
                >
                  Apply Filter
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="mb-4 text-lg font-semibold">
                Movement Summary
              </h2>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[
                  {
                    label: 'Opening Balance',
                    value: numberValue(summary?.openingBalance),
                  },
                  {
                    label: 'Purchases',
                    value: numberValue(summary?.purchases),
                  },
                  {
                    label: 'Issues',
                    value: numberValue(summary?.issues),
                  },
                  {
                    label: 'Adjustments',
                    value: numberValue(summary?.adjustments),
                  },
                  {
                    label: 'Returns',
                    value: numberValue(summary?.returns),
                  },
                ].map((entry) => (
                  <div
                    key={entry.label}
                    className="rounded-lg border bg-slate-50 p-3"
                  >
                    <p className="text-xs text-slate-500">
                      {entry.label}
                    </p>

                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {entry.value}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                <div>
                  <h2 className="font-semibold">
                    Bin Card Details
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Stock movement transaction history
                  </p>
                </div>

                <Badge variant="gray">
                  {movements.length} Transactions
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      {[
                        'Date',
                        'Reference',
                        'Type',
                        'In Qty',
                        'In Value',
                        'Out Qty',
                        'Out Value',
                        'Balance Qty',
                        'Balance Value',
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="whitespace-nowrap border-b px-4 py-3 font-semibold"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {movements.map((movement: any) => (
                      <tr
                        key={movement.id}
                        className="border-b last:border-0 hover:bg-slate-50"
                      >
                        <td className="whitespace-nowrap px-4 py-3">
                          {dt(movement.createdAt)}
                        </td>

                        <td className="px-4 py-3">
                          {movement.reference ?? '—'}
                        </td>

                        <td className="px-4 py-3">
                          <Badge variant="gray">
                            {String(movement.type)
                              .replace(/_/g, ' ')}
                          </Badge>
                        </td>

                        <td className="px-4 py-3 text-green-700">
                          {numberValue(movement.inQuantity)}
                        </td>

                        <td className="px-4 py-3">
                          {canSeeCost
                            ? moneyValue(movement.inValue)
                            : '—'}
                        </td>

                        <td className="px-4 py-3 text-red-600">
                          {numberValue(movement.outQuantity)}
                        </td>

                        <td className="px-4 py-3">
                          {canSeeCost
                            ? moneyValue(movement.outValue)
                            : '—'}
                        </td>

                        <td className="px-4 py-3 font-semibold">
                          {numberValue(movement.balance)}
                        </td>

                        <td className="px-4 py-3">
                          {canSeeCost
                            ? moneyValue(movement.balanceValue)
                            : '—'}
                        </td>
                      </tr>
                    ))}

                    {!movements.length && (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-12 text-center text-slate-500"
                        >
                          No stock movements found for the selected period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {canSeeCost && (
                <div className="border-t bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  Valuation is estimated using the current inventory cost.
                  Historical unit costs are not stored in StockMovement.
                </div>
              )}
            </Card>
          </>
        )}

        <style>{`
          @media print {
            @page {
              size: landscape;
              margin: 12mm;
            }

            body {
              background: white !important;
              color: black !important;
            }

            body * {
              visibility: hidden;
            }

            .space-y-5,
            .space-y-5 * {
              visibility: visible;
            }

            .print\\:hidden {
              display: none !important;
            }

            .space-y-5 {
              position: absolute;
              inset: 0;
              width: 100%;
            }

            table {
              font-size: 9px !important;
            }

            th, td {
              padding: 5px !important;
            }

            .shadow,
            .shadow-sm {
              box-shadow: none !important;
            }
          }
        `}</style>
      </div>
    );
  }

  // --------------------------------------------------
  // BIN CARD MANAGEMENT LIST
  // --------------------------------------------------

  return (
    <div className="space-y-5">
      <PageHeader title="Bin Card Management" />

      <Card className="p-4">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
          <Field label="Store">
            <NativeSelect
              value={storeId}
              onChange={(e: any) =>
                setStoreId(e.target.value)
              }
            >
              <option value="">All Stores</option>

              {stores?.map((store: any) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Search Item">
            <Input
              value={search}
              onChange={(e: any) =>
                setSearch(e.target.value)
              }
              onKeyDown={(e: any) => {
                if (e.key === 'Enter') applySearch();
              }}
              placeholder="Enter item name..."
            />
          </Field>

          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={applySearch}
          >
            Filter
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <h2 className="font-semibold text-slate-900">
            Store Items
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            View stock balances and transaction history for each store item.
          </p>
        </div>

        {storesLoading || itemsLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading store items...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  {[
                    'Item Name',
                    'Store',
                    'Category',
                    'Stock Quantity',
                    ...(canSeeCost
                      ? ['Avg Cost', 'Stock Value']
                      : []),
                    'Status',
                    'Actions',
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="whitespace-nowrap border-b px-4 py-3 font-semibold"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((row: any) => (
                  <tr
                    key={row.id}
                    className="border-b last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {row.item?.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {row.item?.description || '—'}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      {row.store?.name}
                    </td>

                    <td className="px-4 py-3">
                      {row.item?.category?.name ?? '—'}
                    </td>

                    <td className="px-4 py-3 font-semibold">
                      {numberValue(row.quantity)}
                    </td>

                    {canSeeCost && (
                      <>
                        <td className="px-4 py-3">
                          {moneyValue(row.item?.costPrice)}
                        </td>

                        <td className="px-4 py-3 font-medium">
                          {moneyValue(
                            Number(row.quantity) *
                            Number(row.item?.costPrice ?? 0),
                          )}
                        </td>
                      </>
                    )}

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClass(row)}`}
                      >
                        {getStatus(row)}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => openBinCard(row)}
                      >
                        View Bin Card
                      </Button>
                    </td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td
                      colSpan={canSeeCost ? 8 : 6}
                      className="px-4 py-12 text-center text-slate-500"
                    >
                      No store items found. Try another store or search term.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t px-4 py-3 text-xs text-slate-500">
          {rows.length} store items
        </div>
      </Card>
    </div>
  );
}


function InventoryBinCardPage() {
  const nav = useNavigate();

  const params = new URLSearchParams(window.location.search);
  const selectedItemId = params.get('item') ?? '';

  const [salesPointId, setSalesPointId] = useState('');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  const { data: items, isLoading: itemsLoading } = useGet<any>(
    '/inventory/items',
    {
      pageSize: 200,
      ...(salesPointId ? { salesPointId } : {}),
      ...(search.trim() ? { q: search.trim() } : {}),
    },
  );

  const { data: salesPoints } = useGet<any[]>(
    '/sales-points',
  );

  const { data: binCard, isLoading: binCardLoading } = useGet<any>(
    `/inventory/items/${selectedItemId}/bin-card`,
    {
      ...(appliedStartDate
        ? { startDate: appliedStartDate }
        : {}),
      ...(appliedEndDate
        ? { endDate: appliedEndDate }
        : {}),
    },
    !!selectedItemId,
  );

  const openBinCard = (id: string) => {
    nav(`/inventory/bin-card?item=${encodeURIComponent(id)}`);
    setStartDate('');
    setEndDate('');
    setAppliedStartDate('');
    setAppliedEndDate('');
  };

  const backToList = () => {
    nav('/inventory/bin-card');
  };

  const applyDateFilter = () => {
    if (
      startDate &&
      endDate &&
      startDate > endDate
    ) {
      return;
    }

    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  };

  const item = binCard?.item;
  const summary = binCard?.summary;
  const movements = binCard?.movements ?? [];

  const formatQuantity = (value: any) =>
    num(value ?? 0, 2);

  const formatMoney = (value: any) =>
    money(Number(value ?? 0));

  const movementLabel = (type: string) => {
    const labels: Record<string, string> = {
      OPENING: 'Opening Stock',
      PURCHASE: 'Purchase',
      SALE: 'Sale',
      ADJUSTMENT_IN: 'Adjustment In',
      ADJUSTMENT_OUT: 'Adjustment Out',
      RETURN: 'Return',
      VOID_RETURN: 'Void Return',
      ISSUE: 'Issue',
      TRANSFER_IN: 'Transfer In',
      TRANSFER_OUT: 'Transfer Out',
      RECIPE_USE: 'Recipe Use',
    };

    return labels[type] ?? type.split('_').join(' ')
  };

  const movementIsReturn = (type: string) =>
    ['RETURN', 'VOID_RETURN'].includes(type);

  const movementIsIn = (movement: any) =>
    Number(movement.quantity) > 0;

  const statusLabel = (quantity: number, minLevel: number) => {
    if (quantity <= 0) return 'Out of Stock';
    if (quantity <= minLevel) return 'Low Stock';
    return 'In Stock';
  };

  const statusClass = (status: string) => {
    if (status === 'In Stock') {
      return 'bg-green-100 text-green-700';
    }

    if (status === 'Low Stock') {
      return 'bg-amber-100 text-amber-700';
    }

    return 'bg-red-100 text-red-700';
  };

  const inputClass =
    'h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

  const buttonClass =
    'inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

  // --------------------------------------------------
  // BIN CARD DETAILS
  // --------------------------------------------------

  if (selectedItemId) {
    const quantity = Number(item?.quantity ?? 0);
    const minLevel = Number(item?.minLevel ?? 0);

    const status = statusLabel(quantity, minLevel);

    return (
      <div className="space-y-6">
        <PageHeader
  title={`Inventory Bin Card${item?.name ? ` - ${item.name}` : ''}`}
  subtitle={
    item
      ? `Sales Point: ${item.salesPoint?.name ?? '—'} | Category: ${item.category?.name ?? '—'}`
      : 'View inventory movement history'
  }
/>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={backToList}
            className={`${buttonClass} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
          >
            ← Back to List
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className={`${buttonClass} bg-green-600 text-white hover:bg-green-700`}
          >
            <span className="mr-2">▤</span>
            Print Bin Card
          </button>
        </div>

        {binCardLoading ? (
          <Card className="p-8 text-center text-sm text-gray-500">
            Loading bin card...
          </Card>
        ) : !item ? (
          <Card className="p-8 text-center text-sm text-gray-500">
            Inventory item could not be found.
          </Card>
        ) : (
          <>
            {/* SUMMARY CARDS */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="p-5">
                <p className="text-sm text-gray-500">
                  Current Stock
                </p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {formatQuantity(item.quantity)}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Units available
                </p>
              </Card>

              <Card className="p-5">
                <p className="text-sm text-gray-500">
                  Selling Price
                </p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {item.sellPrice != null
                    ? formatMoney(item.sellPrice)
                    : '—'}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Per unit
                </p>
              </Card>

              <Card className="p-5">
                <p className="text-sm text-gray-500">
                  Total Stock Value
                </p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {summary?.stockValue != null
                    ? formatMoney(summary.stockValue)
                    : '—'}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Based on current selling price
                </p>
              </Card>

              <Card className="p-5">
                <p className="text-sm text-gray-500">
                  Status
                </p>
                <div className="mt-3">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusClass(status)}`}
                  >
                    {status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Minimum level: {formatQuantity(minLevel)}
                </p>
              </Card>
            </div>

            {/* DATE FILTER */}
            <Card className="p-5">
              <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_1fr_auto]">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Start Date
                  </label>
                  <input
                    type="date"
                    className={inputClass}
                    value={startDate}
                    onChange={(e) =>
                      setStartDate(e.target.value)
                    }
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    End Date
                  </label>
                  <input
                    type="date"
                    className={inputClass}
                    value={endDate}
                    onChange={(e) =>
                      setEndDate(e.target.value)
                    }
                  />
                </div>

                <button
                  type="button"
                  onClick={applyDateFilter}
                  className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
                >
                  Apply Filter
                </button>
              </div>
            </Card>

            {/* MOVEMENT SUMMARY */}
            <Card className="overflow-hidden">
              <div className="border-b px-5 py-4">
                <h3 className="font-semibold text-gray-900">
                  Movement Summary
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
                <div>
                  <p className="text-sm text-gray-500">
                    Opening Balance
                  </p>
                  <p className="mt-2 text-xl font-semibold text-gray-900">
                    {formatQuantity(summary?.openingBalance)}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">
                    Stock In
                  </p>
                  <p className="mt-2 text-xl font-semibold text-green-600">
                    +{formatQuantity(summary?.stockIn)}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">
                    Stock Out
                  </p>
                  <p className="mt-2 text-xl font-semibold text-red-600">
                    -{formatQuantity(summary?.stockOut)}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">
                    Returns
                  </p>
                  <p className="mt-2 text-xl font-semibold text-blue-600">
                    +{formatQuantity(summary?.returns)}
                  </p>
                </div>
              </div>
            </Card>

            {/* BIN CARD TABLE */}
            <Card className="overflow-hidden">
              <div className="border-b px-5 py-4">
                <h3 className="font-semibold text-gray-900">
                  Bin Card Details
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Complete stock movement history for this item
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">In Qty</th>
                      <th className="px-4 py-3 text-right">In Value</th>
                      <th className="px-4 py-3 text-right">Out Qty</th>
                      <th className="px-4 py-3 text-right">Out Value</th>
                      <th className="px-4 py-3 text-right">Balance Qty</th>
                      <th className="px-4 py-3 text-right">Balance Value</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {movements.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-12 text-center text-gray-500"
                        >
                          No stock movements found for this period.
                        </td>
                      </tr>
                    ) : (
                      movements.map((movement: any) => {
                        const isIn = movementIsIn(movement);
                        const isReturn = movementIsReturn(
                          movement.type,
                        );

                        const balanceValue =
                          summary?.sellingPrice != null
                            ? Number(movement.balance) *
                              Number(summary.sellingPrice)
                            : null;

                        return (
                          <tr
                            key={movement.id}
                            className="hover:bg-gray-50"
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                              {dt(movement.createdAt)}
                            </td>

                            <td className="px-4 py-3 font-medium text-gray-700">
                              {movement.reference ?? '—'}
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                  isReturn
                                    ? 'bg-blue-100 text-blue-700'
                                    : isIn
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {movementLabel(movement.type)}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-right text-green-700">
                              {isIn
                                ? formatQuantity(movement.quantity)
                                : '—'}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {isIn &&
                              movement.inValue != null
                                ? formatMoney(movement.inValue)
                                : '—'}
                            </td>

                            <td className="px-4 py-3 text-right text-red-600">
                              {!isIn
                                ? formatQuantity(
                                    Math.abs(
                                      Number(movement.quantity),
                                    ),
                                  )
                                : '—'}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {!isIn &&
                              movement.outValue != null
                                ? formatMoney(movement.outValue)
                                : '—'}
                            </td>

                            <td className="px-4 py-3 text-right font-semibold text-gray-900">
                              {formatQuantity(movement.balance)}
                            </td>

                            <td className="px-4 py-3 text-right font-semibold text-gray-900">
                              {balanceValue != null
                                ? formatMoney(balanceValue)
                                : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t bg-gray-50 px-5 py-3 text-xs text-gray-500">
                {movements.length} movement
                {movements.length === 1 ? '' : 's'} displayed
              </div>
            </Card>
          </>
        )}
      </div>
    );
  }

  // --------------------------------------------------
  // INVENTORY BIN CARD LIST
  // --------------------------------------------------

  const rows = items?.rows ?? [];

  return (
    <div className="space-y-6">
     <PageHeader
  title="Inventory Bin Card"
  subtitle="View stock movement history and balances for inventory items."
/>

      <Card className="p-5">
        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Sales Point
            </label>

            <select
              className={inputClass}
              value={salesPointId}
              onChange={(e) =>
                setSalesPointId(e.target.value)
              }
            >
              <option value="">All Sales Points</option>

              {salesPoints?.map((point: any) => (
                <option key={point.id} value={point.id}>
                  {point.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Search Item
            </label>

            <input
              type="text"
              className={inputClass}
              placeholder="Search by item name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setSearch(search.trim());
            }}
            className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
          >
            Filter
          </button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b px-5 py-4">
          <h3 className="font-semibold text-gray-900">
            Inventory Items
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Select an item to view its bin card.
          </p>
        </div>

        {itemsLoading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Loading inventory items...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-3">Item Name</th>
                  <th className="px-4 py-3">Sales Point</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">
                    Stock Quantity
                  </th>
                  <th className="px-4 py-3 text-right">
                    Selling Price
                  </th>
                  <th className="px-4 py-3 text-right">
                    Stock Value
                  </th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-12 text-center text-gray-500"
                    >
                      No inventory items found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row: any) => {
                    const quantity = Number(row.quantity ?? 0);
                    const minLevel = Number(row.minLevel ?? 0);
                    const status = statusLabel(
                      quantity,
                      minLevel,
                    );

                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-5 py-4">
                          <p className="font-semibold text-gray-900">
                            {row.name}
                          </p>
                          <p className="mt-1 max-w-[240px] truncate text-xs text-gray-500">
                            {row.description || '—'}
                          </p>
                        </td>

                        <td className="px-4 py-4 text-gray-600">
                          {row.salesPoint?.name ?? '—'}
                        </td>

                        <td className="px-4 py-4 text-gray-600">
                          {row.category?.name ?? '—'}
                        </td>

                        <td className="px-4 py-4 text-right font-medium text-gray-900">
                          {formatQuantity(quantity)}
                        </td>

                        <td className="px-4 py-4 text-right text-gray-700">
                          {row.sellPrice != null
                            ? formatMoney(row.sellPrice)
                            : '—'}
                        </td>

                        <td className="px-4 py-4 text-right text-gray-700">
                          {row.sellPrice != null
                            ? formatMoney(
                                quantity *
                                  Number(row.sellPrice),
                              )
                            : '—'}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(status)}`}
                          >
                            {status}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => openBinCard(row.id)}
                            className="whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                          >
                            View Bin Card
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t bg-gray-50 px-5 py-3 text-xs text-gray-500">
          {rows.length} item{rows.length === 1 ? '' : 's'} displayed
        </div>
      </Card>
    </div>
  );
}


export function Adjustments({
  scope,
}: {
  scope: 'inventory' | 'stores';
}) {
  const navigate = useNavigate();

  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});

  const { data, isLoading, isError } = useGet<any[]>(
    '/inventory/adjustments',
    {
      ...(appliedFilters.status ? { status: appliedFilters.status } : {}),
      ...(appliedFilters.type ? { type: appliedFilters.type } : {}),
      ...(appliedFilters.dateFrom
        ? { dateFrom: appliedFilters.dateFrom }
        : {}),
      ...(appliedFilters.dateTo
        ? { dateTo: appliedFilters.dateTo }
        : {}),
    },
  );

  const rows = (data ?? []).filter((adjustment: any) =>
    scope === 'stores'
      ? Boolean(adjustment.storeId)
      : !adjustment.storeId,
  );

  const listPath =
    scope === 'stores'
      ? '/stores/adjustments'
      : '/inventory/adjustments';

  const applyFilters = () => {
    setAppliedFilters({
      status,
      type,
      dateFrom,
      dateTo,
    });
  };

  const clearFilters = () => {
    setStatus('');
    setType('');
    setDateFrom('');
    setDateTo('');
    setAppliedFilters({});
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Stock Adjustments
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and manage stock adjustment requests.
          </p>
        </div>

        <Button onClick={() => navigate(`${listPath}/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          New Adjustment
        </Button>
      </div>

      {/* Filters */}
      <Card className="border border-border p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="font-semibold text-foreground">
            Filter Adjustments
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
            >
              <option value="">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Adjustment Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
            >
              <option value="">All Types</option>
              <option value="INCREASE">Increase</option>
              <option value="DECREASE">Decrease</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Date From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Date To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
            />
          </div>

          <div className="flex items-end gap-2">
            <Button className="flex-1" onClick={applyFilters}>
              Filter
            </Button>
            <Button
              variant="outline"
              onClick={clearFilters}
              title="Clear filters"
            >
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* Adjustment list */}
      <Card className="overflow-hidden border border-border shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">
            Stock Adjustments List
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {scope === 'stores'
              ? 'Store-level stock adjustment requests.'
              : 'General inventory stock adjustment requests.'}
          </p>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading stock adjustments...
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-600">
            Unable to load stock adjustments. Please refresh and try again.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-foreground">
              No stock adjustments found
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a new adjustment request or change your filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Adjustment #</th>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Quantity
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Value
                  </th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {rows.map((adjustment: any) => {
                  const increase = Number(adjustment.delta) > 0;

                  return (
                    <tr
                      key={adjustment.id}
                      className="hover:bg-muted/30"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        {adjustment.adjustmentNumber}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {adjustment.item?.name ?? 'Unknown item'}
                        </div>
                        {adjustment.store?.name && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {adjustment.store.name}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            increase
                              ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                          }`}
                        >
                          {increase ? 'Increase' : 'Decrease'}
                        </span>
                      </td>

                      <td className="max-w-[220px] px-4 py-3">
                        <div className="truncate">
                          {adjustment.reasonCategory || adjustment.reason}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                        {num(Math.abs(Number(adjustment.delta)), 3)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {adjustment.totalValue != null
                          ? money(adjustment.totalValue)
                          : '—'}
                      </td>

                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(adjustment.status)}>
                          {adjustment.status}
                        </Badge>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <div>{adjustment.requestedBy?.username ?? '—'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {dt(adjustment.createdAt)}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate(`${listPath}/${adjustment.id}`)
                          }
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-border bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
          {rows.length} adjustment{rows.length === 1 ? '' : 's'} displayed
        </div>
      </Card>
    </div>
  );
}


export function AdjustmentNew({
  scope,
}: {
  scope: 'inventory' | 'stores';
}) {
  const navigate = useNavigate();

  const listPath =
    scope === 'stores'
      ? '/stores/adjustments'
      : '/inventory/adjustments';

  const [itemId, setItemId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<
    'INCREASE' | 'DECREASE'
  >('INCREASE');
  const [quantity, setQuantity] = useState('');
  const [reasonCategory, setReasonCategory] = useState('');
  const [detailedReason, setDetailedReason] = useState('');
  const [notes, setNotes] = useState('');

  // Inventory selector search and pagination.
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryRows, setInventoryRows] = useState<any[]>([]);
  const [selectedInventoryRecord, setSelectedInventoryRecord] =
    useState<any>(null);

  // Store selector search and pagination.
  const [storeSearch, setStoreSearch] = useState('');
  const [storePage, setStorePage] = useState(1);
  const [storeRows, setStoreRows] = useState<any[]>([]);
  const [selectedStoreRecord, setSelectedStoreRecord] =
    useState<any>(null);

  const { data: inventoryData, isLoading: inventoryLoading } =
    useGet<any>(
      '/inventory/items',
      {
        page: inventoryPage,
        pageSize: 50,
        q: inventorySearch.trim(),
      },
      scope === 'inventory',
    );

  const { data: storeItemsData, isLoading: storeItemsLoading } =
    useGet<any>(
      '/stores/items',
      {
        page: storePage,
        pageSize: 50,
        q: storeSearch.trim(),
      },
      scope === 'stores',
    );

  // Append inventory pages without losing previously loaded results.
  useEffect(() => {
    if (!inventoryData?.rows) return;

    setInventoryRows((current) => {
      const existing = inventoryPage === 1 ? [] : current;
      const existingIds = new Set(
        existing.map((item: any) => item.id),
      );

      return [
        ...existing,
        ...inventoryData.rows.filter(
          (item: any) => !existingIds.has(item.id),
        ),
      ];
    });
  }, [inventoryData, inventoryPage]);

  // Append store-item pages.
  useEffect(() => {
    if (!storeItemsData?.rows) return;

    setStoreRows((current) => {
      const existing = storePage === 1 ? [] : current;
      const existingIds = new Set(
        existing.map((row: any) => row.id),
      );

      return [
        ...existing,
        ...storeItemsData.rows.filter(
          (row: any) => !existingIds.has(row.id),
        ),
      ];
    });
  }, [storeItemsData, storePage]);

  const inventoryItems = inventoryRows;
  const availableStoreItems = storeRows;

  // Keep the selected record available even when a new search
  // no longer includes it in the currently loaded results.
  const selectedInventoryItem =
    inventoryItems.find((item: any) => item.id === itemId) ??
    selectedInventoryRecord;

  const selectedStoreItem =
    availableStoreItems.find((row: any) => row.id === itemId) ??
    selectedStoreRecord;

  const inventoryOptions =
    selectedInventoryItem &&
    !inventoryItems.some(
      (item: any) => item.id === selectedInventoryItem.id,
    )
      ? [selectedInventoryItem, ...inventoryItems]
      : inventoryItems;

  const storeOptions =
    selectedStoreItem &&
    !availableStoreItems.some(
      (row: any) => row.id === selectedStoreItem.id,
    )
      ? [selectedStoreItem, ...availableStoreItems]
      : availableStoreItems;

  const inventoryHasMore =
    inventoryRows.length < (inventoryData?.total ?? 0);

  const storesHaveMore =
    storeRows.length < (storeItemsData?.total ?? 0);

  const validQuantity =
    quantity.trim() !== '' &&
    Number.isFinite(Number(quantity)) &&
    Number(quantity) > 0;

  const canSubmit =
    Boolean(itemId) &&
    validQuantity &&
    Boolean(reasonCategory) &&
    detailedReason.trim().length >= 3;

  const submit = useAction(
    () => {
      if (scope === 'stores') {
        return api.post('/stores/adjust', {
          storeId: selectedStoreItem.storeId,
          itemId: selectedStoreItem.itemId,
          type: adjustmentType,
          quantity: Number(quantity),
          reason: detailedReason.trim(),
          reasonCategory,
          notes: notes.trim(),
        });
      }

      return api.post(`/inventory/items/${itemId}/adjust`, {
        delta:
          adjustmentType === 'INCREASE'
            ? Number(quantity)
            : -Number(quantity),
        reason: detailedReason.trim(),
        reasonCategory,
        notes: notes.trim(),
      });
    },
    {
      success: 'Stock adjustment submitted for approval',
      invalidate: [
        '/inventory/adjustments',
        '/inventory/items',
        '/stores/items',
      ],
      onSuccess: () => navigate(listPath),
    },
  );

  const inputClass =
    'w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

  const labelClass =
    'mb-2 block text-sm font-medium text-foreground';

  const loading =
    scope === 'stores' ? storeItemsLoading : inventoryLoading;

  const selectedItem =
    scope === 'stores'
      ? selectedStoreItem?.item
      : selectedInventoryItem;

  const currentStock =
    scope === 'stores'
      ? selectedStoreItem?.quantity
      : selectedInventoryItem?.quantity;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Create Stock Adjustment
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit a stock adjustment request for approval.
        </p>
      </div>

      <Card className="overflow-hidden border border-border shadow-sm">
        <div className="space-y-6 p-5 sm:p-7">

          {/* Store item / Inventory item */}
          <div>
            <label htmlFor="adjustmentItem" className={labelClass}>
              Store Item <span className="text-red-500">*</span>
            </label>

            {/* Search */}
            <input
              type="search"
              value={scope === 'stores' ? storeSearch : inventorySearch}
              onChange={(e) => {
                const value = e.target.value;

                if (scope === 'stores') {
                  setStoreSearch(value);
                  setStorePage(1);
                  setStoreRows([]);
                } else {
                  setInventorySearch(value);
                  setInventoryPage(1);
                  setInventoryRows([]);
                }
              }}
              placeholder="Search items by name..."
              className={`${inputClass} mb-2`}
              disabled={loading}
            />

            {/* Item selector */}
            <select
              id="adjustmentItem"
              value={itemId}
              onChange={(e) => {
                const id = e.target.value;
                setItemId(id);

                if (scope === 'stores') {
                  const record = availableStoreItems.find(
                    (row: any) => row.id === id,
                  );

                  setSelectedStoreRecord(record ?? null);
                  setSelectedInventoryRecord(null);
                } else {
                  const record = inventoryItems.find(
                    (item: any) => item.id === id,
                  );

                  setSelectedInventoryRecord(record ?? null);
                  setSelectedStoreRecord(null);
                }
              }}
              className={inputClass}
              disabled={loading}
            >
              <option value="">
                {loading ? 'Loading items...' : 'Select Item'}
              </option>

              {scope === 'stores'
                ? storeOptions.map((row: any) => (
                    <option key={row.id} value={row.id}>
                      {row.item?.name ?? 'Unknown item'} —{' '}
                      {row.store?.name ?? 'Unknown store'}
                    </option>
                  ))
                : inventoryOptions.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
            </select>

            {/* Results information and Load More */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {scope === 'stores'
                  ? `${storeRows.length} of ${storeItemsData?.total ?? 0} store items`
                  : `${inventoryRows.length} of ${inventoryData?.total ?? 0} inventory items`}
              </p>

              {scope === 'stores' && storesHaveMore && (
                <button
                  type="button"
                  disabled={storeItemsLoading}
                  onClick={() =>
                    setStorePage((current) => current + 1)
                  }
                  className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {storeItemsLoading ? 'Loading...' : 'Load More'}
                </button>
              )}

              {scope === 'inventory' && inventoryHasMore && (
                <button
                  type="button"
                  disabled={inventoryLoading}
                  onClick={() =>
                    setInventoryPage((current) => current + 1)
                  }
                  className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {inventoryLoading ? 'Loading...' : 'Load More'}
                </button>
              )}
            </div>

            {/* Selected item information */}
            {selectedItem && (
              <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {selectedItem.name}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedItem.category?.name ?? 'Uncategorised'}
                      {scope === 'stores' && selectedStoreItem?.store?.name
                        ? ` • ${selectedStoreItem.store.name}`
                        : ''}
                    </p>
                  </div>

                  <div className="sm:text-right">
                    <p className="text-xs text-muted-foreground">
                      Current Stock
                    </p>

                    <p className="text-lg font-semibold tabular-nums">
                      {num(currentStock, 3)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Adjustment type */}
          <div>
            <label className={labelClass}>
              Adjustment Type <span className="text-red-500">*</span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition ${
                  adjustmentType === 'INCREASE'
                    ? 'border-green-500 bg-green-50 ring-1 ring-green-500 dark:bg-green-950/20'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                <input
                  type="radio"
                  name="newAdjustmentType"
                  value="INCREASE"
                  checked={adjustmentType === 'INCREASE'}
                  onChange={() => setAdjustmentType('INCREASE')}
                  className="h-4 w-4 accent-green-600"
                />
                <span className="font-semibold text-green-700 dark:text-green-400">
                  Increase Stock (+)
                </span>
              </label>

              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition ${
                  adjustmentType === 'DECREASE'
                    ? 'border-red-500 bg-red-50 ring-1 ring-red-500 dark:bg-red-950/20'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                <input
                  type="radio"
                  name="newAdjustmentType"
                  value="DECREASE"
                  checked={adjustmentType === 'DECREASE'}
                  onChange={() => setAdjustmentType('DECREASE')}
                  className="h-4 w-4 accent-red-600"
                />
                <span className="font-semibold text-red-700 dark:text-red-400">
                  Decrease Stock (-)
                </span>
              </label>
            </div>
          </div>

          {/* Reason category */}
          <div>
            <label htmlFor="newAdjustmentReason" className={labelClass}>
              Reason for Adjustment{' '}
              <span className="text-red-500">*</span>
            </label>

            <select
              id="newAdjustmentReason"
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className={inputClass}
            >
              <option value="">Select Reason</option>
              <option value="Damaged Goods">Damaged Goods</option>
              <option value="Theft/Loss">Theft/Loss</option>
              <option value="Expired Items">Expired Items</option>
              <option value="Inventory Count Adjustment">
                Inventory Count Adjustment
              </option>
              <option value="Quality Issue">Quality Issue</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label htmlFor="newAdjustmentQuantity" className={labelClass}>
              Quantity <span className="text-red-500">*</span>
            </label>

            <input
              id="newAdjustmentQuantity"
              type="number"
              min="0"
              step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              className={inputClass}
            />

            {validQuantity && (
              <p className="mt-2 text-xs text-muted-foreground">
                Stock will{' '}
                {adjustmentType === 'INCREASE' ? 'increase' : 'decrease'} by{' '}
                <strong>{Number(quantity)}</strong>.
              </p>
            )}
          </div>

          {/* Detailed reason */}
          <div>
            <label htmlFor="newAdjustmentDetailedReason" className={labelClass}>
              Detailed Reason <span className="text-red-500">*</span>
            </label>

            <textarea
              id="newAdjustmentDetailedReason"
              rows={4}
              value={detailedReason}
              onChange={(e) => setDetailedReason(e.target.value)}
              placeholder="Provide detailed explanation for this adjustment..."
              className={inputClass}
            />
          </div>

          {/* Additional notes */}
          <div>
            <label htmlFor="newAdjustmentNotes" className={labelClass}>
              Additional Notes
            </label>

            <textarea
              id="newAdjustmentNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional information..."
              className={inputClass}
            />
          </div>

          <div className="flex flex-col-reverse justify-end gap-3 border-t border-border pt-5 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(listPath)}
            >
              Cancel
            </Button>

            <Button
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                if (canSubmit) submit.mutate(undefined);
              }}
            >
              Submit Adjustment Request
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}


export function AdjustmentView({
  scope,
}: {
  scope: 'inventory' | 'stores';
}) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const listPath =
    scope === 'stores'
      ? '/stores/adjustments'
      : '/inventory/adjustments';

  const {
    data: adjustment,
    isLoading,
    isError,
  } = useGet<any>(
    `/inventory/adjustments/${id}`,
    undefined,
    Boolean(id),
  );

  const decide = useAction(
    (value: { approve: boolean }) =>
      api.post(`/inventory/adjustments/${id}/decide`, value),
    {
      success: 'Adjustment decision saved',
      invalidate: [
        '/inventory/adjustments',
        `/inventory/adjustments/${id}`,
        '/inventory/items',
        '/stores/items',
      ],
    },
  );

  const increase =
    adjustment && Number(adjustment.delta) > 0;

  const sectionClass =
    'rounded-lg border border-border p-5';

  const sectionHeadingClass =
    'mb-4 text-base font-semibold text-foreground';

  const DetailRow = ({
    label,
    value,
  }: {
    label: string;
    value: ReactNode;
  }) => (
    <div className="flex flex-col gap-1 border-b border-border/70 py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between">
      <span className="text-sm text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium text-foreground sm:max-w-[60%] sm:text-right">
        {value ?? '—'}
      </span>
    </div>
  );

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading adjustment details...
      </div>
    );
  }

  if (isError || !adjustment) {
    return (
      <Card className="p-6">
        <p className="text-sm text-red-600">
          Unable to load this stock adjustment.
        </p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => navigate(listPath)}
        >
          Back to Stock Adjustments
        </Button>
      </Card>
    );
  }

  const approved = adjustment.status === 'APPROVED';
  const rejected = adjustment.status === 'REJECTED';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Stock Adjustment Details
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {adjustment.adjustmentNumber}
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => navigate(listPath)}
        >
          Back to Adjustments
        </Button>
      </div>

      {/* Status */}
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Adjustment Status
          </p>
          <div className="mt-2">
            <Badge variant={statusVariant(adjustment.status)}>
              {adjustment.status}
            </Badge>
          </div>
        </div>

        <div className="text-sm text-muted-foreground sm:text-right">
          <p>Requested on</p>
          <p className="mt-1 font-medium text-foreground">
            {dt(adjustment.createdAt)}
          </p>
        </div>
      </Card>

      {/* Adjustment and item information */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className={sectionClass}>
          <h2 className={sectionHeadingClass}>
            Adjustment Information
          </h2>

          <DetailRow
            label="Adjustment Number"
            value={adjustment.adjustmentNumber}
          />

          <DetailRow
            label="Date"
            value={dt(adjustment.createdAt)}
          />

          <DetailRow
            label="Adjustment Type"
            value={
              <span
                className={
                  increase
                    ? 'font-semibold text-green-600'
                    : 'font-semibold text-red-600'
                }
              >
                {increase ? 'Increase' : 'Decrease'}
              </span>
            }
          />

          <DetailRow
            label="Reason Type"
            value={adjustment.reasonCategory || '—'}
          />

          <DetailRow
            label="Quantity"
            value={num(Math.abs(Number(adjustment.delta)), 3)}
          />

          <DetailRow
            label="Unit Cost"
            value={
              adjustment.unitCostSnapshot != null
                ? money(adjustment.unitCostSnapshot)
                : '—'
            }
          />

          <DetailRow
            label="Total Value"
            value={
              adjustment.totalValue != null
                ? money(adjustment.totalValue)
                : '—'
            }
          />
        </Card>

        <Card className={sectionClass}>
          <h2 className={sectionHeadingClass}>
            Item Information
          </h2>

          <DetailRow
            label="Item Name"
            value={adjustment.item?.name}
          />

          <DetailRow
            label="Store"
            value={adjustment.store?.name || 'General Inventory'}
          />

          <DetailRow
            label="Category"
            value={adjustment.item?.category?.name}
          />

          <DetailRow
            label="Stock Before Adjustment"
            value={
              adjustment.quantityBefore != null
                ? num(adjustment.quantityBefore, 3)
                : '—'
            }
          />

          <DetailRow
            label="Stock After Adjustment"
            value={
              adjustment.quantityAfter != null
                ? num(adjustment.quantityAfter, 3)
                : 'Pending approval'
            }
          />
        </Card>
      </div>

      {/* Detailed reason */}
      <Card className={sectionClass}>
        <h2 className={sectionHeadingClass}>
          Reason for Adjustment
        </h2>

        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
          {adjustment.reason || '—'}
        </p>

        {adjustment.notes && (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Additional Notes
            </h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {adjustment.notes}
            </p>
          </div>
        )}
      </Card>

      {/* Request information */}
      <Card className={sectionClass}>
        <h2 className={sectionHeadingClass}>
          Request Information
        </h2>

        <DetailRow
          label="Requested By"
          value={adjustment.requestedBy?.username}
        />

        <DetailRow
          label="Request Date"
          value={dt(adjustment.createdAt)}
        />
      </Card>

      {/* Approval information */}
      {(approved || rejected) && (
        <Card
          className={`border p-5 ${
            approved
              ? 'border-green-200 bg-green-50/70 dark:border-green-900 dark:bg-green-950/20'
              : 'border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20'
          }`}
        >
          <h2 className="mb-4 text-base font-semibold text-foreground">
            {approved ? 'Approval Information' : 'Rejection Information'}
          </h2>

          <DetailRow
            label={approved ? 'Approved By' : 'Rejected By'}
            value={adjustment.decidedBy?.username}
          />

          <DetailRow
            label={approved ? 'Approval Date' : 'Decision Date'}
            value={
              adjustment.decidedAt
                ? dt(adjustment.decidedAt)
                : '—'
            }
          />
        </Card>
      )}

      {/* Pending request actions */}
      {adjustment.status === 'PENDING' && (
        <Card className="border border-border p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-foreground">
                Review Adjustment Request
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Approve or reject this request. Stock changes only when approved.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="destructive"
                onClick={() =>
                  decide.mutate({ approve: false })
                }
              >
                Reject Request
              </Button>

              <Button
                variant="success"
                onClick={() =>
                  decide.mutate({ approve: true })
                }
              >
                Approve Request
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}


export function StockMovementReport() {
  const { user } = useAuth();

  const canSeeCost = [
    'ADMIN',
    'MANAGER',
    'ACCOUNTANT',
  ].includes(user?.role ?? '');

  const [filters, setFilters] = useState({
    storeId: '',
    categoryId: '',
    startDate: '',
    endDate: '',
  });

  const [applied, setApplied] = useState({ ...filters });

  const { data: stores } = useGet<any[]>('/stores');
  const { data: categories } = useGet<any[]>(
    '/inventory/categories',
  );

  const report = useGet<any>(
    '/inventory/stock-movement-report',
    {
      ...(applied.storeId
        ? { storeId: applied.storeId }
        : {}),
      ...(applied.categoryId
        ? { categoryId: applied.categoryId }
        : {}),
      ...(applied.startDate
        ? { startDate: applied.startDate }
        : {}),
      ...(applied.endDate
        ? { endDate: applied.endDate }
        : {}),
    },
  );

  const groups = report.data?.groups ?? [];
  const summary = report.data?.summary;

  const formatQty = (value: any) =>
    num(Number(value ?? 0), 2);

  const formatMoney = (value: any) =>
    money(Number(value ?? 0));

  const applyFilters = () => {
    if (
      filters.startDate &&
      filters.endDate &&
      filters.startDate > filters.endDate
    ) {
      return;
    }

    setApplied({ ...filters });
  };

  const resetFilters = () => {
    const empty = {
      storeId: '',
      categoryId: '',
      startDate: '',
      endDate: '',
    };

    setFilters(empty);
    setApplied(empty);
  };

  const totalOpening = groups.reduce(
    (sum: number, group: any) =>
      sum + Number(group.subtotal?.opening ?? 0),
    0,
  );

  const totalValue = Number(summary?.closingValue ?? 0);

  const periodLabel = [
    applied.startDate || 'Beginning',
    applied.endDate || 'Present',
  ].join(' to ');

  const generatedAt = new Date().toLocaleString();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Movement Report"
        subtitle="Store stock movement summary grouped by inventory category"
      >
        <PrintButton label="Print Report" />
      </PageHeader>

      <FilterBar>
        <Field label="Store">
          <NativeSelect
            value={filters.storeId}
            onChange={(e) =>
              setFilters({
                ...filters,
                storeId: e.target.value,
              })
            }
          >
            <option value="">All Stores</option>
            {(stores ?? []).map((store: any) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Category">
          <NativeSelect
            value={filters.categoryId}
            onChange={(e) =>
              setFilters({
                ...filters,
                categoryId: e.target.value,
              })
            }
          >
            <option value="">All Categories</option>
            {(categories ?? []).map((category: any) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Start Date">
          <Input
            type="date"
            value={filters.startDate}
            max={filters.endDate || undefined}
            onChange={(e) =>
              setFilters({
                ...filters,
                startDate: e.target.value,
              })
            }
          />
        </Field>

        <Field label="End Date">
          <Input
            type="date"
            value={filters.endDate}
            min={filters.startDate || undefined}
            onChange={(e) =>
              setFilters({
                ...filters,
                endDate: e.target.value,
              })
            }
          />
        </Field>

        <div className="flex items-end gap-2 md:col-span-4">
          <Button
            onClick={applyFilters}
            disabled={
              !!filters.startDate &&
              !!filters.endDate &&
              filters.startDate > filters.endDate
            }
          >
            Apply Filters
          </Button>

          <Button
            variant="outline"
            onClick={resetFilters}
          >
            Reset
          </Button>
        </div>
      </FilterBar>

      {filters.startDate &&
        filters.endDate &&
        filters.startDate > filters.endDate && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Start date cannot be later than end date.
          </div>
        )}

      {report.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(report.error as Error)?.message ??
            'Unable to load the stock movement report.'}
        </div>
      )}

      <div className="no-print grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Total Items"
          value={summary?.totalItems ?? 0}
        />

        <Stat
          label="Total In"
          value={formatQty(summary?.totalIn)}
          tone="green"
        />

        <Stat
          label="Total Out"
          value={formatQty(summary?.totalOut)}
          tone="orange"
        />

        <Stat
          label="New Balance"
          value={formatQty(summary?.newBalance)}
          tone="blue"
        />

        {canSeeCost && (
          <Stat
            label="Closing Value"
            value={formatMoney(totalValue)}
            tone="purple"
          />
        )}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">
              Stock Movement Report
            </h2>
            <p className="text-sm text-muted-foreground">
              Period: {periodLabel}
            </p>
            <p className="text-sm text-muted-foreground">
              Store:{' '}
              {applied.storeId
                ? stores?.find(
                    (s: any) => s.id === applied.storeId,
                  )?.name ?? 'Selected Store'
                : 'All Stores'}
            </p>
          </div>

          <div className="text-right text-xs text-muted-foreground">
            <p>Generated: {generatedAt}</p>
            <p>Items: {summary?.totalItems ?? 0}</p>
          </div>
        </div>

        {report.isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading stock movement report...
          </div>
        ) : groups.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No store stock movement records found for the selected filters.
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group: any) => (
              <section
                key={group.category}
                className="space-y-2"
              >
                <h3 className="border-b pb-2 font-semibold">
                  {group.category}
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-y bg-muted/50">
                        <th className="p-2">S/N</th>
                        <th className="p-2">Code</th>
                        <th className="p-2">Item Name</th>
                        <th className="p-2">Store</th>

                        {canSeeCost && (
                          <>
                            <th className="p-2 text-right">Cost</th>
                            <th className="p-2 text-right">Sell</th>
                          </>
                        )}

                        <th className="p-2 text-right">Opening</th>
                        <th className="p-2 text-right">In</th>
                        <th className="p-2 text-right">Out</th>
                        <th className="p-2 text-right">Balance</th>

                        {canSeeCost && (
                          <th className="p-2 text-right">
                            Value
                          </th>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {group.items.map(
                        (item: any, index: number) => (
                          <tr
                            key={`${item.storeId}:${item.itemId}`}
                            className="border-b"
                          >
                            <td className="p-2">{index + 1}</td>
                            <td className="p-2">{item.code}</td>
                            <td className="p-2 font-medium">
                              {item.itemName}
                            </td>
                            <td className="p-2">{item.store}</td>

                            {canSeeCost && (
                              <>
                                <td className="p-2 text-right">
                                  {formatMoney(item.costPrice)}
                                </td>
                                <td className="p-2 text-right">
                                  {formatMoney(item.sellPrice)}
                                </td>
                              </>
                            )}

                            <td className="p-2 text-right">
                              {formatQty(item.opening)}
                            </td>
                            <td className="p-2 text-right text-green-700">
                              {formatQty(item.stockIn)}
                            </td>
                            <td className="p-2 text-right text-red-600">
                              {formatQty(item.stockOut)}
                            </td>
                            <td className="p-2 text-right font-semibold">
                              {formatQty(item.balance)}
                            </td>

                            {canSeeCost && (
                              <td className="p-2 text-right">
                                {formatMoney(item.value)}
                              </td>
                            )}
                          </tr>
                        ),
                      )}

                      <tr className="border-t-2 bg-muted/40 font-semibold">
                        <td
                          colSpan={canSeeCost ? 6 : 4}
                          className="p-2"
                        >
                          {group.category} Subtotal
                        </td>

                        <td className="p-2 text-right">
                          {formatQty(group.subtotal.opening)}
                        </td>
                        <td className="p-2 text-right">
                          {formatQty(group.subtotal.stockIn)}
                        </td>
                        <td className="p-2 text-right">
                          {formatQty(group.subtotal.stockOut)}
                        </td>
                        <td className="p-2 text-right">
                          {formatQty(group.subtotal.balance)}
                        </td>

                        {canSeeCost && (
                          <td className="p-2 text-right">
                            {formatMoney(group.subtotal.value)}
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

            <div className="overflow-x-auto border-t-2 pt-3">
              <table className="w-full min-w-[650px] text-xs">
                <tbody>
                  <tr className="bg-muted font-bold">
                    <td
                      colSpan={canSeeCost ? 6 : 4}
                      className="p-3"
                    >
                      GRAND TOTAL
                    </td>

                    <td className="p-3 text-right">
                      {formatQty(totalOpening)}
                    </td>
                    <td className="p-3 text-right">
                      {formatQty(summary?.totalIn)}
                    </td>
                    <td className="p-3 text-right">
                      {formatQty(summary?.totalOut)}
                    </td>
                    <td className="p-3 text-right">
                      {formatQty(summary?.newBalance)}
                    </td>

                    {canSeeCost && (
                      <td className="p-3 text-right">
                        {formatMoney(summary?.closingValue)}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>

            {canSeeCost && (
              <p className="text-xs text-muted-foreground">
                Stock valuation is an estimate based on current
                inventory cost prices, not historical transaction
                prices.
              </p>
            )}
          </div>
        )}
      </Card>

      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 12mm;
          }

          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          main {
            overflow: visible !important;
          }

          table {
            width: 100% !important;
            font-size: 9px !important;
          }

          th, td {
            padding: 5px !important;
          }

          section {
            break-inside: avoid;
          }

          .rounded-lg {
            border-radius: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
