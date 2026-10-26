import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Minus,
  Plus,
  Trash2,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/lib/auth';
import { useGet } from '@/lib/hooks';
import { cn, money } from '@/lib/utils';

import {
  enqueueOrder,
   getPosMenuData,
  listOfflineOrders,
  retryFailedOrder,
  subscribeToQueueChanges,
  syncPendingOrders,
  type OfflineOrder,
} from '@/lib/offline-pos';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

const SECTIONS = [
  ['FOOD', 'Foods'],
  ['DRINKS', 'Drinks'],
  ['PASTRIES', 'Pastries'],
] as const;

type Section = (typeof SECTIONS)[number][0];

export default function POS() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // --------------------------------------------------
  // Offline POS state
  // --------------------------------------------------

  const [isOnline, setIsOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  );

  const [isSyncing, setIsSyncing] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [offlineOrders, setOfflineOrders] = useState<OfflineOrder[]>([]);

  const refreshOfflineOrders = useCallback(async () => {
    try {
      setOfflineOrders(await listOfflineOrders());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not load locally saved orders',
      );
    }
  }, []);

  const invalidateOrderQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['/orders'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['/orders/unpaid-count'],
      }),
    ]);
  }, [queryClient]);

  // --------------------------------------------------
  // Automatic synchronization
  // --------------------------------------------------

  useEffect(() => {
    let mounted = true;
    let synchronizing = false;

    const refresh = async () => {
      if (!mounted) return;

      setIsOnline(navigator.onLine);
      await refreshOfflineOrders();
    };

    const synchronize = async () => {
      if (!navigator.onLine) {
        if (mounted) setIsOnline(false);
        return;
      }

      if (!mounted || synchronizing) return;

      synchronizing = true;
      setIsOnline(true);
      setIsSyncing(true);

      try {
        await syncPendingOrders();

        if (mounted) {
          await refreshOfflineOrders();
          await invalidateOrderQueries();
        }
      } catch {
        // Keep pending orders persisted for a future retry.
      } finally {
        synchronizing = false;

        if (mounted) {
          setIsSyncing(false);
        }
      }
    };

    const onOnline = () => {
      void synchronize();
    };

    const onOffline = () => {
      if (mounted) setIsOnline(false);
    };

    const onQueueChanged = () => {
      void refresh();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const unsubscribe = subscribeToQueueChanges(onQueueChanged);

    void refresh().then(() => {
      if (mounted) void synchronize();
    });

    return () => {
      mounted = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      unsubscribe();
    };
  }, [refreshOfflineOrders, invalidateOrderQueries]);

  // --------------------------------------------------
  // Manual synchronization
  // --------------------------------------------------

  const handleSync = async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      toast.error('You are offline. Reconnect before synchronizing.');
      return;
    }

    if (isSyncing) return;

    setIsSyncing(true);

    try {
      await syncPendingOrders();
      await refreshOfflineOrders();
      await invalidateOrderQueries();

      toast.success('Synchronization attempt completed');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Synchronization failed',
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // --------------------------------------------------
  // Sales points, categories, cart and payment state
  // --------------------------------------------------

const { data: sps } = useQuery<any[]>({
  queryKey: ['pos-menu', 'sales-points'],
  queryFn: () => getPosMenuData<any[]>('/sales-points'),
  networkMode: 'always',
  retry: false,
});

const [sp, setSp] = useState('');

const { data: cat, isError: menuError } = useQuery<any>({
  queryKey: ['pos-menu', 'catalog', sp],
  queryFn: () => getPosMenuData<any>(`/sales-points/${sp}/catalog`),
  enabled: !!sp,
  networkMode: 'always',
  retry: false,
});

  const [section, setSection] = useState<Section>('FOOD');
  const [catId, setCatId] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState('');

  const [flags, setFlags] = useState({
    comp: false,
    vat: false,
    sc: false,
    staff: false,
  });

  const [guestId, setGuestId] = useState('');
  const [note, setNote] = useState('');

  const canApprove =
    user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const needsNote = flags.comp || flags.staff;

  const { data: inHouse } = useGet<any[]>(
    '/stays/in-house',
    undefined,
    method === 'ROOM_CHARGE',
  );

  const items: any[] = cat?.items ?? [];
  const allCats: any[] = cat?.categories ?? [];

  const sectionCats = allCats.filter(
    (category) => category.section === section,
  );

  const sectionCount = (selectedSection: Section) =>
    allCats
      .filter((category) => category.section === selectedSection)
      .reduce(
        (count, category) => count + Number(category.count || 0),
        0,
      );

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => ({
          item: items.find((item) => item.id === id),
          qty,
        }))
        .filter((line) => line.item && line.qty > 0),
    [cart, items],
  );

  const subtotal = lines.reduce(
    (sum, line) => sum + Number(line.item.sellPrice) * line.qty,
    0,
  );

  const serviceCharge = flags.sc ? subtotal * 0.1 : 0;
  const vat = flags.vat ? subtotal * 0.075 : 0;
  const total = flags.comp ? 0 : subtotal + serviceCharge + vat;

  const add = (item: any, delta: number) => {
    setCart((currentCart) => {
      const quantity = Math.max(
        0,
        (currentCart[item.id] ?? 0) + delta,
      );

      const { [item.id]: removed, ...remaining } = currentCart;

      return quantity
        ? { ...remaining, [item.id]: quantity }
        : remaining;
    });
  };

  const resetOrder = () => {
    setCart({});
    setNote('');
    setGuestId('');

    setFlags((current) => ({
      ...current,
      comp: false,
      staff: false,
    }));
  };

  // --------------------------------------------------
  // Complete sale: enqueue first, then synchronize
  // --------------------------------------------------

  const submitOrder = async () => {
    if (
      !lines.length ||
      !method ||
      !sp ||
      (needsNote && note.trim().length < 3) ||
      (method === 'ROOM_CHARGE' && !guestId)
    ) {
      return;
    }

    if (flags.comp && !canApprove) {
      toast.error(
        'You are not authorized to approve complimentary orders',
      );
      return;
    }

    if (submittingOrder) return;

    setSubmittingOrder(true);

    const salesPointId = sp;

    const payload = {
      customerType: method === 'ROOM_CHARGE' ? 'GUEST' : 'WALK_IN',
      guestId: guestId || undefined,
      salesPointId,
      paymentMethod: flags.staff ? 'STAFF_CREDIT' : method,
      items: lines.map((line) => ({
        itemId: line.item.id,
        quantity: line.qty,
      })),
      applyVat: flags.vat,
      applyServiceCharge: flags.sc,
      isComplimentary: flags.comp,
      isStaffCredit: flags.staff,
      payLater: flags.staff,
      notes: note.trim() || undefined,
    };

    try {
      // Persist the order and its idempotency key before networking.
      const queuedOrder = await enqueueOrder(payload);

      await refreshOfflineOrders();

      resetOrder();

      toast.success(
        navigator.onLine
          ? 'Order saved locally; synchronizing with server'
          : 'Order saved on this device and queued for synchronization',
      );

      if (!navigator.onLine) {
        setIsOnline(false);
        return;
      }

      setIsSyncing(true);

      try {
        await syncPendingOrders();
        await refreshOfflineOrders();

        const savedOrders = await listOfflineOrders();

        // Find the exact order just enqueued, not the last queue entry.
        const latest = savedOrders.find(
          (order) => order.id === queuedOrder.id,
        );

        if (latest?.status === 'synced') {
          toast.success('Order accepted by the server');

          await invalidateOrderQueries();

          await queryClient.invalidateQueries({
            queryKey: [`/sales-points/${salesPointId}/catalog`],
          });
        } else if (latest?.status === 'failed') {
          toast.error(
            latest.error ??
              'The server rejected the order. Review the offline queue.',
          );
        } else if (latest?.status === 'queued') {
          toast.message(
            'Order remains queued until synchronization succeeds',
          );
        } else {
          toast.message(
            'Synchronization finished, but the status of this order could not be confirmed. Check the order queue.',
          );
        }
      } catch (error) {
        await refreshOfflineOrders();

        toast.error(
          error instanceof Error
            ? `Order remains saved locally: ${error.message}`
            : 'Order remains saved locally and can be synchronized later',
        );
      } finally {
        setIsSyncing(false);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not save the order locally',
      );
    } finally {
      setSubmittingOrder(false);
    }
  };

  // --------------------------------------------------
  // Retry failed orders
  // --------------------------------------------------

  const handleRetry = async (orderId: string) => {
    if (!navigator.onLine) {
      toast.error('Reconnect to the internet before retrying');
      return;
    }

    if (isSyncing) return;

    setIsSyncing(true);

    try {
      await retryFailedOrder(orderId);
      await syncPendingOrders();
      await refreshOfflineOrders();
      await invalidateOrderQueries();

      toast.success('Order retry attempt completed');
    } catch (error) {
      await refreshOfflineOrders();

      toast.error(
        error instanceof Error ? error.message : 'Retry failed',
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const shown = catId
    ? items.filter((item) => item.categoryId === catId)
    : items;

  const queuedCount = offlineOrders.filter(
    (order) => order.status === 'queued',
  ).length;

  const failedCount = offlineOrders.filter(
    (order) => order.status === 'failed',
  ).length;

  const syncedCount = offlineOrders.filter(
    (order) => order.status === 'synced',
  ).length;

  // --------------------------------------------------
  // Interface
  // --------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Connection status and offline order queue */}

      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            {isOnline ? (
              <Wifi
                className={cn(
                  'h-4 w-4',
                  isSyncing ? 'text-amber-600' : 'text-green-600',
                )}
              />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}

            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                !isOnline
                  ? 'bg-red-500'
                  : isSyncing
                    ? 'bg-amber-500'
                    : 'bg-green-500',
              )}
            />

            {isSyncing
              ? 'Synchronizing orders…'
              : isOnline
                ? 'Online'
                : 'Offline — orders will be queued on this device'}
          </div>

          <div className="text-xs text-muted-foreground">
            {queuedCount} queued · {failedCount} failed · {syncedCount} synced
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={!isOnline || isSyncing}
            onClick={() => void handleSync()}
          >
            <RefreshCw
              className={cn('mr-2 h-4 w-4', isSyncing && 'animate-spin')}
            />
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>

        {offlineOrders.some(
          (order) =>
            order.status === 'queued' || order.status === 'failed',
        ) && (
          <div className="mt-3 space-y-2 border-t pt-3">
            {offlineOrders
              .filter(
                (order) =>
                  order.status === 'queued' || order.status === 'failed',
              )
              .map((order) => (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">
                      {order.serverOrderNo ??
                        `Local order ${order.id.slice(0, 8)}`}
                    </span>

                    <span className="ml-2 text-muted-foreground">
                      {order.status === 'failed'
                        ? 'Needs attention'
                        : 'Waiting to sync'}
                    </span>

                    {order.error && (
                      <p className="mt-1 break-words text-xs text-red-600">
                        {order.error}
                      </p>
                    )}
                  </div>

                  {order.status === 'failed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!isOnline || isSyncing}
                      onClick={() => void handleRetry(order.id)}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_320px]">
        {/* Sales points and categories */}

        <div className="space-y-4">
          <Button className="w-full" variant="default">
            ＋ Add to Existing Order
          </Button>

          <Card className="p-4">
            <div className="mb-2 font-semibold">Sales Points</div>

            <NativeSelect
              value={sp}
              onChange={(event) => {
                setSp(event.target.value);
                setCart({});
                setCatId('');
              }}
            >
              <option value="">Select Sales Point</option>

              {sps?.map((salesPoint) => (
                <option key={salesPoint.id} value={salesPoint.id}>
                  {salesPoint.name}
                </option>
              ))}
            </NativeSelect>
          </Card>

          <Card className="p-4">
            <div className="grid grid-cols-3 gap-2">
              {SECTIONS.map(([key, label]) => (
                <Button
                  key={key}
                  variant={section === key ? 'default' : 'outline'}
                  className="h-auto flex-col gap-0.5 px-1 py-2"
                  disabled={!sp}
                  onClick={() => {
                    setSection(key);
                    setCatId('');
                  }}
                >
                  <span className="text-sm">{label}</span>

                  {sp && (
                    <span className="text-[10px] opacity-70">
                      {sectionCount(key)} items
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-2 font-semibold">Categories</div>

            {sectionCats.map((category: any) => (
              <button
                key={category.id}
                onClick={() =>
                  setCatId(
                    catId === category.id ? '' : category.id,
                  )
                }
                className={cn(
                  'mb-1.5 flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm',
                  catId === category.id && 'border-primary bg-accent',
                )}
              >
                {category.name}

                <span className="rounded-full bg-slate-100 px-2 text-xs">
                  {category.count}
                </span>
              </button>
            ))}

            {!sp && (
              <p className="text-xs text-muted-foreground">
                Select a sales point first
              </p>
            )}

            {sp && cat && !sectionCats.length && (
              <p className="text-xs text-muted-foreground">
                No categories in this section
              </p>
            )}
          </Card>
        </div>

        {/* Menu items */}

        <Card className="p-4">
          <div className="mb-3 font-semibold">
            {catId
              ? allCats.find((category: any) => category.id === catId)?.name
              : 'Select a Category'}{' '}
            {catId ? 'Items' : ''}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {(catId || !cat?.categories ? shown : []).map((item: any) => (
              <button
                key={item.id}
                disabled={Number(item.quantity) <= 0}
                onClick={() => add(item, 1)}
                className="rounded-lg border p-3 text-left hover:border-primary hover:shadow disabled:opacity-40"
              >
                <div className="font-medium">{item.name}</div>

                {item.description && (
                  <div className="text-xs text-muted-foreground">
                    {item.description}
                  </div>
                )}

                <div className="mt-1 font-bold text-green-600">
                  {money(item.sellPrice)}
                </div>

                <div className="text-xs text-muted-foreground">
                  Stock: {Number(item.quantity)}
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Cart and checkout */}

        <Card className="space-y-3 p-4">
          <div className="font-semibold">Cart</div>

          {!lines.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Cart is empty
            </p>
          ) : (
            lines.map((line) => (
              <div
                key={line.item.id}
                className="flex items-center justify-between text-sm"
              >
                <div>
                  <div className="font-medium">{line.item.name}</div>

                  <div className="text-xs text-muted-foreground">
                    {money(line.item.sellPrice)}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => add(line.item, -1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>

                  <span className="w-6 text-center">{line.qty}</span>

                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => add(line.item, 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-600"
                    onClick={() => add(line.item, -line.qty)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}

          <div>
            <div className="mb-1 text-sm font-medium">Payment Method</div>

            <NativeSelect
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              <option value="">Select Payment Method</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="TRANSFER">Transfer</option>
              <option value="ROOM_CHARGE">Charge to Room</option>
              <option value="CITY_LEDGER">City Ledger</option>
            </NativeSelect>
          </div>

          {method === 'ROOM_CHARGE' && (
            <NativeSelect
              value={guestId}
              onChange={(event) => setGuestId(event.target.value)}
            >
              <option value="">Select in-house guest</option>

              {inHouse?.map((stay) => (
                <option key={stay.id} value={stay.guestId}>
                  {stay.room.number} — {stay.guest.firstName}{' '}
                  {stay.guest.lastName}
                </option>
              ))}
            </NativeSelect>
          )}

          {canApprove && (
            <div className="space-y-2 rounded-md border border-purple-100 bg-purple-50 p-3 text-sm">
              <label className="flex items-center justify-between">
                <span>
                  <b className="text-purple-700">
                    Complimentary Transaction
                  </b>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Mark this sale as complimentary
                  </span>
                </span>

                <Switch
                  checked={flags.comp}
                  onCheckedChange={(value) =>
                    setFlags((current) => ({
                      ...current,
                      comp: value,
                    }))
                  }
                />
              </label>
            </div>
          )}

          <div className="space-y-2 rounded-md border p-3 text-sm">
            <div className="font-medium">Additional Charges</div>

            <label className="flex items-center justify-between">
              VAT (7.5%)

              <Switch
                checked={flags.vat}
                onCheckedChange={(value) =>
                  setFlags((current) => ({
                    ...current,
                    vat: value,
                  }))
                }
              />
            </label>

            <label className="flex items-center justify-between">
              Service Charge (10%)

              <Switch
                checked={flags.sc}
                onCheckedChange={(value) =>
                  setFlags((current) => ({
                    ...current,
                    sc: value,
                  }))
                }
              />
            </label>
          </div>

          <label className="flex items-center justify-between rounded-md border border-blue-100 bg-blue-50 p-3 text-sm">
            <b className="text-blue-700">Staff Credit (City Ledger)</b>

            <Switch
              checked={flags.staff}
              onCheckedChange={(value) =>
                setFlags((current) => ({
                  ...current,
                  staff: value,
                }))
              }
            />
          </label>

          <div className="space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>

            {serviceCharge > 0 && (
              <div className="flex justify-between">
                <span>Service charge</span>
                <span>{money(serviceCharge)}</span>
              </div>
            )}

            {vat > 0 && (
              <div className="flex justify-between">
                <span>VAT</span>
                <span>{money(vat)}</span>
              </div>
            )}

            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>{money(total)}</span>
            </div>
          </div>

          {needsNote && (
            <Input
              placeholder={
                flags.comp
                  ? 'Reason for complimentary order *'
                  : 'Which staff member? *'
              }
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}

          {/* Corrected Complete Sale button */}
          <Button
            className="w-full"
            disabled={
              !lines.length ||
              !method ||
              submittingOrder ||
              (needsNote && note.trim().length < 3) ||
              (method === 'ROOM_CHARGE' && !guestId)
            }
            onClick={() => void submitOrder()}
          >
            {submittingOrder
              ? 'Saving order…'
              : flags.staff
                ? 'Charge to ledger'
                : 'Complete sale'}
          </Button>

          {!isOnline && (
            <p className="text-xs text-amber-700">
              Orders are queued locally for synchronization when connectivity
              returns. Check the queue to confirm their synchronization status.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
