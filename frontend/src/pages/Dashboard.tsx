
import {
  BedDouble,
  Building,
  Calendar,
  CalendarDays,
  DoorClosed,
  DoorOpen,
  LogIn,
  TrendingUp,
  UserCheck,
  Wallet,
  AlertTriangle,
  ChartNoAxesCombined,
  CircleDollarSign,
  Gauge,
  type LucideIcon,
  ClipboardList,
  ChefHat,
  Package,
  Wrench,
  SprayCan,
  CheckCircle2,
  Clock,
  ShoppingBasket,
  Receipt,
  Users,
  ClipboardCheck,
  Boxes,
  MessageSquare,
} from 'lucide-react';

import { PageHeader } from '@/components/common';
import { useGet } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { cn, money, num } from '@/lib/utils';

interface ForecastDay {
  date: string;
  availableRooms: number;
  bookedRooms: number;
  forecastOccupiedRooms: number;
  forecastOccupancy: number;
  forecastRoomRevenue: number;
  averageDailyRate: number;
  revPar: number;
  historicalSamples: number;
  confidence: 'medium' | 'low' | 'very-low';
}

interface PricingSuggestion {
  date: string;
  currentAverageRate: number;
  suggestedAverageRate: number;
  changePercent: number;
  reason: string;
  requiresManagerApproval: true;
}

interface ForecastResponse {
  generatedAt: string;
  currency: string;
  period: {
    start: string;
    endExclusive: string;
    days: number;
  };
  summary: {
    roomCount: number;
    averageForecastOccupancy: number;
    forecastRoomRevenue: number;
    averageRevPar: number;
    historicalDays: number;
  };
  days: ForecastDay[];
  pricingSuggestions: PricingSuggestion[];
  limitations: string[];
}

interface OpenShift {
  id: string;
  name: 'MORNING' | 'AFTERNOON' | 'NIGHT';
  openedAt: string;
  cashier: string | null;
}

interface TileProps {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  color: string;
}

interface OrderRow {
  id: string;
  orderNumber?: string;
  status: string;
  paymentStatus?: string;
  createdAt: string;
  salesPoint?: {
    name?: string;
  } | null;
  staff?: {
    username?: string;
  } | null;
  items?: Array<{
    quantity?: number;
    item?: {
      name?: string;
    };
  }>;
}

interface OrdersResponse {
  summary?: Record<string, number>;
  rows?: OrderRow[];
}

interface KitchenResponse {
  pending?: OrderRow[];
  ready?: OrderRow[];
}

interface CreditResponse {
  count?: number;
  rows?: OrderRow[];
}

interface GuestRequest {
  id: string;
  type?: string;
  status?: string;
  kind?: string;
  text?: string;
  createdAt?: string;
  room?: {
    number?: string;
  } | null;
  guest?: {
    name?: string;
    fullName?: string;
  } | null;
}

interface StockItem {
  id: string;
  name?: string;
  quantity?: number | string;
  minLevel?: number | string;
  status?: string;
  item?: {
    name?: string;
    category?: {
      name?: string;
    };
  };
  store?: {
    name?: string;
  };
}

interface StockGroup {
  category: string;
  items?: StockItem[];
}

interface StockPositionResponse {
  totals?: {
    items?: number;
    lowStock?: number;
    outOfStock?: number;
  };
  groups?: StockGroup[];
}

interface StockAdjustment {
  id: string;
  status?: string;
  reason?: string;
  notes?: string;
  createdAt?: string;
  item?: {
    name?: string;
  };
  requestedBy?: {
    username?: string;
  };
  store?: {
    name?: string;
  };
}

interface MaintenanceTicket {
  id: string;
  title: string;
  description?: string;
  status: string;
  createdAt: string;
  resolvedAt?: string | null;
  room?: {
    number?: string;
  } | null;
}

interface HousekeepingTask {
  id: string;
  type?: string;
  status: string;
  notes?: string;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  inspectedAt?: string | null;
  room?: {
    id?: string;
    number?: string;
    floor?: number;
    type?: {
      name?: string;
    };
    status?: string;
  };
  assignedTo?: {
    id?: string;
    name?: string;
  } | null;
}

interface HousekeepingBoardResponse {
  tasks?: HousekeepingTask[];
}

interface Reservation {
  id: string;
  status: string;
  arrival: string;
  departure: string;
  guest?: {
    name?: string;
    fullName?: string;
  };
  room?: {
    number?: string;
  };
}

interface Stay {
  id: string;
  expectedDeparture?: string;
  checkInAt?: string;
  guest?: {
    name?: string;
    fullName?: string;
  };
  room?: {
    number?: string;
  };
}

interface Room {
  id: string;
  number: string;
  status: string;
  roomType?: {
    name?: string;
  };
}

interface TileProps {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  color: string;
}

