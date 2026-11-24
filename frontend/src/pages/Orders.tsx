
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { dt, money } from '@/lib/utils';

import {
  Field,
  FilterBar,
  PageHeader,
  Stat,
} from '@/components/common';

import { ListCard } from '@/components/DataTable';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';

import {
  fetchOrderForPrinting,
  printSaleDocuments,
} from '@/lib/pos-print';
const STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'SERVED',
  'COMPLETED',
  'CANCELLED',
];
const tones: Record<
  string,
  'purple' | 'blue' | 'green' | 'yellow' | 'red' | 'white' | 'orange'> = {
  PENDING: 'yellow',
  CONFIRMED: 'blue',
  PREPARING: 'purple',
  READY: 'green',
  SERVED: 'white',
  COMPLETED: 'white',
  CANCELLED: 'red',
};

const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER'];

// --------------------------------------------------
// Order Management
// --------------------------------------------------

export default function Orders() {
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<any>({});

  const [paymentMethods, setPaymentMethods] = useState<
    Record<string, string>
  >({});

  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useGet('/orders', applied);

  const refreshOrders = async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({
        queryKey: ['/orders/kitchen'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['/orders/unpaid-count'],
      }),
    ]);
  };

  // --------------------------------------------------
  // Mark an order as served
  // --------------------------------------------------

  const markServed = async (order: any) => {
    setBusyOrderId(order.id);

    try {
      await api.patch(`/orders/${order.id}/status`, {
        status: 'SERVED',
      });

      toast.success(`Order ${order.orderNo} marked as served`);

      await refreshOrders();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not mark this order as served',
      );
    } finally {
      setBusyOrderId(null);
    }
  };

  // --------------------------------------------------
  // Record payment
  // --------------------------------------------------

  const recordPayment = async (order: any) => {
    const method = paymentMethods[order.id] || 'CASH';

    setBusyOrderId(order.id);

    try {
      await api.post(`/orders/${order.id}/pay`, { method });

      toast.success(`Payment recorded for ${order.orderNo}`);

      await refreshOrders();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not record payment',
      );
    } finally {
      setBusyOrderId(null);
    }
  };

  // --------------------------------------------------
  // Complete sale and print guest bill/payment receipt
  // --------------------------------------------------


