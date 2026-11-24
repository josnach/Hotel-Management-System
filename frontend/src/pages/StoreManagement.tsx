
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Boxes, ClipboardList, Package,
  Pencil, Plus, RefreshCw, Search, Store as StoreIcon,
} from 'lucide-react';

import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { d, dt, money, num } from '@/lib/utils';
import {
  Empty, ErrorBox, Field, Loading, PageHeader, Stat,
} from '@/components/common';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { DataTable, type Col } from '@/components/DataTable';

type Store = {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
};

type StoreItem = {
  id: string;
  itemId: string;
  name: string;
  code?: number;
  category?: { name?: string } | string;
  categoryName?: string;
  quantity: number | string;
  minLevel: number | string;
  sellPrice?: number | string;
  costPrice?: number | string;
  status?: string;
  item?: {
    id?: string;
    name?: string;
    code?: number;
    sellPrice?: number | string;
    costPrice?: number | string;
    category?: { name?: string };
  };
};

const rowsFrom = <T,>(data: any): T[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.stores)) return data.stores;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const itemName = (item: StoreItem) => item.name ?? item.item?.name ?? 'Unnamed item';
const itemCategory = (item: StoreItem) =>
  typeof item.category === 'string'
    ? item.category
    : item.category?.name ?? item.categoryName ?? item.item?.category?.name ?? '—';

const itemQuantity = (item: StoreItem) => Number(item.quantity ?? 0);
const itemMinimum = (item: StoreItem) => Number(item.minLevel ?? 0);

function StoreStatus({ active }: { active: boolean }) {
  return <Badge variant={statusVariant(active ? 'ACTIVE' : 'INACTIVE')}>
    {active ? 'Active' : 'Inactive'}
  </Badge>;
}

/* -------------------------------------------------------------------------- */
/* Store list                                                                  */
/* -------------------------------------------------------------------------- */

