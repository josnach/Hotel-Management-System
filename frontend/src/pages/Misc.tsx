import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Bug,
  ClipboardList,
  FileText,
  Users as UsersIcon,
  Clock,
  Eye,
  Pencil,
  Trash2,
  CheckCircle2,
  Plus,
  X,
} from 'lucide-react';
import { ListCard } from '@/components/DataTable';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { d, dt, money, num } from '@/lib/utils';
import { Field, PageHeader } from '@/components/common';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { ListPage } from './ListPage';
import { useAuth } from '@/lib/auth';
export { default as ChangePassword } from './ChangePassword';

const ROLES = [
  'ADMIN',
  'MANAGER',
  'RECEPTIONIST',
  'HOUSEKEEPING',
  'WAITER',
  'CHEF',
  'ACCOUNTANT',
  'STOREKEEPER',
  'MAINTENANCE',
];

/** Tiny "create by name" form used above simple lists. */
function QuickAdd({
  endpoint,
  label,
  invalidate,
  extra,
  disabled,
}: {
  endpoint: string;
  label: string;
  invalidate: string;
  extra?: Record<string, unknown>;
  disabled?: boolean;
}) {
  const [name, setName] = useState('');

  const add = useAction(
    () => api.post(endpoint, { name, ...extra }),
    {
      success: `${label} added`,
      invalidate: [invalidate],
      onSuccess: () => setName(''),
    },
  );

  return (
    <div className="flex gap-2">
      <Input
        className="w-56"
        placeholder={`New ${label.toLowerCase()} name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button
        disabled={!name.trim() || add.isPending || disabled}
        onClick={() => add.mutate(undefined)}
      >
        Add
      </Button>
    </div>
  );
}

export const SalesPoints = () => (
  <ListPage
    title="Sales Points"
    endpoint="/sales-points"
    actions={
      <QuickAdd
        endpoint="/sales-points"
        label="Sales point"
        invalidate="/sales-points"
      />
    }
    cols={[
      {
        header: 'Name',
        cell: (s: any) => <b>{s.name}</b>,
      },
      {
        header: 'Status',
        cell: (u: any) => (
          <div className="flex gap-1">
            <Badge variant={u.isActive ? 'green' : 'gray'}>
              {u.isActive ? 'Active' : 'Disabled'}
            </Badge>
            {u.twoFactorEnabled && (
              <Badge variant="blue">2FA</Badge>
            )}
          </div>
        ),
      },
    ]}
  />
);

export const Groups = () => (
  <ListPage
    title="Groups"
    subtitle="Corporate and group accounts"
    endpoint="/groups"
    actions={
      <QuickAdd
        endpoint="/groups"
        label="Group"
        invalidate="/groups"
      />
    }
    cols={[
      {
        header: 'Group',
        cell: (g: any) => <b>{g.name}</b>,
      },
      {
        header: 'Contact',
        cell: (g: any) => g.contact ?? '—',
      },
      {
        header: 'Stays',
        cell: (g: any) => g._count.stays,
      },
    ]}
  />
);

const SECTION_LABELS: Record<string, string> = {
  FOOD: 'Foods',
  DRINKS: 'Drinks',
  PASTRIES: 'Pastries',
};


type InventoryCategory = {
  id: string;
  name: string;
  section: string;
  isActive: boolean;
  sortOrder: number;
  _count: {
    items: number;
    products?: number;
  };
};

export const Categories = () => {
  const [section, setSection] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState<InventoryCategory | null>(null);
  const [editingCategory, setEditingCategory] =
    useState<InventoryCategory | null>(null);
  const [editName, setEditName] = useState('');
  const [editSection, setEditSection] = useState('');

  const {
    data,
    isLoading,
    error,
  } = useGet('/inventory/categories');

  const categories: InventoryCategory[] = Array.isArray(data)
    ? data
    : [];

  const updateCategory = useAction(
    () =>
      api.put(`/inventory/categories/${editingCategory?.id}`, {
        name: editName.trim(),
        section: editSection,
      }),
    {
      success: 'Category updated successfully',
      invalidate: ['/inventory/categories'],
      onSuccess: () => {
        setEditingCategory(null);
        setSelectedCategory(null);
      },
    },
  );

  const deleteCategory = useAction(
    () => api.del(`/inventory/categories/${selectedCategory?.id}`),
    {
      success: 'Category deleted successfully',
      invalidate: ['/inventory/categories'],
      onSuccess: () => {
        setSelectedCategory(null);
        setEditingCategory(null);
      },
    },
  );

  const openEdit = (category: InventoryCategory) => {
    setSelectedCategory(null);
    setEditingCategory(category);
    setEditName(category.name);
    setEditSection(category.section);
  };

  const closeEdit = () => {
    setEditingCategory(null);
    setEditName('');
    setEditSection('');
  };

  const handleDelete = (category: InventoryCategory) => {
    if (
      category._count.items > 0 ||
      (category._count.products ?? 0) > 0
    ) {
      window.alert(
        'This category cannot be deleted because it contains inventory items or menu products.',
      );
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete the "${category.name}" category? This action cannot be undone.`,
    );

    if (!confirmed) return;

    setSelectedCategory(category);
    deleteCategory.mutate(undefined);
  };

  return (
    <>
      <ListPage
        title="Inventory Categories"
        endpoint="/inventory/categories"
        actions={
          <div className="flex flex-wrap gap-2">
            <NativeSelect
              className="w-40"
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              <option value="">Select section</option>
              <option value="FOOD">Foods</option>
              <option value="DRINKS">Drinks</option>
              <option value="PASTRIES">Pastries</option>
            </NativeSelect>

            <QuickAdd
              endpoint="/inventory/categories"
              label="Category"
              invalidate="/inventory/categories"
              extra={{ section }}
              disabled={!section}
            />
          </div>
        }
        cols={[
          {
            header: 'Category',
            cell: (c: InventoryCategory) => <b>{c.name}</b>,
          },
          {
            header: 'Section',
            cell: (c: InventoryCategory) =>
              SECTION_LABELS[c.section] ?? c.section,
          },
          {
            header: 'Items',
            cell: (c: InventoryCategory) =>
              c._count.items,
          },
          {
            header: 'Status',
            cell: (c: InventoryCategory) => (
              <Badge variant={c.isActive ? 'green' : 'gray'}>
                {c.isActive ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
          {
            header: 'Actions',
            cell: (c: InventoryCategory) => (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  title="View category"
                  onClick={() => {
                    setEditingCategory(null);
                    setSelectedCategory(c);
                  }}
                >
                  <Eye className="h-4 w-4" />
                  <span className="sr-only">View</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  title="Edit category"
                  onClick={() => openEdit(c)}
                >
                  <Pencil className="h-4 w-4" />
                  <span className="sr-only">Edit</span>
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  title="Delete category"
                  disabled={deleteCategory.isPending}
                  onClick={() => handleDelete(c)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Delete</span>
                </Button>
              </div>
            ),
          },
        ]}
      />

      {isLoading && (
        <p className="mt-4 text-sm text-muted-foreground">
          Loading categories...
        </p>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600">
          Unable to load inventory categories.
        </p>
      )}

      {selectedCategory && (
        <Card className="mt-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Category Details
            </h3>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedCategory(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">
                Category Name
              </p>
              <p className="font-medium">
                {selectedCategory.name}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                Section
              </p>
              <p className="font-medium">
                {SECTION_LABELS[selectedCategory.section] ??
                  selectedCategory.section}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                Inventory Items
              </p>
              <p className="font-medium">
                {selectedCategory._count.items}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                Menu Products
              </p>
              <p className="font-medium">
                {selectedCategory._count.products ?? 0}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                Status
              </p>
              <Badge
                variant={selectedCategory.isActive ? 'green' : 'gray'}
              >
                {selectedCategory.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </Card>
      )}

      {editingCategory && (
        <Card className="mt-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Edit Category
            </h3>

            <Button
              size="sm"
              variant="ghost"
              onClick={closeEdit}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category Name">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter category name"
              />
            </Field>

            <Field label="Section">
              <NativeSelect
                value={editSection}
                onChange={(e) => setEditSection(e.target.value)}
              >
                <option value="FOOD">Foods</option>
                <option value="DRINKS">Drinks</option>
                <option value="PASTRIES">Pastries</option>
              </NativeSelect>
            </Field>
          </div>

          <div className="mt-5 flex gap-2">
            <Button
              disabled={
                !editName.trim() ||
                !editSection ||
                updateCategory.isPending
              }
              onClick={() => updateCategory.mutate(undefined)}
            >
              {updateCategory.isPending
                ? 'Saving...'
                : 'Save Changes'}
            </Button>

            <Button
              variant="outline"
              onClick={closeEdit}
              disabled={updateCategory.isPending}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </>
  );
};


export const Stores = () => (
  <ListPage
    title="Stores"
    endpoint="/stores"
    actions={
      <QuickAdd
        endpoint="/stores"
        label="Store"
        invalidate="/stores"
      />
    }
    cols={[
      {
        header: 'Store',
        cell: (s: any) => <b>{s.name}</b>,
      },
    ]}
  />
);

export const Staff = () => (
  <ListPage
    title="Staff Management"
    subtitle="Employee records used by payroll"
    endpoint="/finance/employees"
    cols={[
      {
        header: 'Name',
        cell: (e: any) => <b>{e.fullName}</b>,
      },
      {
        header: 'Position',
        cell: (e: any) => e.position ?? '—',
      },
      {
        header: 'Department',
        cell: (e: any) => e.department ?? '—',
      },
      {
        header: 'Base salary',
        cell: (e: any) => money(e.baseSalary),
      },
    ]}
  />
);

export const Maintenance = () => {
  const resolve = useAction(
    (id: string) => api.post(`/maintenance/${id}/resolve`),
    {
      success: 'Marked resolved',
      invalidate: ['/maintenance', '/rooms'],
    },
  );

  return (
    <ListPage
      title="Maintenance"
      endpoint="/maintenance"
      cols={[
        {
          header: 'Room',
          cell: (t: any) => t.room?.number ?? '—',
        },
        {
          header: 'Issue',
          cell: (t: any) => (
            <div>
              <b>{t.title}</b>
              <div className="text-xs text-muted-foreground">
                {t.description}
              </div>
            </div>
          ),
        },
        {
          header: 'Status',
          cell: (t: any) => (
            <Badge
              variant={statusVariant(
                t.status === 'RESOLVED' ? 'COMPLETED' : 'PENDING',
              )}
            >
              {t.status}
            </Badge>
          ),
        },
        {
          header: 'Opened',
          cell: (t: any) => d(t.createdAt),
        },
        {
          header: 'Actions',
          cell: (t: any) =>
            t.status !== 'RESOLVED' && (
              <Button
                size="sm"
                variant="success"
                onClick={() => resolve.mutate(t.id)}
              >
                Resolve
              </Button>
            ),
        },
      ]}
    />
  );
};

export const StockReturns = () => {
  const { user } = useAuth();
  const isStorekeeper = user?.role === 'STOREKEEPER';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [salesPointId, setSalesPointId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [filters, setFilters] = useState({
    q: '',
    status: '',
    salesPointId: '',
    dateFrom: '',
    dateTo: '',
  });

  const { data, isLoading, error } = useGet<any[]>(
    '/stores/returns',
    filters,
  );

  const { data: filterOptions } = useGet<any>(
    '/stores/returns/filter-options',
  );

  const cols: any[] = [
    {
      header: 'Return #',
      cell: (r: any) => r.returnNo,
    },
    {
      header: 'Item',
      cell: (r: any) => r.item?.name ?? '—',
    },
    {
      header: 'Sales Point',
      cell: (r: any) => r.salesPoint?.name ?? '—',
    },
    {
      header: 'Quantity',
      cell: (r: any) => num(r.quantity, 0),
    },
    ...(!isStorekeeper
      ? [
          {
            header: 'Amount',
            cell: (r: any) => money(r.amount),
          },
        ]
      : []),
    {
      header: 'Disposition',
      cell: (r: any) => r.disposition,
    },
    {
      header: 'Status',
      cell: (r: any) => (
        <Badge variant={statusVariant(r.status)}>
          {r.status}
        </Badge>
      ),
    },
    {
      header: 'Date',
      cell: (r: any) => d(r.createdAt),
    },
    {
      header: 'Actions',
      cell: (_r: any) => '—',
    },
  ];

  const applyFilters = () => {
    setFilters({
      q: search.trim(),
      status,
      salesPointId,
      dateFrom,
      dateTo,
    });
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setSalesPointId('');
    setDateFrom('');
    setDateTo('');

    setFilters({
      q: '',
      status: '',
      salesPointId: '',
      dateFrom: '',
      dateTo: '',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Stock Returns">
        <Link to="/stores/returns/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Stock Return
          </Button>
        </Link>
      </PageHeader>

      {/* Filters */}
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
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
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Sales Point
            </label>

            <select
              value={salesPointId}
              onChange={(e) => setSalesPointId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
            >
              <option value="">All Sales Points</option>

              {(filterOptions?.salesPoints ?? []).map(
                (point: any) => (
                  <option key={point.id} value={point.id}>
                    {point.name}
                  </option>
                ),
              )}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
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
            <label className="mb-1.5 block text-sm font-medium">
              Date To
            </label>

            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyFilters();
            }}
            placeholder="Return number, item name..."
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm"
          />

          <div className="flex gap-2">
            <Button onClick={applyFilters}>
              Filter
            </Button>

            <Button
              variant="outline"
              onClick={clearFilters}
            >
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* Returns table */}
      <ListCard
        title="Stock Returns List"
        rows={data ?? []}
        cols={cols}
        loading={isLoading}
        error={error}
        empty="No stock returns found"
      />
    </div>
  );
};

export const StockReturnNew = () => {
  const navigate = useNavigate();

  const [stockIssueId, setStockIssueId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [disposition, setDisposition] = useState('RESTOCK');

  const {
    data: issues,
    isLoading,
    error,
  } = useGet<any[]>('/stores/returns/eligible-issues');

  const selectedIssue = (issues ?? []).find(
    (issue: any) => issue.id === stockIssueId,
  );

  const createReturn = useAction(
    (payload: any) => api.post('/stores/returns', payload),
    {
      success: 'Stock return submitted successfully',
      invalidate: [
        '/stores/returns',
        '/stores/returns/eligible-issues',
      ],
      onSuccess: () => navigate('/stores/returns'),
    },
  );

  const submitReturn = () => {
    if (!selectedIssue) return;

    const requestedQuantity = Number(quantity);

    if (
      !Number.isFinite(requestedQuantity) ||
      requestedQuantity <= 0 ||
      requestedQuantity > selectedIssue.remainingQuantity
    ) {
      return;
    }

    createReturn.mutate({
      stockIssueId,
      quantity: requestedQuantity,
      disposition,
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Create Stock Return
        </h1>
      </div>

      {isLoading ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Loading available stock issuances...
          </p>
        </Card>
      ) : error ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : 'Unable to load stock issuances.'}
          </p>

          <div className="mt-5">
            <Button
              variant="outline"
              onClick={() => navigate('/stores/returns')}
            >
              Back to Returns
            </Button>
          </div>
        </Card>
      ) : !issues?.length ? (
        <Card className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
          <CheckCircle2 className="mb-5 h-16 w-16 text-muted-foreground" />

          <h2 className="text-xl font-semibold">
            No issuances available for return
          </h2>

          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            There are no completed issuances with stock available to return.
          </p>

          <Button
            className="mt-6"
            onClick={() => navigate('/stores/returns')}
          >
            Back to Returns
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden border border-border shadow-sm">
          <div className="space-y-6 p-5 sm:p-7">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Stock Issuance
                <span className="ml-1 text-red-500">*</span>
              </label>

              <select
                value={stockIssueId}
                onChange={(e) => {
                  const id = e.target.value;
                  setStockIssueId(id);

                  const issue = issues.find(
                    (row: any) => row.id === id,
                  );

                  setQuantity(
                    issue
                      ? String(issue.remainingQuantity)
                      : '',
                  );
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
              >
                <option value="">Select an issuance</option>

                {issues.map((issue: any) => (
                  <option key={issue.id} value={issue.id}>
                    {issue.item?.name ?? 'Unknown item'} —{' '}
                    {issue.salesPoint?.name ?? 'Unknown sales point'} —{' '}
                    Available: {num(issue.remainingQuantity, 3)}
                  </option>
                ))}
              </select>
            </div>

            {selectedIssue && (
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Item
                    </p>
                    <p className="font-medium">
                      {selectedIssue.item?.name}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Store
                    </p>
                    <p className="font-medium">
                      {selectedIssue.store?.name ?? '—'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Sales Point
                    </p>
                    <p className="font-medium">
                      {selectedIssue.salesPoint?.name ?? '—'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Issued Quantity
                    </p>
                    <p className="font-medium">
                      {num(selectedIssue.quantity, 3)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Previously Returned
                    </p>
                    <p className="font-medium">
                      {num(selectedIssue.returnedQuantity, 3)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Available to Return
                    </p>
                    <p className="font-semibold text-primary">
                      {num(selectedIssue.remainingQuantity, 3)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium">
                Return Quantity
                <span className="ml-1 text-red-500">*</span>
              </label>

              <input
                type="number"
                min="0.001"
                max={selectedIssue?.remainingQuantity}
                step="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={!selectedIssue}
                placeholder="Enter quantity to return"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
              />

              {selectedIssue && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Maximum returnable quantity:{' '}
                  {num(selectedIssue.remainingQuantity, 3)}
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Disposition
                <span className="ml-1 text-red-500">*</span>
              </label>

              <select
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
              >
                <option value="RESTOCK">Restock</option>
                <option value="DAMAGED">Damaged</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => navigate('/stores/returns')}
              >
                Back to Returns
              </Button>

              <Button
                disabled={
                  createReturn.isPending ||
                  !selectedIssue ||
                  !quantity ||
                  Number(quantity) <= 0 ||
                  Number(quantity) > (selectedIssue?.remainingQuantity ?? 0)
                }
                onClick={submitReturn}
              >
                {createReturn.isPending
                  ? 'Submitting...'
                  : 'Submit Stock Return'}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export const StockIssues = () => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, error } = useGet<any[]>(
    '/stores/issues',
    {
      q: search.trim(),
      status,
    },
  );

  const issues = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="Stock Issue History">
        <Link to="/stores">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Issue
          </Button>
        </Link>
      </PageHeader>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by issue number..."
          />

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All Status</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading stock issues...
          </div>
        ) : error ? (
          <div className="p-5 text-sm text-red-600">
            {(error as Error)?.message || 'Unable to load stock issues.'}
          </div>
        ) : issues.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No stock issues found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">
                    Issue Number
                  </th>
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold">Sales Point</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Quantity
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">
                    Date
                  </th>
                  <th className="px-4 py-3 font-semibold">Issued By</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>

              <tbody>
                {issues.map((issue: any) => (
                  <tr
                    key={issue.id}
                    className="border-b last:border-0 hover:bg-muted/20"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {issue.issueNo || '—'}
                    </td>

                    <td className="px-4 py-3">
                      {issue.item?.name || '—'}
                    </td>

                    <td className="px-4 py-3">
                      {issue.salesPoint?.name || '—'}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      {num(issue.quantity, 3)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      {dt(issue.createdAt)}
                    </td>

                    <td className="px-4 py-3">
                      {issue.issuedBy?.fullName ||
                        issue.issuedBy?.username ||
                        '—'}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/stores/issues/${issue.id}`}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          View
                        </Link>

                        <Link
                          to={`/stores/issues/${issue.id}/print`}
                          className="font-medium text-green-600 hover:text-green-800 hover:underline"
                        >
                          Print
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export const StockIssueView = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    data: issue,
    isLoading,
    error,
  } = useGet<any>(
    `/stores/issues/${id || ''}`,
    undefined,
    Boolean(id),
  );

  if (isLoading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Loading stock issue...
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="space-y-4">
        <PageHeader title="Stock Issue Details">
          <Button variant="dark" onClick={() => navigate('/stores/issues')}>
            Back to List
          </Button>
        </PageHeader>

        <Card className="p-5 text-sm text-red-600">
          {(error as Error)?.message || 'Stock issue not found.'}
        </Card>
      </div>
    );
  }

  const issuer =
    issue.issuedBy?.fullName ||
    issue.issuedBy?.username ||
    'Unknown user';

  const Info = ({ label, value }: { label: string; value: any }) => (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium">
        {value === null || value === undefined || value === ''
          ? '—'
          : value}
      </dd>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Stock Issue Details">
        <Link to={`/stores/issues/${issue.id}/print`}>
          <Button className="bg-green-600 text-white hover:bg-green-700">
            <FileText className="mr-2 h-4 w-4" />
            Print
          </Button>
        </Link>

        <Button variant="dark" onClick={() => navigate('/stores/issues')}>
          Back to List
        </Button>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-5 border-b pb-3 text-base font-semibold">
            Issue Information
          </h2>

          <dl className="grid grid-cols-2 gap-x-5 gap-y-5">
            <Info label="Issue Number" value={issue.issueNo} />
            <Info label="Status" value={issue.status} />
            <Info label="Issue Date" value={dt(issue.createdAt)} />
            <Info label="Issued By" value={issuer} />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="mb-5 border-b pb-3 text-base font-semibold">
            Item Information
          </h2>

          <dl className="grid grid-cols-2 gap-x-5 gap-y-5">
            <Info label="Store" value={issue.store?.name} />
            <Info label="Item Name" value={issue.item?.name} />
            <Info
              label="Category"
              value={issue.item?.category?.name}
            />
            <Info
              label="Quantity Issued"
              value={num(issue.quantity, 3)}
            />
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-5 border-b pb-3 text-base font-semibold">
          Destination
        </h2>

        <dl className="grid gap-5 sm:grid-cols-2">
          <Info
            label="Sales Point"
            value={issue.salesPoint?.name}
          />
          <Info
            label="Location"
            value={issue.salesPoint?.location}
          />
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="mb-5 border-b pb-3 text-base font-semibold">
          Timeline
        </h2>

        <dl className="grid gap-5 sm:grid-cols-2">
          <Info
            label="Stock Issued"
            value={dt(issue.createdAt)}
          />
          <Info
            label="Last Updated"
            value={dt(issue.updatedAt)}
          />
        </dl>
      </Card>

      {issue.notes && (
        <Card className="p-5">
          <h2 className="mb-2 text-base font-semibold">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {issue.notes}
          </p>
        </Card>
      )}
    </div>
  );
};

export const StockIssuePrint = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    data: issue,
    isLoading,
    error,
  } = useGet<any>(
    `/stores/issues/${id || ''}`,
    undefined,
    Boolean(id),
  );

  if (isLoading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Loading stock issue receipt...
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="space-y-4">
        <PageHeader title="Stock Issue Receipt">
          <Button variant="dark" onClick={() => navigate('/stores/issues')}>
            Close
          </Button>
        </PageHeader>

        <Card className="p-5 text-sm text-red-600">
          {(error as Error)?.message || 'Stock issue not found.'}
        </Card>
      </div>
    );
  }

  const issuer =
    issue.issuedBy?.fullName ||
    issue.issuedBy?.username ||
    'Unknown user';

  const canSeeValuation =
    issue.unitCostSnapshot !== null &&
    issue.unitCostSnapshot !== undefined &&
    issue.totalValue !== null &&
    issue.totalValue !== undefined;

  return (
    <div className="space-y-5">
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 14mm;
          }

          body * {
            visibility: hidden !important;
          }

          .stock-issue-receipt,
          .stock-issue-receipt * {
            visibility: visible !important;
          }

          .stock-issue-receipt {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }

          .stock-issue-receipt .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="no-print">
        <PageHeader title="Stock Issue Receipt">
          <Button
            className="bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => window.print()}
          >
            <FileText className="mr-2 h-4 w-4" />
            Print Receipt
          </Button>

          <Button variant="dark" onClick={() => navigate(-1)}>
            Close
          </Button>
        </PageHeader>
      </div>

      <div className="stock-issue-receipt mx-auto max-w-4xl rounded-lg border bg-white p-6 text-slate-900 shadow-sm sm:p-10">
        <div className="border-b-2 border-slate-800 pb-5 text-center">
          <h1 className="text-2xl font-bold tracking-wide">
            STOCK ISSUE RECEIPT
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Stock transfer from store to sales point
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Issue Number
            </p>
            <p className="mt-1 font-semibold">{issue.issueNo}</p>
          </div>

          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Date
            </p>
            <p className="mt-1 font-semibold">{dt(issue.createdAt)}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 border-y py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              FROM
            </h2>
            <p className="mt-2 font-semibold">{issue.store?.name || '—'}</p>
            <p className="mt-1 text-sm text-slate-600">
              {issue.store?.description || '—'}
            </p>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              TO
            </h2>
            <p className="mt-2 font-semibold">
              {issue.salesPoint?.name || '—'}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {issue.salesPoint?.location || '—'}
            </p>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">
            Items Issued
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-50 text-left">
                  <th className="px-3 py-3 font-semibold">
                    Item Description
                  </th>
                  <th className="px-3 py-3 font-semibold">Category</th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Quantity
                  </th>

                  {canSeeValuation && (
                    <>
                      <th className="px-3 py-3 text-right font-semibold">
                        Unit Price
                      </th>
                      <th className="px-3 py-3 text-right font-semibold">
                        Total Value
                      </th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="px-3 py-4 font-medium">
                    {issue.item?.name || '—'}
                  </td>
                  <td className="px-3 py-4">
                    {issue.item?.category?.name || '—'}
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums">
                    {num(issue.quantity, 3)}
                  </td>

                  {canSeeValuation && (
                    <>
                      <td className="px-3 py-4 text-right tabular-nums">
                        {money(issue.unitCostSnapshot)}
                      </td>
                      <td className="px-3 py-4 text-right font-semibold tabular-nums">
                        {money(issue.totalValue)}
                      </td>
                    </>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-10 grid gap-8 border-t pt-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              ISSUED BY
            </h2>
            <p className="mt-2 font-semibold">{issuer}</p>
            <p className="mt-1 text-xs text-slate-500">
              User ID: {issue.issuedBy?.id || '—'}
            </p>
          </div>

          <div className="sm:text-right">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              STATUS
            </h2>
            <span className="mt-2 inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-semibold uppercase text-green-700">
              {issue.status || 'COMPLETED'}
            </span>
          </div>
        </div>

        <div className="mt-8 border-t pt-4 text-center">
          <p className="text-xs text-slate-500">
            Generated: {dt(new Date())}
          </p>

          <p className="mt-4 text-xs text-slate-500">
            This is an automated stock issue receipt. Please keep for your
            records.
          </p>
        </div>
      </div>
    </div>
  );
};
export const StockTransfers = () => (
  <ListPage
    title="Stock Transfers"
    endpoint="/stores/transfers"
    empty="No transfers yet"
    cols={[
      {
        header: 'Date',
        cell: (r: any) => dt(r.createdAt),
      },
      {
        header: 'From',
        cell: (r: any) => r.from.name,
      },
      {
        header: 'To',
        cell: (r: any) => r.to.name,
      },
      {
        header: 'Quantity',
        cell: (r: any) => num(r.quantity, 0),
      },
    ]}
  />
);

export const AutoExtensionLogs = () => (
  <ListPage
    title="Auto Extension Logs"
    endpoint="/stays/auto-extension/logs"
    empty="No auto extension activity has been recorded yet."
    actions={
      <Button variant="outline" asChild>
        <Link to="/stats/auto-extension">View Statistics</Link>
      </Button>
    }
    cols={[
      {
        header: 'Time',
        cell: (l: any) => dt(l.createdAt),
      },
      {
        header: 'Action',
        cell: (l: any) => l.action,
      },
      {
        header: 'Guests',
        cell: (l: any) => l.count,
      },
      {
        header: 'Revenue',
        cell: (l: any) => money(l.revenue),
      },
      {
        header: 'User',
        cell: (l: any) => l.userId ?? 'system',
      },
      {
        header: 'IP address',
        cell: (l: any) => l.ip ?? '—',
      },
    ]}
  />
);

export function AutoExtensionStats() {
  const { data } = useGet('/stays/auto-extension/stats');
  const { data: logs } = useGet<any[]>(
    '/stays/auto-extension/logs',
  );

  const run = useAction(
    () => api.post('/stays/auto-extension/run'),
    {
      success: 'Auto extension run complete',
      invalidate: [
        '/stays/auto-extension/stats',
        '/stays/auto-extension/logs',
        '/stays/next-checkout',
      ],
    },
  );

  const tile = (
    icon: any,
    label: string,
    value: any,
    subtitle: any,
  ) => (
    <Card className="flex items-center gap-3 p-4">
      <div className="rounded-lg bg-slate-100 p-3">
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">
          {label}
        </div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">
          {subtitle}
        </div>
      </div>
    </Card>
  );

  return (
    <>
      <PageHeader
        title="Auto Extension Statistics"
        subtitle="Automated stay extension system for checked-in guests"
      >
        <Button variant="outline" asChild>
          <Link to="/">Back to Dashboard</Link>
        </Button>
        <Button
          onClick={() =>
            confirm('Extend every overdue guest now?') &&
            run.mutate(undefined)
          }
          disabled={run.isPending}
        >
          <Bug className="h-4 w-4" />
          Run now
        </Button>
      </PageHeader>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {tile(
          <UsersIcon className="h-5 w-5" />,
          'Eligible Guests',
          data?.eligible ?? 0,
          <>
            <Badge variant="blue">
              {data?.individual ?? 0} Individual
            </Badge>{' '}
            <Badge variant="green">
              {data?.group ?? 0} Group
            </Badge>
          </>,
        )}

        {tile(
          <FileText className="h-5 w-5" />,
          'Potential Revenue',
          money(data?.potentialRevenue),
          'Total revenue from next auto-extension run',
        )}

        {tile(
          <Clock className="h-5 w-5" />,
          'Next Scheduled Run',
          data?.nextRun
            ? new Date(data.nextRun).toLocaleTimeString(
                'en-NG',
                {
                  hour: 'numeric',
                  minute: '2-digit',
                },
              )
            : '—',
          'Daily at 14:00',
        )}

        {tile(
          <ClipboardList className="h-5 w-5" />,
          'Last Run',
          data?.lastRun ? dt(data.lastRun) : 'Never',
          data?.lastRun ? '' : 'No runs recorded yet',
        )}
      </div>

      <Card className="p-4">
        <b>Recent Activity Logs</b>

        {!logs?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No auto extension activity has been recorded yet.
          </p>
        ) : (
          logs.slice(0, 8).map((l) => (
            <div
              key={l.id}
              className="flex justify-between border-b py-2 text-sm"
            >
              <span>
                {dt(l.createdAt)} — {l.action}
              </span>
              <span>
                {l.count} guests · {money(l.revenue)}
              </span>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

export function Users() {
  const [open, setOpen] = useState(false);

  const [f, setF] = useState({
    username: '',
    email: '',
    role: 'RECEPTIONIST',
    password: '',
  });

  const add = useAction(
    () => api.post('/users', f),
    {
      success: 'User created',
      invalidate: ['/users'],
      onSuccess: () => setOpen(false),
    },
  );

  const toggle = useAction(
    (id: string) => api.post(`/users/${id}/toggle`),
    {
      invalidate: ['/users'],
    },
  );

  const del = useAction(
    (id: string) => api.del(`/users/${id}`),
    {
      success: 'User deleted',
      invalidate: ['/users'],
    },
  );

  const forceLogout = useAction(
    (id: string) => api.post(`/users/${id}/force-logout`),
    {
      success: 'User signed out of all devices',
      invalidate: ['/users'],
    },
  );

  const reset2fa = useAction(
    (id: string) => api.post(`/users/${id}/reset-2fa`),
    {
      success: 'Two-factor reset. The user can enrol again.',
      invalidate: ['/users'],
    },
  );

  return (
    <>
      <ListPage
        title="Users Management"
        endpoint="/users"
        actions={
          <Button
            variant="default"
            onClick={() => setOpen(!open)}
          >
            Add New User
          </Button>
        }
        cols={[
          {
            header: 'User',
            cell: (u: any) => (
              <div>
                <b>{u.username}</b>
                <div className="text-xs text-muted-foreground">
                  {u.email}
                </div>
              </div>
            ),
          },
          {
            header: 'Role',
            cell: (u: any) => <Badge>{u.role}</Badge>,
          },
          {
            header: 'Status',
            cell: (u: any) => (
              <Badge variant={u.isActive ? 'green' : 'gray'}>
                {u.isActive ? 'Active' : 'Disabled'}
              </Badge>
            ),
          },
          {
            header: 'Actions',
            cell: (u: any) => (
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                <button
                  type="button"
                  className="text-blue-700 hover:text-blue-900 disabled:opacity-50"
                  disabled={forceLogout.isPending}
                  onClick={() =>
                    confirm(
                      `Sign ${u.username} out of every device?`,
                    ) && forceLogout.mutate(u.id)
                  }
                >
                  Force logout
                </button>

                {u.twoFactorEnabled && (
                  <button
                    type="button"
                    className="text-purple-700 hover:text-purple-900 disabled:opacity-50"
                    disabled={reset2fa.isPending}
                    onClick={() =>
                      confirm(
                        `Reset two-factor for ${u.username}? They will be signed out and must enrol again.`,
                      ) && reset2fa.mutate(u.id)
                    }
                  >
                    Reset 2FA
                  </button>
                )}

                <button
                  type="button"
                  className="text-orange-600 hover:text-orange-800 disabled:opacity-50"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(u.id)}
                >
                  {u.isActive ? 'Disable' : 'Enable'}
                </button>

                <button
                  type="button"
                  className="text-red-600 hover:text-red-800 disabled:opacity-50"
                  disabled={del.isPending}
                  onClick={() =>
                    confirm(`Delete ${u.username}?`) &&
                    del.mutate(u.id)
                  }
                >
                  Delete
                </button>
              </div>
            ),
          },
        ]}
      />

      {open && (
        <Card className="mt-4 grid gap-3 p-4 md:grid-cols-5">
          <Field label="Username">
            <Input
              value={f.username}
              onChange={(e) =>
                setF({ ...f, username: e.target.value })
              }
            />
          </Field>

          <Field label="Email">
            <Input
              type="email"
              value={f.email}
              onChange={(e) =>
                setF({ ...f, email: e.target.value })
              }
            />
          </Field>

          <Field label="Role">
            <NativeSelect
              value={f.role}
              onChange={(e) =>
                setF({ ...f, role: e.target.value })
              }
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Password (8+ chars)">
            <Input
              type="password"
              value={f.password}
              onChange={(e) =>
                setF({ ...f, password: e.target.value })
              }
            />
          </Field>

          <div className="flex items-end">
            <Button
              onClick={() => add.mutate(undefined)}
              disabled={
                f.password.length < 8 ||
                !f.username.trim() ||
                !f.email.trim() ||
                add.isPending
              }
            >
              Create
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