const completeSale = async (order: any) => {
  if (order.status !== 'SERVED') {
    toast.error('Only served orders can be completed');
    return;
  }

  const isPaid = order.paymentStatus === 'PAID';

  const isApprovedDeferred =
    Boolean(order.isStaffCredit) ||
    ['STAFF_CREDIT', 'CITY_LEDGER'].includes(order.paymentMethod);

  if (!isPaid && !isApprovedDeferred) {
    toast.error('Record payment before completing this sale');
    return;
  }

  // Open exactly ONE print window from the user's click.
  const printWindow = window.open(
    '',
    '_blank',
    'width=480,height=720',
  );

  setBusyOrderId(order.id);

  try {
    await api.post(`/orders/${order.id}/complete`);

    const completedOrder = await fetchOrderForPrinting(order.id);

    if (printWindow && !printWindow.closed) {
      // One print operation containing the guest bill
      // and, when paid, the payment receipt.
      printSaleDocuments(printWindow, completedOrder);
    } else {
      toast.warning(
        'Sale completed, but the print window was blocked. Allow pop-ups and try reprinting.',
      );
    }

    await refreshOrders();

    toast.success(`Sale ${order.orderNo} completed`);
  } catch (error) {
    printWindow?.close();

    toast.error(
      error instanceof Error
        ? error.message
        : 'Could not complete this sale',
    );
  } finally {
    setBusyOrderId(null);
  }
};

  return (
    <>
      <PageHeader title="Order Management">
        <Button onClick={() => nav('/pos')}>
          New Order
        </Button>
      </PageHeader>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {STATUSES.map((s) => (
          <Stat
            key={s}
            tone={tones[s]}
            label={s[0] + s.slice(1).toLowerCase()}
            value={data?.summary?.[s] ?? 0}
            className="text-center"
          />
        ))}
      </div>

      <FilterBar>
        <Field label="Order Status">
          <NativeSelect
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All Status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0] + s.slice(1).toLowerCase()}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Date From">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>

        <Field label="Date To">
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>

        <div className="flex items-end">
          <Button
            className="w-full"
            onClick={() => setApplied({ status, from, to })}
          >
            Filter
          </Button>
        </div>
      </FilterBar>

      <ListCard
        rows={data?.rows}
        loading={isLoading}
        cols={[
          {
            header: 'Order #',
            cell: (o: any) => (
              <span className="font-mono text-xs">
                {o.orderNo}
              </span>
            ),
          },
          {
            header: 'Customer',
            cell: (o: any) =>
              o.guest
                ? `${o.guest.firstName} ${o.guest.lastName}`
                : o.group?.name ?? 'Walk-in Customer',
          },
          {
            header: 'Staff',
            cell: (o: any) => o.staff?.username ?? '—',
          },
          {
            header: 'Total',
            cell: (o: any) => <b>{money(o.total)}</b>,
          },
          {
            header: 'Status',
            cell: (o: any) => (
              <Badge variant={statusVariant(o.status)}>
                {o.status[0] + o.status.slice(1).toLowerCase()}
              </Badge>
            ),
          },
          {
            header: 'Payment',
            cell: (o: any) => (
              <Badge variant={statusVariant(o.paymentStatus)}>
                {o.paymentStatus[0] +
                  o.paymentStatus.slice(1).toLowerCase()}
              </Badge>
            ),
          },
          {
            header: 'Date',
            cell: (o: any) => dt(o.createdAt),
          },
          {
            header: 'Actions',
            cell: (o: any) => {
              const deferred =
                Boolean(o.isStaffCredit) ||
                ['STAFF_CREDIT', 'CITY_LEDGER'].includes(
                  o.paymentMethod,
                );

              return (
                <div className="flex min-w-[180px] flex-col gap-2">
                  {o.status === 'READY' && (
                    <Button
                      size="sm"
                      disabled={busyOrderId === o.id}
                      onClick={() => void markServed(o)}
                    >
                      Mark Served
                    </Button>
                  )}

                  {o.status === 'SERVED' &&
                    o.paymentStatus !== 'PAID' &&
                    !deferred && (
                      <>
                        <NativeSelect
                          value={paymentMethods[o.id] || 'CASH'}
                          onChange={(e) =>
                            setPaymentMethods((current) => ({
                              ...current,
                              [o.id]: e.target.value,
                            }))
                          }
                        >
                          {PAYMENT_METHODS.map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </NativeSelect>

                        <Button
                          size="sm"
                          disabled={busyOrderId === o.id}
                          onClick={() => void recordPayment(o)}
                        >
                          Record Payment
                        </Button>
                      </>
                    )}

                  {o.status === 'SERVED' &&
                    (o.paymentStatus === 'PAID' || deferred) && (
                      <Button
                        size="sm"
                        disabled={busyOrderId === o.id}
                        onClick={() => void completeSale(o)}
                      >
                        Complete Sale
                      </Button>
                    )}
                </div>
              );
            },
          },
        ]}
      />
    </>
  );
}


// --------------------------------------------------
// Create New Order
// --------------------------------------------------