export function StoreManagementList() {
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useGet('/stores');
  const stores = rowsFrom<Store>(data);
  const filtered = stores.filter((store) =>
    `${store.name} ${store.description ?? ''}`.toLowerCase().includes(q.toLowerCase()),
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const create = useAction(
    (body: { name: string; description: string }) => api.post('/stores', body),
    {
      success: 'Store created successfully',
      invalidate: ['/stores'],
      onSuccess: () => {
        setName('');
        setDescription('');
      },
    },
  );

  return (
    <>
      <PageHeader
        title="Store Management"
        subtitle="Manage your stores and monitor stock across locations."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Stores</h2>
              <p className="text-sm text-muted-foreground">
                {filtered.length} store{filtered.length === 1 ? '' : 's'} registered
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search stores..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          {error ? <ErrorBox error={error} /> : null}
          {isLoading ? <Loading /> : null}
          {!isLoading && !error && filtered.length === 0 ? (
            <Card className="p-8"><Empty>No stores found.</Empty></Card>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((store) => (
              <Card key={store.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-3 text-primary">
                      <StoreIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{store.name}</h3>
                      <p className="text-xs text-muted-foreground">Store</p>
                    </div>
                  </div>
                  <StoreStatus active={store.isActive} />
                </div>
                <p className="mt-4 min-h-10 text-sm text-muted-foreground">
                  {store.description || 'No description provided.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link to={`/stores/${store.id}`}>
                      Open store <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/stores/${store.id}/items`}>
                      <Package className="h-4 w-4" /> Manage items
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <Card className="h-fit p-5">
          <h2 className="font-semibold">Create Store</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Add a store to manage its stock.
          </p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate({
                name: name.trim(),
                description: description.trim(),
              });
            }}
          >
            <Field label="Store name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional store description"
              />
            </Field>
            <Button type="submit" disabled={!name.trim() || create.isPending} className="w-full">
              <Plus className="h-4 w-4" />
              {create.isPending ? 'Creating...' : 'Create Store'}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Store dashboard                                                             */
/* -------------------------------------------------------------------------- */

export function StoreDashboard() {
  const { storeId = '' } = useParams();
  const { data, isLoading, error } = useGet<any>(`/stores/${storeId}`, undefined, !!storeId);
  const store: Store | undefined = data?.store ?? data;
  const summary = data?.summary ?? {};
  const issues = rowsFrom<any>(data?.recentIssues);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!store) return <Empty>Store not found.</Empty>;

  const issueCols: Col<any>[] = [
    { header: 'Date', cell: (r) => dt(r.createdAt) },
    { header: 'Item', cell: (r) => r.itemName ?? r.item?.name ?? r.itemId },
    { header: 'Quantity', cell: (r) => num(r.quantity) },
    { header: 'Notes', cell: (r) => r.notes || '—' },
  ];

  return (
    <>
      <PageHeader title={store.name} subtitle="Store overview and stock summary">
        <Button asChild variant="outline">
          <Link to="/stores"><ArrowLeft className="h-4 w-4" /> Stores</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to={`/stores/${storeId}/items`}><Package className="h-4 w-4" /> Manage Items</Link>
        </Button>
        <Button asChild>
          <Link to={`/stores/${storeId}/stock-issues/create`}>
            <ArrowRight className="h-4 w-4" /> Issue Stock
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to={`/stores/${storeId}/edit`}>Edit Store</Link>
        </Button>
      </PageHeader>

      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Store Details</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {store.description || 'No description provided.'}
            </p>
          </div>
          <StoreStatus active={store.isActive} />
        </div>
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total Items" value={num(summary.totalItems ?? 0)} tone="blue" />
        <Stat label="Total Quantity" value={num(summary.totalQuantity ?? 0)} tone="purple" />
        {summary.totalValue !== undefined && (
          <Stat label="Total Value" value={money(summary.totalValue)} tone="green" />
        )}
        <Stat label="Low Stock Items" value={num(summary.lowStockItems ?? 0)} tone="yellow" />
        <Stat label="Out of Stock" value={num(summary.outOfStockItems ?? 0)} tone="red" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">Recent Stock Issues</h2>
          <Button asChild size="sm" variant="outline">
            <Link to="/stores/issues">View all issues</Link>
          </Button>
        </div>
        <DataTable
          rows={issues}
          cols={issueCols}
          empty="No stock issues have been recorded for this store."
        />
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Edit store                                                                  */
/* -------------------------------------------------------------------------- */

export function StoreEdit() {
  const { storeId = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGet<any>(`/stores/${storeId}`, undefined, !!storeId);
  const store: Store | undefined = data?.store ?? data;

const [name, setName] = useState<string | null>(null);
const [description, setDescription] = useState<string | null>(null);
const [active, setActive] = useState<boolean | null>(null);

const currentName = name ?? store?.name ?? '';
const currentDescription = description ?? store?.description ?? '';
const currentActive = active ?? store?.isActive ?? true;
  const update = useAction(
    (body: any) => api.patch(`/stores/${storeId}`, body),
    {
      success: 'Store updated successfully',
      invalidate: ['/stores', `/stores/${storeId}`],
      onSuccess: () => navigate(`/stores/${storeId}`),
    },
  );

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!store) return <Empty>Store not found.</Empty>;

  return (
    <>
      <PageHeader title="Edit Store" subtitle={store.name}>
        <Button asChild variant="outline">
          <Link to={`/stores/${storeId}`}><ArrowLeft className="h-4 w-4" /> Back to Store</Link>
        </Button>
      </PageHeader>
      <Card className="max-w-2xl p-5">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({
              name: currentName.trim(),
              description: currentDescription.trim() || null,
              isActive: currentActive,
            });
          }}
        >
          <Field label="Store name">
            <Input value={currentName} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Description">
            <Textarea
              value={currentDescription}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Status">
            <NativeSelect
              value={currentActive ? 'true' : 'false'}
              onChange={(e) => setActive(e.target.value === 'true')}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </NativeSelect>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={update.isPending}>Save Changes</Button>
            <Button type="button" variant="outline" onClick={() => navigate(`/stores/${storeId}`)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Store items                                                                 */
/* -------------------------------------------------------------------------- */

export function StoreItems() {
  const { storeId = '' } = useParams();
  const [q, setQ] = useState('');
  const { data: storeData } = useGet<any>(`/stores/${storeId}`, undefined, !!storeId);
  const { data, isLoading, error } = useGet<any>(
    `/stores/${storeId}/items`,
    { q },
    !!storeId,
  );
  const items = rowsFrom<StoreItem>(data);
  const filtered = useMemo(
    () => items.filter((item) =>
      `${itemName(item)} ${itemCategory(item)} ${item.code ?? ''}`
        .toLowerCase().includes(q.toLowerCase()),
    ),
    [items, q],
  );
  const store = storeData?.store ?? storeData;

  const cols: Col<StoreItem>[] = [
    {
      header: 'Item',
      cell: (item) => (
        <Link className="font-medium text-primary hover:underline"
          to={`/stores/${storeId}/items/${item.itemId ?? item.id}`}>
          {itemName(item)}
        </Link>
      ),
    },
    { header: 'Category', cell: (item) => itemCategory(item) },
    { header: 'Stock Quantity', cell: (item) => num(itemQuantity(item)) },
    { header: 'Minimum Level', cell: (item) => num(itemMinimum(item)) },
    {
      header: 'Status',
      cell: (item) => {
        const qty = itemQuantity(item);
        const min = itemMinimum(item);
        const label = qty <= 0 ? 'Out of Stock' : qty <= min ? 'Low Stock' : 'In Stock';
        return (
  <Badge variant={qty <= 0 ? 'red' : qty <= min ? 'yellow' : 'green'}>
    {label}
  </Badge>
);
      },
    },
    {
      header: 'Actions',
      cell: (item) => (
        <div className="flex flex-wrap gap-1">
          <Button asChild size="sm" variant="outline">
            <Link to={`/stores/${storeId}/items/${item.itemId ?? item.id}`}>View</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`/stores/${storeId}/items/${item.itemId ?? item.id}/edit`}>
              <Pencil className="h-3 w-3" /> Edit
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`/stores/${storeId}/stock-issues/create?itemId=${item.itemId ?? item.id}`}>
              Issue
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={`${store?.name ?? 'Store'} Items`} subtitle="Items and stock levels in this store">
        <Button asChild variant="outline">
          <Link to={`/stores/${storeId}`}><ArrowLeft className="h-4 w-4" /> Back to Store</Link>
        </Button>
        <Button asChild>
          <Link to={`/stores/${storeId}/items/new`}><Plus className="h-4 w-4" /> Add New Item</Link>
        </Button>
      </PageHeader>
      <Card className="mb-4 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search items..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>
      {error ? <ErrorBox error={error} /> : (
        <DataTable rows={filtered} cols={cols} loading={isLoading} empty="No items have been added to this store." />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Add an existing inventory item to a store                                   */
/* -------------------------------------------------------------------------- */

export function StoreItemNew() {
  const { storeId = '' } = useParams();
  const navigate = useNavigate();
  const { data: storeData } = useGet<any>(`/stores/${storeId}`, undefined, !!storeId);
  const { data: catalogueData, isLoading, error } = useGet<any>('/inventory/items');
  const catalogue = rowsFrom<any>(catalogueData);

  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [minLevel, setMinLevel] = useState('10');

  const create = useAction(
    (body: any) => api.post(`/stores/${storeId}/items`, body),
    {
      success: 'Item added to store successfully',
      invalidate: [`/stores/${storeId}/items`, `/stores/${storeId}`],
      onSuccess: () => navigate(`/stores/${storeId}/items`),
    },
  );

  const store = storeData?.store ?? storeData;

  return (
    <>
      <PageHeader title="Add Item to Store" subtitle={store?.name ?? 'Store inventory'}>
        <Button asChild variant="outline">
          <Link to={`/stores/${storeId}/items`}><ArrowLeft className="h-4 w-4" /> Back to Items</Link>
        </Button>
      </PageHeader>
      <Card className="max-w-2xl p-5">
        {error ? <ErrorBox error={error} /> : null}
        {isLoading ? <Loading /> : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({
                itemId,
                quantity: Number(quantity),
                minLevel: Number(minLevel),
              });
            }}
          >
            <Field label="Inventory item">
              <NativeSelect value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                <option value="">Select an existing inventory item</option>
                {catalogue.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.code ? ` (#${item.code})` : ''}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                Select from the central inventory catalogue. This does not create a duplicate item or a separate price.
              </p>
            </Field>
            <Field label="Opening quantity">
              <Input type="number" min="0" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </Field>
            <Field label="Minimum stock level">
              <Input type="number" min="0" step="0.001" value={minLevel} onChange={(e) => setMinLevel(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={!itemId || Number(quantity) < 0 || Number(minLevel) < 0 || create.isPending}>
              {create.isPending ? 'Adding...' : 'Add Item to Store'}
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* View item                                                                   */
/* -------------------------------------------------------------------------- */

export function StoreItemView() {
  const { storeId = '', itemId = '' } = useParams();
  const { data: storeData } = useGet<any>(`/stores/${storeId}`, undefined, !!storeId);
  const { data, isLoading, error } = useGet<any>(`/stores/${storeId}/items`);
  const items = rowsFrom<StoreItem>(data);
  const item = items.find((row) => row.itemId === itemId || row.id === itemId);
  const store = storeData?.store ?? storeData;

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!item) return <Empty>Item not found in this store.</Empty>;

  const quantity = itemQuantity(item);
  const minimum = itemMinimum(item);
  const low = quantity <= minimum;

  return (
    <>
      <PageHeader title={itemName(item)} subtitle={`${store?.name ?? 'Store'} · Item details`}>
        <Button asChild variant="outline">
          <Link to={`/stores/${storeId}/items`}><ArrowLeft className="h-4 w-4" /> Back to Items</Link>
        </Button>
        <Button asChild>
          <Link to={`/stores/${storeId}/items/${itemId}/edit`}><Pencil className="h-4 w-4" /> Edit</Link>
        </Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Stock Quantity" value={num(quantity)} tone="blue" />
        <Stat label="Minimum Stock Level" value={num(minimum)} tone="purple" />
        <Stat label="Stock Status" value={low ? 'Low Stock' : 'In Stock'} tone={low ? 'yellow' : 'green'} />
      </div>
      <Card className="mt-5 p-5">
        <h2 className="mb-3 font-semibold">Item Information</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Item name</dt><dd className="font-medium">{itemName(item)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Category</dt><dd>{itemCategory(item)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Item code</dt><dd>{item.code ?? item.item?.code ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Store</dt><dd>{store?.name ?? '—'}</dd></div>
        </dl>
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Edit store item settings                                                    */
/* -------------------------------------------------------------------------- */

export function StoreItemEdit() {
  const { storeId = '', itemId = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGet<any>(`/stores/${storeId}/items`);
  const items = rowsFrom<StoreItem>(data);
  const item = items.find((row) => row.itemId === itemId || row.id === itemId);
  const [minimum, setMinimum] = useState<string | null>(null);

  const update = useAction(
    (body: any) => api.patch(`/stores/${storeId}/items/${itemId}`, body),
    {
      success: 'Store item updated successfully',
      invalidate: [`/stores/${storeId}/items`, `/stores/${storeId}`],
      onSuccess: () => navigate(`/stores/${storeId}/items/${itemId}`),
    },
  );

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!item) return <Empty>Item not found in this store.</Empty>;

  return (
    <>
      <PageHeader title="Edit Store Item" subtitle={itemName(item)}>
        <Button asChild variant="outline">
          <Link to={`/stores/${storeId}/items/${itemId}`}><ArrowLeft className="h-4 w-4" /> Back to Item</Link>
        </Button>
      </PageHeader>
      <Card className="max-w-xl p-5">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ minLevel: Number(minimum ?? itemMinimum(item)) });
          }}
        >
          <Field label="Item">
            <Input value={itemName(item)} disabled />
          </Field>
          <Field label="Current stock quantity">
            <Input value={String(itemQuantity(item))} disabled />
          </Field>
          <Field label="Minimum stock level">
            <Input
              type="number"
              min="0"
              step="0.001"
              value={minimum ?? String(itemMinimum(item))}
              onChange={(e) => setMinimum(e.target.value)}
              required
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Item prices are managed centrally in Inventory. This page changes the minimum stock level for this store only.
          </p>
          <Button type="submit" disabled={update.isPending || Number(minimum ?? itemMinimum(item)) < 0}>
            {update.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Issue stock                                                                 */
/* -------------------------------------------------------------------------- */

export function StoreStockIssueNew() {
  const { storeId = '' } = useParams();
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const initialItemId = params.get('itemId') ?? '';

  const { data: storeData } = useGet<any>(`/stores/${storeId}`, undefined, !!storeId);
  const { data: itemsData, isLoading: itemsLoading } = useGet<any>(
    `/stores/${storeId}/items`,
    undefined,
    !!storeId,
  );
  const { data: salesData, isLoading: salesLoading } = useGet<any>('/sales-points');

  const items = rowsFrom<StoreItem>(itemsData);
  const salesPoints = rowsFrom<any>(salesData);

  const [itemId, setItemId] = useState(initialItemId);
  const [salesPointId, setSalesPointId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');

  const selectedItem = items.find((item) => item.itemId === itemId || item.id === itemId);
  const available = selectedItem ? itemQuantity(selectedItem) : 0;

  const issue = useAction(
    (body: any) => api.post('/stores/issues', body),
    {
      success: 'Stock issued successfully',
      invalidate: ['/stores/issues', `/stores/${storeId}/items`, `/stores/${storeId}`],
      onSuccess: () => navigate(`/stores/${storeId}`),
    },
  );

  const store = storeData?.store ?? storeData;

  return (
    <>
      <PageHeader title="Issue Stock" subtitle={`Issue stock from ${store?.name ?? 'store'} to a sales point`}>
        <Button asChild variant="outline">
          <Link to={`/stores/${storeId}`}><ArrowLeft className="h-4 w-4" /> Back to Store</Link>
        </Button>
      </PageHeader>
      <Card className="max-w-2xl p-5">
        {itemsLoading || salesLoading ? <Loading /> : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              issue.mutate({
                storeId,
                itemId,
                salesPointId,
                quantity: Number(quantity),
                issueDate: new Date(issueDate).toISOString(),
                notes: notes.trim() || undefined,
              });
            }}
          >
            <Field label="Item">
              <NativeSelect value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                <option value="">Select item</option>
                {items.map((item) => (
                  <option key={item.itemId ?? item.id} value={item.itemId ?? item.id}>
                    {itemName(item)} — Available: {num(itemQuantity(item))}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {selectedItem && (
              <p className="text-sm text-muted-foreground">
                Available stock: <strong>{num(available)}</strong>
              </p>
            )}
            <Field label="Sales point">
              <NativeSelect value={salesPointId} onChange={(e) => setSalesPointId(e.target.value)} required>
                <option value="">Select sales point</option>
                {salesPoints.map((point: any) => (
                  <option key={point.id} value={point.id}>{point.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Quantity to issue">
              <Input
                type="number"
                min="0.001"
                step="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </Field>
            <Field label="Issue date and time">
              <Input
                type="datetime-local"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
              />
            </Field>
            <Field label="Notes (optional)">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add a note about this stock issue"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={
                  !itemId || !salesPointId || !issueDate ||
                  Number(quantity) <= 0 || Number(quantity) > available ||
                  issue.isPending
                }
              >
                {issue.isPending ? 'Issuing...' : 'Confirm Stock Issue'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(`/stores/${storeId}`)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