function Tile({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: TileProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between rounded-lg border-l-4 bg-white p-5 shadow-sm',
        color,
      )}
    >
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </div>

      <div className="ml-3 shrink-0 rounded-lg bg-slate-100 p-2">
        <Icon className="h-5 w-5 text-slate-600" />
      </div>
    </div>
  );
}

function DashboardSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const value = status || 'UNKNOWN';
  const normalized = value.toUpperCase();

  const color =
    normalized.includes('READY') ||
    normalized.includes('COMPLETED') ||
    normalized.includes('RESOLVED') ||
    normalized.includes('INSPECTED') ||
    normalized.includes('AVAILABLE')
      ? 'bg-green-100 text-green-800'
      : normalized.includes('PROGRESS') ||
          normalized.includes('PREPARING') ||
          normalized.includes('CONFIRMED')
        ? 'bg-blue-100 text-blue-800'
        : normalized.includes('PENDING') ||
            normalized.includes('OPEN') ||
            normalized.includes('DIRTY') ||
            normalized.includes('LOW')
          ? 'bg-amber-100 text-amber-800'
          : normalized.includes('CANCELLED') ||
              normalized.includes('VOIDED') ||
              normalized.includes('OUT')
            ? 'bg-red-100 text-red-800'
            : 'bg-slate-100 text-slate-700';

  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
        color,
      )}
    >
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isToday(value?: string | null) {
  if (!value) return false;

  const date = new Date(value);
  const today = new Date();

  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function formatPercent(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  const percentage = Math.abs(value) <= 1 ? value * 100 : value;

  return `${num(percentage, 1)}%`;
}

function confidenceLabel(confidence: ForecastDay['confidence']) {
  switch (confidence) {
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    case 'very-low':
      return 'Very low';
    default:
      return confidence;
  }
}

function confidenceClass(confidence: ForecastDay['confidence']) {
  switch (confidence) {
    case 'medium':
      return 'bg-green-100 text-green-800';
    case 'low':
      return 'bg-yellow-100 text-yellow-800';
    case 'very-low':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function pricingChangeClass(change: number) {
  if (change > 0) return 'text-green-700';
  if (change < 0) return 'text-red-700';
  return 'text-slate-600';
}

function confidenceDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const SHIFT_LABELS: Record<OpenShift['name'], string> = {
  MORNING: 'Morning shift',
  AFTERNOON: 'Afternoon shift',
  NIGHT: 'Night shift',
};

function OrderList({
  orders,
  emptyMessage,
}: {
  orders: OrderRow[];
  emptyMessage: string;
}) {
  if (!orders.length) return <EmptyState message={emptyMessage} />;

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="divide-y">
        {orders.slice(0, 8).map((order) => (
          <div
            key={order.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {order.orderNumber || `Order ${order.id.slice(0, 8)}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {order.salesPoint?.name || 'Sales point not specified'}
                {' · '}
                {formatTime(order.createdAt)}
              </p>
              {order.items?.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {order.items
                    .slice(0, 3)
                    .map((line) => line.item?.name || 'Item')
                    .join(', ')}
                  {order.items.length > 3 ? ' …' : ''}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge status={order.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GuestRequestList({
  requests,
}: {
  requests: GuestRequest[];
}) {
  if (!requests.length) {
    return <EmptyState message="There are no open guest requests." />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="divide-y">
        {requests.slice(0, 8).map((request) => (
          <div
            key={request.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {request.type || request.kind || 'Guest request'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {request.text || 'No additional details'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Room {request.room?.number || '—'}
                {' · '}
                {request.guest?.name || request.guest?.fullName || 'Guest'}
                {' · '}
                {formatTime(request.createdAt)}
              </p>
            </div>
            <StatusBadge status={request.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();

  const displayName =
    user?.fullName?.trim() || user?.username || '';

  const role = user?.role ?? '';

  const canViewFinancialDashboard = [
    'ADMIN',
    'MANAGER',
    'ACCOUNTANT',
  ].includes(role);

  const canViewOperationalDashboard = [
    'ADMIN',
    'MANAGER',
    'RECEPTIONIST',
  ].includes(role);

  const canViewOpenShifts = [
    'ADMIN',
    'MANAGER',
    'RECEPTIONIST',
    'WAITER',
    'ACCOUNTANT',
  ].includes(role);

  const isWaiter = role === 'WAITER';
  const isChef = role === 'CHEF';
  const isStorekeeper = role === 'STOREKEEPER';
  const isMaintenance = role === 'MAINTENANCE';
  const isHousekeeping = role === 'HOUSEKEEPING';
  const isReceptionist = role === 'RECEPTIONIST';

  const now = new Date();
  const hour = now.getHours();

  const greeting =
    hour < 12
      ? 'Good morning'
      : hour < 17
        ? 'Good afternoon'
        : 'Good evening';

  // Existing dashboard data.
  const { data: d } = useGet('/dashboard');

  const { data: openShifts } = useGet<OpenShift[]>(
    '/shifts/open',
    undefined,
    canViewOpenShifts,
  );

  const {
    data: forecast,
    isLoading: forecastLoading,
    error: forecastError,
  } = useGet<ForecastResponse>(
    '/revenue-forecast',
    { days: 30 },
    canViewFinancialDashboard,
  );

  // WAITER dashboard data.
  const { data: waiterOrders } = useGet<OrdersResponse>(
    '/orders',
    undefined,
    isWaiter,
  );

  const { data: waiterCredit } = useGet<CreditResponse>(
    '/orders/credit',
    undefined,
    isWaiter,
  );

  const { data: waiterRequests } = useGet<GuestRequest[]>(
    '/guest-requests',
    { scope: 'open' },
    isWaiter,
  );

  // CHEF dashboard data.
  const { data: kitchen } = useGet<KitchenResponse>(
    '/orders/kitchen',
    undefined,
    isChef,
  );

  // STOREKEEPER dashboard data.
  const { data: stockPosition } = useGet<StockPositionResponse>(
    '/stores/stock-position',
    undefined,
    isStorekeeper,
  );

  const { data: pendingAdjustments } = useGet<StockAdjustment[]>(
    '/inventory/adjustments',
    { status: 'PENDING' },
    isStorekeeper,
  );

  // MAINTENANCE dashboard data.
  const { data: maintenanceTickets } = useGet<MaintenanceTicket[]>(
    '/maintenance',
    undefined,
    isMaintenance,
  );

  // HOUSEKEEPING dashboard data.
  const { data: housekeepingBoard } = useGet<HousekeepingBoardResponse>(
    '/housekeeping/board',
    undefined,
    isHousekeeping,
  );

  // RECEPTIONIST dashboard data.
  const { data: reservations } = useGet<Reservation[]>(
    '/reservations',
    undefined,
    isReceptionist,
  );

  const { data: inHouseStays } = useGet<Stay[]>(
    '/stays/in-house',
    undefined,
    isReceptionist,
  );

  const { data: nextCheckout } = useGet<{
    total?: number;
    rows?: Stay[];
  }>('/stays/next-checkout', undefined, isReceptionist);

  const { data: rooms } = useGet<Room[]>(
    '/rooms',
    undefined,
    isReceptionist,
  );

  const { data: receptionistRequests } = useGet<GuestRequest[]>(
    '/guest-requests',
    { scope: 'open' },
    isReceptionist,
  );

  const updatedAt = d?.updatedAt
    ? new Date(d.updatedAt).toLocaleTimeString('en-NG', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const generatedAt = forecast?.generatedAt
    ? new Date(forecast.generatedAt).toLocaleString('en-NG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '';

  const forecastDays = forecast?.days ?? [];
  const pricingSuggestions = forecast?.pricingSuggestions ?? [];
  const limitations = forecast?.limitations ?? [];

  // WAITER calculations.
  const waiterRows = waiterOrders?.rows ?? [];
  const waiterSummary = waiterOrders?.summary ?? {};
  const readyOrders = waiterRows.filter(
    (order) => order.status === 'READY',
  );
  const activeOrders = waiterRows.filter((order) =>
    ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'].includes(
      order.status,
    ),
  );
  const unpaidCount = waiterCredit?.count ?? 0;

  // CHEF calculations.
  const kitchenPending = kitchen?.pending ?? [];
  const kitchenReady = kitchen?.ready ?? [];
  const kitchenPreparing = kitchenPending.filter(
    (order) => order.status === 'PREPARING',
  );
  const kitchenNew = kitchenPending.filter(
    (order) =>
      order.status === 'PENDING' || order.status === 'CONFIRMED',
  );

  // STOREKEEPER calculations.
  const stockGroups = stockPosition?.groups ?? [];
  const stockItems = stockGroups.flatMap((group) => group.items ?? []);
  const lowStockItems = stockItems.filter(
    (item) => item.status === 'LOW',
  );
  const outOfStockItems = stockItems.filter(
    (item) => item.status === 'OUT',
  );
  const adjustments = pendingAdjustments ?? [];

  // MAINTENANCE calculations.
  const tickets = maintenanceTickets ?? [];
  const openTickets = tickets.filter(
    (ticket) => ticket.status === 'OPEN',
  );
  const inProgressTickets = tickets.filter(
    (ticket) => ticket.status === 'IN_PROGRESS',
  );
  const resolvedToday = tickets.filter(
    (ticket) =>
      ticket.status === 'RESOLVED' && isToday(ticket.resolvedAt),
  );

  // HOUSEKEEPING calculations.
  const housekeepingTasks = housekeepingBoard?.tasks ?? [];
  const cleaningInProgress = housekeepingTasks.filter(
    (task) => task.status === 'IN_PROGRESS',
  );
  const awaitingInspection = housekeepingTasks.filter((task) =>
    task.status.toUpperCase().includes('INSPECT'),
  );
  const roomsToClean = housekeepingTasks.filter((task) =>
    ['PENDING', 'OPEN', 'TO_CLEAN'].includes(task.status.toUpperCase()),
  );
  const cleanedToday = housekeepingTasks.filter(
    (task) => task.finishedAt && isToday(task.finishedAt),
  );

  // RECEPTIONIST calculations.
  const reservationRows = reservations ?? [];
  const stayRows = inHouseStays ?? [];
  const roomRows = rooms ?? [];
  const requestRows = receptionistRequests ?? [];

  const todayArrivals = reservationRows.filter(
    (reservation) =>
      isToday(reservation.arrival) &&
      ['PENDING', 'CONFIRMED'].includes(reservation.status),
  );

  const todayDepartures = stayRows.filter((stay) =>
    isToday(stay.expectedDeparture),
  );

  const availableRooms = roomRows.filter(
    (room) => room.status === 'AVAILABLE',
  );

  const updatedReservations = reservationRows.filter(
    (reservation) => reservation.status === 'PENDING',
  );

  return (
    <>
      <PageHeader
        title={
          displayName
            ? `Welcome back, ${displayName}`
            : 'Welcome back'
        }
        subtitle={`${greeting} · ${now.toLocaleDateString('en-NG', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}`}
      />

      {/* Open shifts: existing authorised roles only. */}
      {canViewOpenShifts && (
        <div className="mb-4 flex flex-wrap gap-2">
          {openShifts?.length ? (
            openShifts.map((shift) => (
              <div
                key={shift.id}
                className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700"
              >
                <span className="h-2 w-2 rounded-full bg-green-500" />
                {SHIFT_LABELS[shift.name]}
                {shift.cashier ? ` · ${shift.cashier}` : ''}
                {' · opened '}
                {formatTime(shift.openedAt)}
              </div>
            ))
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              No shift open
            </div>
          )}
        </div>
      )}

      {/* WAITER DASHBOARD */}
      {isWaiter && (
        <>
          <DashboardSection
            title="Service Overview"
            description="Monitor active orders, ready orders, unpaid bills and guest requests."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tile
                label="Active Orders"
                value={String(activeOrders.length)}
                sub="Orders currently being processed"
                icon={ClipboardList}
                color="border-blue-600"
              />
              <Tile
                label="Ready to Serve"
                value={String(readyOrders.length)}
                sub="Orders waiting for collection or service"
                icon={CheckCircle2}
                color="border-green-600"
              />
              <Tile
                label="Pending Orders"
                value={String(
                  (waiterSummary.PENDING ?? 0) +
                    (waiterSummary.CONFIRMED ?? 0),
                )}
                sub="Awaiting kitchen preparation"
                icon={Clock}
                color="border-amber-500"
              />
              <Tile
                label="Unpaid Bills"
                value={String(unpaidCount)}
                sub="Outstanding order transactions"
                icon={Receipt}
                color="border-red-500"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            title="Ready Orders"
            description="Orders that have been marked ready by the kitchen."
          >
            <OrderList
              orders={readyOrders}
              emptyMessage="There are no orders waiting to be served."
            />
          </DashboardSection>

          <DashboardSection
            title="Active Orders"
            description="Recent orders being processed at your sales points."
          >
            <OrderList
              orders={activeOrders}
              emptyMessage="There are no active orders."
            />
          </DashboardSection>

          <DashboardSection
            title="Open Guest Requests"
            description="Guest requests that require service attention."
          >
            <GuestRequestList requests={waiterRequests ?? []} />
          </DashboardSection>
        </>
      )}

      {/* CHEF DASHBOARD */}
      {isChef && (
        <>
          <DashboardSection
            title="Kitchen Overview"
            description="Monitor incoming orders, preparation progress and completed kitchen orders."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tile
                label="New Orders"
                value={String(kitchenNew.length)}
                sub="Pending or confirmed orders"
                icon={ShoppingBasket}
                color="border-blue-600"
              />
              <Tile
                label="Preparing"
                value={String(kitchenPreparing.length)}
                sub="Orders currently being prepared"
                icon={ChefHat}
                color="border-amber-500"
              />
              <Tile
                label="Ready to Serve"
                value={String(kitchenReady.length)}
                sub="Completed kitchen orders"
                icon={CheckCircle2}
                color="border-green-600"
              />
              <Tile
                label="Kitchen Queue"
                value={String(kitchenPending.length)}
                sub="All pending and preparing orders"
                icon={ClipboardList}
                color="border-purple-600"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            title="New Kitchen Orders"
            description="Orders waiting to be started or confirmed."
          >
            <OrderList
              orders={kitchenNew}
              emptyMessage="There are no new kitchen orders."
            />
          </DashboardSection>

          <DashboardSection
            title="Currently Preparing"
            description="Orders currently in preparation."
          >
            <OrderList
              orders={kitchenPreparing}
              emptyMessage="No orders are currently being prepared."
            />
          </DashboardSection>

          <DashboardSection
            title="Ready Orders"
            description="Orders completed by the kitchen."
          >
            <OrderList
              orders={kitchenReady}
              emptyMessage="There are no ready orders."
            />
          </DashboardSection>
        </>
      )}

      {/* STOREKEEPER DASHBOARD */}
      {isStorekeeper && (
        <>
          <DashboardSection
            title="Store Overview"
            description="Monitor stock availability, low-stock items and pending adjustments."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tile
                label="Stock Records"
                value={String(stockPosition?.totals?.items ?? stockItems.length)}
                sub="Items recorded across stores"
                icon={Package}
                color="border-blue-600"
              />
              <Tile
                label="Low Stock Items"
                value={String(stockPosition?.totals?.lowStock ?? lowStockItems.length)}
                sub="Items at low stock level"
                icon={AlertTriangle}
                color="border-amber-500"
              />
              <Tile
                label="Out of Stock"
                value={String(stockPosition?.totals?.outOfStock ?? outOfStockItems.length)}
                sub="Items with no available stock"
                icon={Boxes}
                color="border-red-500"
              />
              <Tile
                label="Pending Adjustments"
                value={String(adjustments.length)}
                sub="Adjustments awaiting a decision"
                icon={ClipboardCheck}
                color="border-purple-600"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            title="Low Stock Alerts"
            description="Items that have reached their configured minimum stock level."
          >
            {lowStockItems.length ? (
              <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                <div className="divide-y">
                  {lowStockItems.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <p className="font-medium">
                          {item.item?.name || item.name || 'Inventory item'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.item?.category?.name || 'Uncategorised'}
                          {' · '}
                          {item.store?.name || 'Store not specified'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">
                          Qty: {item.quantity ?? '—'}
                        </span>
                        <StatusBadge status="LOW" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState message="There are no low-stock items." />
            )}
          </DashboardSection>

          <DashboardSection
            title="Out of Stock Items"
            description="Inventory items currently marked as out of stock."
          >
            {outOfStockItems.length ? (
              <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                <div className="divide-y">
                  {outOfStockItems.slice(0, 8).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 p-4"
                    >
                      <p className="font-medium">
                        {item.item?.name || item.name || 'Inventory item'}
                      </p>
                      <StatusBadge status="OUT OF STOCK" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState message="There are no out-of-stock items." />
            )}
          </DashboardSection>

          <DashboardSection
            title="Pending Stock Adjustments"
            description="Stock adjustment requests awaiting review."
          >
            {adjustments.length ? (
              <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                <div className="divide-y">
                  {adjustments.slice(0, 8).map((adjustment) => (
                    <div
                      key={adjustment.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <p className="font-medium">
                          {adjustment.item?.name || 'Stock adjustment'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {adjustment.store?.name || 'Store not specified'}
                          {' · Requested by '}
                          {adjustment.requestedBy?.username || 'Staff'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(adjustment.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={adjustment.status || 'PENDING'} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState message="There are no pending stock adjustments." />
            )}
          </DashboardSection>
        </>
      )}

      {/* MAINTENANCE DASHBOARD */}
      {isMaintenance && (
        <>
          <DashboardSection
            title="Maintenance Overview"
            description="Track open maintenance tickets and monitor work progress."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tile
                label="Open Tasks"
                value={String(openTickets.length)}
                sub="Tickets awaiting maintenance"
                icon={AlertTriangle}
                color="border-amber-500"
              />
              <Tile
                label="In Progress"
                value={String(inProgressTickets.length)}
                sub="Tickets currently being handled"
                icon={Wrench}
                color="border-blue-600"
              />
              <Tile
                label="Resolved Today"
                value={String(resolvedToday.length)}
                sub="Tickets resolved today"
                icon={CheckCircle2}
                color="border-green-600"
              />
              <Tile
                label="Total Tickets"
                value={String(tickets.length)}
                sub="Maintenance ticket records"
                icon={ClipboardList}
                color="border-purple-600"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            title="Open Maintenance Tasks"
            description="Maintenance tickets that have not yet been resolved."
          >
            {openTickets.length ? (
              <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                <div className="divide-y">
                  {openTickets.slice(0, 10).map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{ticket.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {ticket.description || 'No additional description'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Room {ticket.room?.number || 'Not assigned'}
                          {' · '}
                          Created {formatDate(ticket.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={ticket.status} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState message="There are no open maintenance tickets." />
            )}
          </DashboardSection>

          <DashboardSection
            title="Work In Progress"
            description="Maintenance tickets currently being worked on."
          >
            {inProgressTickets.length ? (
              <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                <div className="divide-y">
                  {inProgressTickets.slice(0, 10).map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <p className="font-medium">{ticket.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Room {ticket.room?.number || 'Not assigned'}
                        </p>
                      </div>
                      <StatusBadge status={ticket.status} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState message="There are no maintenance tasks in progress." />
            )}
          </DashboardSection>
        </>
      )}

      {/* HOUSEKEEPING DASHBOARD */}
      {isHousekeeping && (
        <>
          <DashboardSection
            title="Housekeeping Overview"
            description="Monitor cleaning assignments, room preparation and inspections."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tile
                label="Rooms to Clean"
                value={String(roomsToClean.length)}
                sub="Tasks awaiting cleaning"
                icon={SprayCan}
                color="border-amber-500"
              />
              <Tile
                label="Cleaning in Progress"
                value={String(cleaningInProgress.length)}
                sub="Tasks currently being cleaned"
                icon={Clock}
                color="border-blue-600"
              />
              <Tile
                label="Cleaned Today"
                value={String(cleanedToday.length)}
                sub="Tasks finished today"
                icon={CheckCircle2}
                color="border-green-600"
              />
              <Tile
                label="Awaiting Inspection"
                value={String(awaitingInspection.length)}
                sub="Tasks waiting for inspection"
                icon={ClipboardCheck}
                color="border-purple-600"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            title="Cleaning Queue"
            description="Housekeeping tasks assigned to you or currently unassigned."
          >
            {housekeepingTasks.length ? (
              <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                <div className="divide-y">
                  {housekeepingTasks.slice(0, 12).map((task) => (
                    <div
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          Room {task.room?.number || '—'}
                          {' · '}
                          {task.type || 'Housekeeping task'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {task.room?.type?.name || 'Room'}
                          {task.room?.floor !== undefined
                            ? ` · Floor ${task.room.floor}`
                            : ''}
                        </p>
                        {task.notes && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {task.notes}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Assigned to: {task.assignedTo?.name || 'Unassigned'}
                          {' · '}
                          Created {formatDate(task.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState message="There are no housekeeping tasks available." />
            )}
          </DashboardSection>
        </>
      )}

      {/* RECEPTIONIST DASHBOARD */}
      {isReceptionist && (
        <>
          <DashboardSection
            title="Front Desk Overview"
            description="Today's arrivals, departures, occupancy and guest service requests."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Tile
                label="Today's Arrivals"
                value={String(todayArrivals.length)}
                sub="Pending or confirmed reservations"
                icon={LogIn}
                color="border-green-600"
              />
              <Tile
                label="Today's Departures"
                value={String(todayDepartures.length)}
                sub="In-house guests expected to depart today"
                icon={DoorClosed}
                color="border-red-500"
              />
              <Tile
                label="In-House Guests"
                value={String(stayRows.length)}
                sub="Currently checked-in stays"
                icon={Users}
                color="border-blue-600"
              />
              <Tile
                label="Available Rooms"
                value={String(availableRooms.length)}
                sub="Rooms marked available"
                icon={DoorOpen}
                color="border-green-600"
              />
              <Tile
                label="Pending Reservations"
                value={String(updatedReservations.length)}
                sub="Reservations awaiting confirmation"
                icon={CalendarDays}
                color="border-amber-500"
              />
              <Tile
                label="Open Guest Requests"
                value={String(requestRows.length)}
                sub="Requests requiring attention"
                icon={MessageSquare}
                color="border-purple-600"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            title="Today's Arrivals"
            description="Reservations scheduled to arrive today."
          >
            {todayArrivals.length ? (
              <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                <div className="divide-y">
                  {todayArrivals.slice(0, 10).map((reservation) => (
                    <div
                      key={reservation.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <p className="font-medium">
                          {reservation.guest?.name ||
                            reservation.guest?.fullName ||
                            'Guest'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Room {reservation.room?.number || 'Not assigned'}
                          {' · '}
                          Arrival {formatDate(reservation.arrival)}
                        </p>
                      </div>
                      <StatusBadge status={reservation.status} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState message="There are no arrivals scheduled for today." />
            )}
          </DashboardSection>

          <DashboardSection
            title="Today's Departures"
            description="Checked-in guests whose expected departure is today."
          >
            {todayDepartures.length ? (
              <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                <div className="divide-y">
                  {todayDepartures.slice(0, 10).map((stay) => (
                    <div
                      key={stay.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <p className="font-medium">
                          {stay.guest?.name || stay.guest?.fullName || 'Guest'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Room {stay.room?.number || '—'}
                          {' · '}
                          Expected {formatTime(stay.expectedDeparture)}
                        </p>
                      </div>
                      <StatusBadge status="CHECKED IN" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState message="There are no expected departures today." />
            )}
          </DashboardSection>

          <DashboardSection
            title="Room Availability"
            description="Current room status at the front desk."
          >
            {roomRows.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {roomRows.slice(0, 12).map((room) => (
                  <div
                    key={room.id}
                    className="flex items-center justify-between rounded-lg border bg-white p-4 shadow-sm"
                  >
                    <div>
                      <p className="font-semibold">Room {room.number}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {room.roomType?.name || 'Room'}
                      </p>
                    </div>
                    <StatusBadge status={room.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No room records were returned." />
            )}
          </DashboardSection>

          <DashboardSection
            title="Guest Requests"
            description="Open requests requiring front desk attention."
          >
            <GuestRequestList requests={requestRows} />
          </DashboardSection>

          <DashboardSection
            title="Upcoming Checkouts"
            description="Guests due to check out within the configured checkout window."
          >
            {nextCheckout?.rows?.length ? (
              <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                <div className="divide-y">
                  {nextCheckout.rows.slice(0, 8).map((stay) => (
                    <div
                      key={stay.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <p className="font-medium">
                          {stay.guest?.name || stay.guest?.fullName || 'Guest'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Room {stay.room?.number || '—'}
                          {' · '}
                          Expected {formatTime(stay.expectedDeparture)}
                        </p>
                      </div>
                      <StatusBadge status="DUE FOR CHECKOUT" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState message="There are no upcoming checkouts in the current window." />
            )}
          </DashboardSection>
        </>
      )}

      {/* EXISTING FINANCIAL DASHBOARD */}
      {canViewFinancialDashboard && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Financial Overview</h2>
            <p className="text-sm text-muted-foreground">
              Revenue and financial performance.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Tile
              label="Today's Revenue"
              value={money(d?.todayRevenue)}
              sub={`Updated: ${updatedAt || '—'}`}
              icon={Calendar}
              color="border-blue-600"
            />
            <Tile
              label="This Week's Revenue"
              value={money(d?.weekRevenue)}
              sub="Week to date"
              icon={CalendarDays}
              color="border-purple-600"
            />
            <Tile
              label="This Month's Revenue"
              value={money(d?.monthRevenue)}
              sub={now.toLocaleString('en-NG', {
                month: 'long',
                year: 'numeric',
              })}
              icon={Calendar}
              color="border-green-600"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              label="Profit Margin (Month)"
              value={`${num(d?.profitMargin, 1)}%`}
              sub={`Gross Profit: ${money(d?.grossProfit)}`}
              icon={TrendingUp}
              color="border-yellow-500"
            />
            <Tile
              label="In-House Outstanding"
              value={money(d?.inHouseOutstanding)}
              sub="Guests currently checked in"
              icon={UserCheck}
              color="border-orange-500"
            />
            <Tile
              label="City Ledger Outstanding"
              value={money(d?.cityLedgerOutstanding)}
              sub="Receivables from city ledger"
              icon={Building}
              color="border-slate-500"
            />
            <Tile
              label="Cash Position"
              value="See Cash Flow"
              sub="Finance → Financial Reports"
              icon={Wallet}
              color="border-cyan-500"
            />
          </div>
        </section>
      )}

      {/* EXISTING OPERATIONAL DASHBOARD */}
      {canViewOperationalDashboard && (
        <section className="mt-8 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Hotel Operations</h2>
            <p className="text-sm text-muted-foreground">
              Today's check-in, check-out and room occupancy overview.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Tile
              label="Check-ins Today"
              value={String(d?.checkInsToday ?? 0)}
              sub={`In-house guests: ${d?.inHouseGuests ?? 0}`}
              icon={LogIn}
              color="border-green-500"
            />
            <Tile
              label="Check-outs Today"
              value={String(d?.checkOutsToday ?? 0)}
              sub="Check-outs processed"
              icon={DoorClosed}
              color="border-red-500"
            />
            <Tile
              label="Occupancy Rate"
              value={`${num(d?.occupancyRate, 1)}%`}
              sub={`${d?.occupied ?? 0} / ${d?.totalRooms ?? 0} rooms occupied`}
              icon={BedDouble}
              color="border-indigo-600"
            />
          </div>
        </section>
      )}

      {/* EXISTING REVENUE FORECASTING AND DYNAMIC PRICING */}
      {canViewFinancialDashboard && (
        <section className="mt-8 space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <ChartNoAxesCombined className="h-6 w-6" />
                Revenue Forecasting
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Projected room revenue and occupancy for the next 30 days.
              </p>
            </div>

            {generatedAt && (
              <p className="text-xs text-muted-foreground">
                Generated {generatedAt}
              </p>
            )}
          </div>

          {forecastLoading && (
            <div
              className="rounded-lg border bg-white p-6 text-sm text-muted-foreground shadow-sm"
              role="status"
            >
              Loading revenue forecast…
            </div>
          )}

          {forecastError && !forecastLoading && (
            <div
              className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">
                  Revenue forecast unavailable
                </p>
                <p className="mt-1">
                  The existing dashboard is still available. Check that you
                  are signed in with an authorised role and that the forecast
                  API is running.
                </p>
                <p className="mt-1 text-xs">
                  The endpoint requires ADMIN, MANAGER, or ACCOUNTANT access.
                  If the problem continues, inspect the
                  {' '}
                  /api/revenue-forecast
                  {' '}
                  request in your browser's Network tab.
                </p>
              </div>
            </div>
          )}

          {forecast && !forecastLoading && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Tile
                  label="Forecast Room Revenue"
                  value={money(forecast.summary.forecastRoomRevenue)}
                  sub={`Next ${forecast.period.days} days`}
                  icon={CircleDollarSign}
                  color="border-green-600"
                />
                <Tile
                  label="Average Forecast Occupancy"
                  value={formatPercent(
                    forecast.summary.averageForecastOccupancy,
                  )}
                  sub={`${forecast.summary.roomCount} rooms in forecast`}
                  icon={BedDouble}
                  color="border-indigo-600"
                />
                <Tile
                  label="Average RevPAR"
                  value={money(forecast.summary.averageRevPar)}
                  sub="Revenue per available room"
                  icon={Gauge}
                  color="border-blue-600"
                />
                <Tile
                  label="Historical Data"
                  value={`${forecast.summary.historicalDays} days`}
                  sub="History used by the forecast"
                  icon={CalendarDays}
                  color="border-purple-600"
                />
              </div>

              {limitations.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <AlertTriangle className="h-4 w-4" />
                    Forecast limitations
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                    {limitations.map((limitation, index) => (
                      <li key={`${index}-${limitation}`}>
                        {limitation}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                <div className="border-b p-4">
                  <h3 className="font-semibold">Daily Revenue Forecast</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Estimated occupancy and room revenue by date.
                  </p>
                </div>

                {forecastDays.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    No daily forecast data was returned for this period.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[850px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3 text-right">Occupied</th>
                          <th className="px-4 py-3 text-right">Occupancy</th>
                          <th className="px-4 py-3 text-right">Forecast Revenue</th>
                          <th className="px-4 py-3 text-right">Avg. Daily Rate</th>
                          <th className="px-4 py-3 text-right">RevPAR</th>
                          <th className="px-4 py-3">Confidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {forecastDays.map((day) => (
                          <tr key={day.date} className="hover:bg-slate-50">
                            <td className="whitespace-nowrap px-4 py-3 font-medium">
                              {confidenceDate(day.date)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {day.forecastOccupiedRooms}
                              {' / '}
                              {day.availableRooms}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatPercent(day.forecastOccupancy)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                              {money(day.forecastRoomRevenue)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              {money(day.averageDailyRate)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              {money(day.revPar)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  'whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium',
                                  confidenceClass(day.confidence),
                                )}
                              >
                                {confidenceLabel(day.confidence)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
                <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold">
                      Dynamic Pricing Suggestions
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Suggested average room rates based on the forecast.
                    </p>
                  </div>
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Manager approval required
                  </span>
                </div>

                {pricingSuggestions.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    There are no pricing suggestions for this forecast period.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[750px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3 text-right">Current Rate</th>
                          <th className="px-4 py-3 text-right">Suggested Rate</th>
                          <th className="px-4 py-3 text-right">Change</th>
                          <th className="px-4 py-3">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {pricingSuggestions.map((suggestion, index) => (
                          <tr
                            key={`${suggestion.date}-${index}`}
                            className="hover:bg-slate-50"
                          >
                            <td className="whitespace-nowrap px-4 py-3 font-medium">
                              {confidenceDate(suggestion.date)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              {money(suggestion.currentAverageRate)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                              {money(suggestion.suggestedAverageRate)}
                            </td>
                            <td
                              className={cn(
                                'whitespace-nowrap px-4 py-3 text-right font-semibold',
                                pricingChangeClass(suggestion.changePercent),
                              )}
                            >
                              {suggestion.changePercent > 0 ? '+' : ''}
                              {num(suggestion.changePercent, 1)}%
                            </td>
                            <td className="max-w-sm px-4 py-3 text-muted-foreground">
                              {suggestion.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="border-t bg-slate-50 p-4 text-xs text-slate-600">
                  These are recommendations only. This dashboard does not
                  change room prices or apply rate changes automatically.
                  Review each suggestion and obtain manager approval before
                  changing rates.
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