export function NewOrder() {
  const nav = useNavigate();

  const { data: sps } = useGet<any[]>('/sales-points');
  const { data: inHouse } = useGet<any[]>('/stays/in-house');
  const { data: groups } = useGet<any[]>('/groups');

  const [f, setF] = useState<any>({
    customerType: 'WALK_IN',
    guestId: '',
    groupId: '',
    salesPointId: '',
    paymentMethod: 'CASH',
    instructions: '',
    notes: '',
  });

  const { data: cat } = useGet(
    `/sales-points/${f.salesPointId}/catalog`,
    undefined,
    !!f.salesPointId,
  );

  const [lines, setLines] = useState<
    {
      itemId: string;
      quantity: number;
      instructions: string;
    }[]
  >([
    {
      itemId: '',
      quantity: 1,
      instructions: '',
    },
  ]);

  const price = (id: string) =>
    Number(
      cat?.items?.find((item: any) => item.id === id)?.sellPrice ?? 0,
    );

  const total = lines.reduce(
    (sum, line) =>
      sum + price(line.itemId) * line.quantity,
    0,
  );

  const upd = (index: number, patch: any) =>
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? { ...line, ...patch }
          : line,
      ),
    );

  const save = useAction(
    () =>
      api.post('/orders', {
        ...f,
        guestId: f.guestId || undefined,
        groupId: f.groupId || undefined,
        items: lines
          .filter((line) => line.itemId)
          .map((line) => ({
            ...line,
            instructions: line.instructions || undefined,
          })),
      }),
    {
      success: 'Order created',
      invalidate: ['/orders'],
      onSuccess: () => nav('/orders'),
    },
  );

  return (
    <div className="mx-auto max-w-3xl">
      <Card className="space-y-4 p-6">
        <h1 className="text-lg font-bold">Create New Order</h1>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer Type *">
            <NativeSelect
              value={f.customerType}
              onChange={(event) =>
                setF({
                  ...f,
                  customerType: event.target.value,
                  guestId: '',
                  groupId: '',
                })
              }
            >
              <option value="WALK_IN">Walk-in Customer</option>
              <option value="GUEST">Guest (In-House)</option>
              <option value="GROUP">Group</option>
            </NativeSelect>
          </Field>

          <Field label="Sales Point *">
            <NativeSelect
              value={f.salesPointId}
              onChange={(event) => {
                setF({
                  ...f,
                  salesPointId: event.target.value,
                });

                setLines([
                  {
                    itemId: '',
                    quantity: 1,
                    instructions: '',
                  },
                ]);
              }}
            >
              <option value="">Select Sales Point</option>

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

          {f.customerType === 'GUEST' && (
            <Field label="In-house guest">
              <NativeSelect
                value={f.guestId}
                onChange={(event) =>
                  setF({
                    ...f,
                    guestId: event.target.value,
                  })
                }
              >
                <option value="">Select guest</option>

                {inHouse?.map((stay: any) => (
                  <option key={stay.id} value={stay.guestId}>
                    {stay.room.number} — {stay.guest.firstName}{' '}
                    {stay.guest.lastName}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}

          {f.customerType === 'GROUP' && (
            <Field label="Group">
              <NativeSelect
                value={f.groupId}
                onChange={(event) =>
                  setF({
                    ...f,
                    groupId: event.target.value,
                  })
                }
              >
                <option value="">Select group</option>

                {groups?.map((group: any) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}

          <Field label="Payment Method *">
            <NativeSelect
              value={f.paymentMethod}
              onChange={(event) =>
                setF({
                  ...f,
                  paymentMethod: event.target.value,
                })
              }
            >
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="TRANSFER">Transfer</option>
              <option value="ROOM_CHARGE">Charge to Room</option>
              <option value="CITY_LEDGER">City Ledger</option>
            </NativeSelect>
          </Field>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-semibold">Order Items</span>

          <Button
            size="sm"
            variant="success"
            onClick={() =>
              setLines((current) => [
                ...current,
                {
                  itemId: '',
                  quantity: 1,
                  instructions: '',
                },
              ])
            }
          >
            + Add Item
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left">Item</th>
                <th>Unit price</th>
                <th>Quantity</th>
                <th>Subtotal</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className="border-t align-top">
                  <td className="py-2">
                    <NativeSelect
                      value={line.itemId}
                      onChange={(event) =>
                        upd(index, {
                          itemId: event.target.value,
                        })
                      }
                    >
                      <option value="">Select Item</option>

                      {cat?.items?.map((item: any) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </NativeSelect>

                    <Textarea
                      className="mt-1 min-h-[36px]"
                      placeholder="Special instructions…"
                      value={line.instructions}
                      onChange={(event) =>
                        upd(index, {
                          instructions: event.target.value,
                        })
                      }
                    />
                  </td>

                  <td className="px-2 text-center">
                    {money(price(line.itemId))}
                  </td>

                  <td className="px-2">
                    <Input
                      type="number"
                      min="1"
                      className="w-20"
                      value={line.quantity}
                      onChange={(event) =>
                        upd(index, {
                          quantity: Math.max(
                            1,
                            Number(event.target.value) || 1,
                          ),
                        })
                      }
                    />
                  </td>

                  <td className="text-center">
                    {money(
                      price(line.itemId) * line.quantity,
                    )}
                  </td>

                  <td>
                    <button
                      type="button"
                      className="text-red-600"
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines((current) =>
                          current.filter(
                            (_, lineIndex) =>
                              lineIndex !== index,
                          ),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-right text-lg font-bold">
          Total: {money(total)}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Special Instructions">
            <Textarea
              value={f.instructions}
              onChange={(event) =>
                setF({
                  ...f,
                  instructions: event.target.value,
                })
              }
            />
          </Field>

          <Field label="Order Notes">
            <Textarea
              value={f.notes}
              onChange={(event) =>
                setF({
                  ...f,
                  notes: event.target.value,
                })
              }
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => nav('/orders')}
          >
            Cancel
          </Button>

          <Button
            disabled={
              !f.salesPointId ||
              !lines.some((line) => line.itemId) ||
              save.isPending
            }
            onClick={() => save.mutate(undefined)}
          >
            {save.isPending ? 'Creating…' : 'Create order'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// --------------------------------------------------
// Kitchen Display
// --------------------------------------------------

export function Kitchen() {
  const { data, refetch } = useGet('/orders/kitchen');

  const next = useAction(
    (value: { id: string; status: string }) =>
      api.patch(`/orders/${value.id}/status`, {
        status: value.status,
      }),
    {
      invalidate: ['/orders/kitchen'],
    },
  );

  const col = (
    title: string,
    rows: any[] | undefined,
    tone: string,
    empty: string,
    nextStatus: (order: any) => string,
    label: string,
  ) => (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="mb-3 font-semibold">
        {title} <Badge>{rows?.length ?? 0}</Badge>
      </div>

      {!rows?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        rows.map((order) => (
          <Card key={order.id} className="mb-2 p-3 text-sm">
            <div className="flex justify-between">
              <b>{order.orderNo}</b>

              <span className="text-xs text-muted-foreground">
                {order.salesPoint.name}
              </span>
            </div>

            <ul className="my-1 list-disc pl-5">
              {order.items.map((item: any) => (
                <li key={item.id}>
                  {item.quantity} × {item.item.name}

                  {item.instructions && (
                    <em className="text-xs text-muted-foreground">
                      {' '}({item.instructions})
                    </em>
                  )}
                </li>
              ))}
            </ul>

            {label && (
              <Button
                size="sm"
                disabled={next.isPending}
                onClick={() =>
                  next.mutate({
                    id: order.id,
                    status: nextStatus(order),
                  })
                }
              >
                {label}
              </Button>
            )}
          </Card>
        ))
      )}
    </div>
  );

  return (
    <>
      <PageHeader title="Kitchen Display - Standard Orders">
        <Button onClick={() => void refetch()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        {col(
          'Pending Orders',
          data?.pending,
          'bg-yellow-50',
          'No pending orders',
          (order) =>
            ['PENDING', 'CONFIRMED'].includes(order.status)
              ? 'PREPARING'
              : 'READY',
          'Advance',
        )}

        {col(
          'Ready Orders',
          data?.ready,
          'bg-green-50',
          'No ready orders',
          () => 'SERVED',
          '',
        )}
      </div>
    </>
  );
}
