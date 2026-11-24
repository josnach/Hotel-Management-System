
import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

import { AppShell } from '@/components/layout/AppShell';
import { Loading } from '@/components/common';
import { useAuth } from '@/lib/auth';
import { canAccessPath } from '@/lib/permissions';

// Lazy-load default page exports.
const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const NextCheckout = lazy(() => import('@/pages/NextCheckout'));
const InHouse = lazy(() => import('@/pages/InHouse'));
const Rooms = lazy(() => import('@/pages/Rooms'));
const RoomTypes = lazy(() => import('@/pages/RoomTypes'));
const CheckIn = lazy(() => import('@/pages/CheckIn'));
const Guests = lazy(() => import('@/pages/Guests'));
const Folios = lazy(() => import('@/pages/Folios'));
const POS = lazy(() => import('@/pages/POS'));
const Credit = lazy(() => import('@/pages/Credit'));
const Orders = lazy(() => import('@/pages/Orders'));
const Inventory = lazy(() => import('@/pages/Inventory'));
const Guard = lazy(() => import('@/pages/Guard'));
const AuditLog = lazy(() => import('@/pages/AuditLog'));
const Messages = lazy(() => import('@/pages/Messages'));
const BarControl = lazy(() => import('@/pages/BarControl'));
const Housekeeping = lazy(() => import('@/pages/Housekeeping'));
const NightAudit = lazy(() => import('@/pages/NightAudit'));
const GuestPortal = lazy(() => import('@/pages/GuestPortal'));
const GuestRequests = lazy(() => import('@/pages/GuestRequests'));
const PayrollPage = lazy(() => import('@/pages/PayrollPage'));
const Receivables = lazy(() => import('@/pages/Receivables'));
const PowerCosts = lazy(() => import('@/pages/PowerCosts'));
const GuestCRM = lazy(() => import('@/pages/GuestCRM'));
const GuestHistory = lazy(() => import('@/pages/GuestHistory'));
const StaffNotifications = lazy(() => import('@/components/StaffNotifications'));
const StaffChat = lazy(() => import('@/pages/StaffChat'));
const CurrencyManagement = lazy(() => import('@/pages/CurrencyManagement'));
const Documents = lazy(() => import('@/pages/Documents'));
const Security = lazy(() => import('@/pages/Security'));
const NewReservation = lazy(() => import('@/pages/NewReservation'));
const ReservationList = lazy(() => import('@/pages/ReservationList'));
const ReservationDetail = lazy(() => import('@/pages/ReservationDetail'));
const ReservationEdit = lazy(() => import('@/pages/ReservationEdit'));
const WorkSchedules = lazy(() => import('@/pages/WorkSchedules'));
const StaffManagement = lazy(() => import('@/pages/StaffManagement'));
const StaffDetail = lazy(() => import('@/pages/StaffDetail'));
const StaffForm = lazy(() => import('@/pages/StaffForm'));
const RoomTypeDetail = lazy(() => import('@/pages/RoomTypeDetail'));
const RoomTypeForm = lazy(() => import('@/pages/RoomTypeForm'));
const Groups = lazy(() => import('@/pages/groups/Groups'));
const GroupDetail = lazy(() => import('@/pages/groups/GroupDetail'));
const GroupHistory = lazy(() => import('@/pages/groups/GroupHistory'));
   const SalesPoints = lazy(() => import('@/pages/SalesPoints'));
 const MaintenanceDashboard = lazy(() => import('@/pages/maintenance/MaintenanceDashboard'));
const MaintenanceRequests = lazy(() => import('@/pages/maintenance/MaintenanceRequests'));
const MaintenanceRequestNew = lazy(() => import('@/pages/maintenance/MaintenanceRequestNew'));
const MaintenanceSchedule = lazy(() => import('@/pages/maintenance/MaintenanceSchedule'));
const MaintenanceReports = lazy(() => import('@/pages/maintenance/MaintenanceReports'));
const EventsDashboard = lazy(() => import('@/pages/events/EventsDashboard'));
const EventReports = lazy(() => import('@/pages/events/EventReports'));
const EventBookings = lazyNamed(() => import('@/pages/events/EventBookings'), 'default');
const EventBookingDetail = lazyNamed(() => import('@/pages/events/EventBookings'), 'EventBookingDetail');
const EventBookingForm = lazy(() => import('@/pages/events/EventBookingForm'));
const EventClients = lazyNamed(() => import('@/pages/events/EventClients'), 'EventClients');
const EventClientForm = lazyNamed(() => import('@/pages/events/EventClients'), 'EventClientForm');
const EventFacilities = lazyNamed(() => import('@/pages/events/EventFacilities'), 'EventFacilities');
const FacilityDetail = lazyNamed(() => import('@/pages/events/EventFacilities'), 'FacilityDetail');
const FacilityCreate = lazyNamed(() => import('@/pages/events/EventFacilities'), 'FacilityCreate');
const FacilityEdit = lazyNamed(() => import('@/pages/events/EventFacilities'), 'FacilityEdit');
// Lazy-load named exports from page modules.
function lazyNamed(
  loader: () => Promise<any>,
  exportName: string,
) {
  return lazy(async () => {
    const module = await loader();

    return {
      default: module[exportName] as ComponentType<any>,
    };
  });
}

const MyShift = lazy(() => import('@/pages/MyShift'));

const CheckInLanding = lazyNamed(
  () => import('@/pages/CheckIn'),
  'CheckInLanding',
);

const GuestDetail = lazyNamed(
  () => import('@/pages/Guests'),
  'GuestDetail',
);

const FolioDetail = lazyNamed(
  () => import('@/pages/Folios'),
  'FolioDetail',
);
const GuestCard = lazy(() => import('@/pages/GuestCard'));

const FolioPrintPreview = lazyNamed(
  () => import('@/pages/FolioPrintPreview'),
  'FolioPrintPreview',
);

const Kitchen = lazyNamed(
  () => import('@/pages/Orders'),
  'Kitchen',
);


const Adjustments = lazyNamed(
  () => import('@/pages/Inventory'),
  'Adjustments',
);

const AdjustmentNew = lazyNamed(
  () => import('@/pages/Inventory'),
  'AdjustmentNew',
);

const AdjustmentView = lazyNamed(
  () => import('@/pages/Inventory'),
  'AdjustmentView',
);

const BinCard = lazyNamed(
  () => import('@/pages/Inventory'),
  'BinCard',
);

const StockPosition = lazyNamed(
  () => import('@/pages/Inventory'),
  'StockPosition',
);

const StockMovementReport = lazyNamed(
  () => import('@/pages/Inventory'),
  'StockMovementReport',
);

const ItemView = lazyNamed(
  () => import('@/pages/Inventory'),
  'ItemView',
);

const ItemEdit = lazyNamed(
  () => import('@/pages/Inventory'),
  'ItemEdit',
);

const ItemAdjust = lazyNamed(
  () => import('@/pages/Inventory'),
  'ItemAdjust',
);

const EventCalendar = lazyNamed(
  () => import('@/pages/Calendars'),
  'EventCalendar',
);

const ReservationCalendar = lazyNamed(
  () => import('@/pages/Calendars'),
  'ReservationCalendar',
);

const StoreManagementList = lazyNamed(
  () => import('@/pages/StoreManagement'),
  'StoreManagementList',
);

const StoreDashboard = lazyNamed(
  () => import('@/pages/StoreManagement'),
  'StoreDashboard',
);

const StoreEdit = lazyNamed(
  () => import('@/pages/StoreManagement'),
  'StoreEdit',
);

const StoreItems = lazyNamed(
  () => import('@/pages/StoreManagement'),
  'StoreItems',
);

const StoreItemNew = lazyNamed(
  () => import('@/pages/StoreManagement'),
  'StoreItemNew',
);

const StoreItemView = lazyNamed(
  () => import('@/pages/StoreManagement'),
  'StoreItemView',
);

const StoreItemEdit = lazyNamed(
  () => import('@/pages/StoreManagement'),
  'StoreItemEdit',
);

const StoreStockIssueNew = lazyNamed(
  () => import('@/pages/StoreManagement'),
  'StoreStockIssueNew',
);

const AccountCreate = lazyNamed(
  () => import('@/pages/FinanceAccounts'),
  'AccountCreate',
);

const AccountDetails = lazyNamed(
  () => import('@/pages/FinanceAccounts'),
  'AccountDetails',
);

const AccountEdit = lazyNamed(
  () => import('@/pages/FinanceAccounts'),
  'AccountEdit',
);


// Finance pages.
const ChartOfAccounts = lazyNamed( () => import('@/pages/FinanceAccounts'), 'ChartOfAccounts',);
const Journal = lazyNamed( () => import('@/pages/FinanceJournal'), 'Journal',);
const JournalCreate = lazyNamed( () => import('@/pages/FinanceJournal'), 'JournalCreate',);
const JournalDetails = lazyNamed( () => import('@/pages/FinanceJournal'), 'JournalDetails',);
const TrialBalance = lazyNamed(() => import('@/pages/Finance'), 'TrialBalance');
const BalanceSheet = lazyNamed(() => import('@/pages/Finance'), 'BalanceSheet');
const ProfitLoss = lazyNamed(() => import('@/pages/Finance'), 'ProfitLoss');
const CashFlow = lazyNamed(() => import('@/pages/Finance'), 'CashFlow');
const GuestPayments = lazyNamed(() => import('@/pages/Finance'), 'GuestPayments');
const GuestLedger = lazyNamed(() => import('@/pages/Finance'), 'GuestLedger');
const CityLedger = lazyNamed(() => import('@/pages/Finance'), 'CityLedger');
const CityLedgerPage = lazy(() => import('@/pages/CityLedger'));
const CityLedgerCreate = lazy(() => import('@/pages/CityLedgerCreate'));
const PurchaseOrders = lazy(() => import('@/pages/PurchaseOrderList'));
const PurchaseOrderCreate = lazy(() => import('@/pages/PurchaseOrderCreate'));
const PaymentVouchers = lazy(() => import('@/pages/PaymentVouchers'));
const PaymentVoucherCreate = lazy(() => import('@/pages/PaymentVoucherCreate'));
const Suppliers = lazy(() => import('@/pages/Suppliers'));
const SupplierCreate = lazy(() => import('@/pages/SupplierCreate'));
const PayrollList = lazy(() => import('@/pages/PayrollList'));
const PayrollCreate = lazy(() => import('@/pages/PayrollCreate'));
const PayrollDetails = lazy(() => import('@/pages/PayrollDetails'));
const PayrollEdit = lazy(() => import('@/pages/PayrollEdit'));
const PayrollPayslip = lazy(() => import('@/pages/PayrollPayslip'));
const PayrollSettings = lazy(() => import('@/pages/PayrollSettings'));

// Report pages.
const SalesSummary = lazyNamed(() => import('@/pages/Reports'), 'SalesSummary');
const SalesReportsOverview = lazyNamed(() => import('@/pages/SalesReports'), 'SalesReportsOverview');
const DetailedSalesReport = lazyNamed(() => import('@/pages/SalesReports'), 'DetailedSalesReport');
const ControlSheetReport = lazyNamed(() => import('@/pages/SalesReports'), 'ControlSheetReport');
const SalesSummaryReport = lazyNamed(() => import('@/pages/SalesReports'), 'SalesSummaryReport');
const ItemSalesSummary = lazyNamed(() => import('@/pages/SalesReports'), 'ItemSalesSummary');
const DetailedSalesSummaryReport = lazyNamed(() => import('@/pages/SalesReports'), 'DetailedSalesSummaryReport');
const CheckInReport = lazyNamed(() => import('@/pages/Reports'), 'CheckInReport');
const CheckOutReport = lazyNamed(() => import('@/pages/Reports'), 'CheckOutReport');
const OccupancyReport = lazyNamed(() => import('@/pages/Reports'), 'OccupancyReport');
const Complimentary = lazyNamed(() => import('@/pages/Reports'), 'Complimentary');
const SecurityReport = lazy(() => import('@/pages/EasySecurityReport'));
const GuestsInfo = lazy(() => import('@/pages/GuestContactInfo'));
const CombinedShiftsReport = lazy(() => import('@/pages/reports/CombinedShiftsReport'));
const DssReports = lazyNamed(() => import('@/pages/security/SecurityPages'), 'DssReports');
const SecurityDashboard = lazyNamed(() => import('@/pages/security/SecurityPages'), 'SecurityDashboard');
const DailyDssReport = lazyNamed(() => import('@/pages/security/SecurityPages'), 'DailyDssReport');
const SecurityIncidents = lazyNamed(() => import('@/pages/security/SecurityPages'), 'SecurityIncidents');
const SecurityLogs = lazyNamed(() => import('@/pages/security/SecurityPages'), 'SecurityLogs');
const Shifts = lazyNamed(() => import('@/pages/Reports'), 'Shifts');
const ReportsDashboard = lazy(() => import('@/pages/reports/ReportsDashboard'));
const PaymentsShiftReport = lazy(() => import('@/pages/reports/PaymentsShiftReport'));
const DailyFinancialReport = lazyNamed(() => import('@/pages/reports/FinancialReports'), 'DailyFinancialReport');
const RevenueDepartmentReport = lazyNamed(() => import('@/pages/reports/FinancialReports'), 'RevenueDepartmentReport');
const OccupancyStatisticsReport = lazyNamed(() => import('@/pages/reports/FinancialReports'), 'OccupancyStatisticsReport');
const GroupPerformanceReport = lazyNamed(() => import('@/pages/reports/FinancialReports'), 'GroupPerformanceReport');
const RoomStatusDashboard = lazyNamed(() => import('@/pages/reports/OperationsReports'), 'RoomStatusDashboard');
const ArrivalDepartureReport = lazyNamed(() => import('@/pages/reports/OperationsReports'), 'ArrivalDepartureReport');
const RoomTypePerformanceReport = lazyNamed(() => import('@/pages/reports/OperationsReports'), 'RoomTypePerformanceReport');
const GuestMovementReport = lazyNamed(() => import('@/pages/reports/OperationsReports'), 'GuestMovementReport');
const HousekeepingStatusReport = lazyNamed(() => import('@/pages/reports/OperationsReports'), 'HousekeepingStatusReport');

// Miscellaneous pages.
const Misc = {
  Maintenance: lazyNamed(() => import('@/pages/Misc'), 'Maintenance'),

  Staff: lazyNamed(() => import('@/pages/Misc'), 'Staff'),
  Categories: lazyNamed(() => import('@/pages/Misc'), 'Categories'),
  Stores: lazyNamed(() => import('@/pages/Misc'), 'Stores'),
  StockReturns: lazyNamed(() => import('@/pages/Misc'), 'StockReturns'),
  StockReturnNew: lazyNamed(() => import('@/pages/Misc'), 'StockReturnNew',),
  StockIssues: lazyNamed(() => import('@/pages/Misc'), 'StockIssues'),
  StockIssueView: lazyNamed(() => import('@/pages/Misc'), 'StockIssueView'),
StockIssuePrint: lazyNamed(() => import('@/pages/Misc'), 'StockIssuePrint'),
  StockTransfers: lazyNamed(() => import('@/pages/Misc'), 'StockTransfers'),
  AutoExtensionStats: lazyNamed(() => import('@/pages/Misc'), 'AutoExtensionStats'),
  AutoExtensionLogs: lazyNamed(() => import('@/pages/Misc'), 'AutoExtensionLogs'),
  Users: lazyNamed(() => import('@/pages/Misc'), 'Users'),
  ChangePassword: lazyNamed(() => import('@/pages/Misc'), 'ChangePassword'),
};

function DashboardEntry() {
  const { user } = useAuth();

  const requiresWorkShift =
    user?.role === 'RECEPTIONIST' || user?.role === 'WAITER';

  const shiftQuery = useQuery({
    queryKey: ['dashboard-work-shift-check', user?.id],
    queryFn: () =>
      api.get('/work-shiftsme') as Promise<{
        currentShift?: {
          id: string;
          status: string;
        } | null;
      }>,
    enabled: Boolean(requiresWorkShift),
    retry: 1,
  });

  // Other roles can access the dashboard normally.
  if (!requiresWorkShift) {
    return <Dashboard />;
  }

  if (shiftQuery.isLoading) {
    return <Loading />;
  }

  // If the shift check fails, send the employee to My Shift
  // rather than allowing dashboard access without verification.
  if (shiftQuery.isError || !shiftQuery.data?.currentShift) {
    return <Navigate to="/my-shift" replace />;
  }

  return <Dashboard />;
}

function Protected() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) return <Loading />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Roles listed in REQUIRE_2FA_ROLES are held on the Security page until they enrol.
  if (user.mustSetUpTwoFactor && pathname !== '/security') {
    return <Navigate to="/security" replace />;
  }


  if (!canAccessPath(user.role, pathname)) {
    return <Navigate to="/" replace />;
  }

  return <AppShell />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/room/:token" element={<GuestPortal />} />

<Route element={<Protected />}>
<Route path="my-shift" element={<MyShift />} />
<Route path="work-schedules" element={<WorkSchedules />} />
<Route index element={<DashboardEntry />} />
<Route path="next-checkout" element={<NextCheckout />} />
<Route path="rooms" element={<Rooms />} />
<Route path="room-types" element={<RoomTypes />} />
<Route path="room-types/new" element={<RoomTypeForm />} />
<Route path="room-types/:id" element={<RoomTypeDetail />} />
<Route path="room-types/:id/edit" element={<RoomTypeForm />} />
<Route path="maintenance" element={<MaintenanceDashboard />} />
<Route path="maintenance/requests" element={<MaintenanceRequests />} />
<Route path="maintenance/requests/new" element={<MaintenanceRequestNew />} />
<Route path="maintenance/schedule" element={<MaintenanceSchedule />} />
<Route path="maintenance/reports" element={<MaintenanceReports />} />

<Route path="check-in" element={<CheckInLanding />} />
<Route path="check-in/new" element={<CheckIn />} />
<Route path="guest-card" element={<GuestCard />} />

<Route path="in-house" element={<InHouse />} />
<Route path="guests" element={<Guests />} />
<Route path="guests/:id/history" element={<GuestHistory />} />
<Route path="guests/:id" element={<GuestDetail />} />
<Route path="documents" element={<Documents />} />

<Route path="groups" element={<Groups />} />
<Route path="groups/:id" element={<GroupDetail />} />
<Route path="groups/:id/history" element={<GroupHistory />} />
       <Route path="reservations" element={<ReservationList />} />
<Route path="reservations/calendar" element={<ReservationCalendar />} />
<Route path="reservations/new" element={<NewReservation />} />
<Route path="reservations/:id/edit" element={<ReservationEdit />} />
<Route path="reservations/:id" element={<ReservationDetail />} />
<Route path="staff" element={<StaffManagement />} />
<Route path="staff/new" element={<StaffForm />} />
<Route path="staff/:id/edit" element={<StaffForm />} />
<Route path="staff/:id" element={<StaffDetail />} />
<Route path="folios" element={<Folios />} />
<Route path="folios/:id/print-preview" element={<FolioPrintPreview />}/>
<Route path="folios/:id" element={<FolioDetail />} />
<Route path="pos" element={<POS />} />
 <Route path="sales-points" element={<SalesPoints />} />
<Route path="credit" element={<Credit />} />
<Route path="events" element={<EventsDashboard />} />
<Route path="events/calendar" element={<EventCalendar />} />
<Route path="events/bookings" element={<EventBookings />} />
<Route path="events/bookings/new" element={<EventBookingForm />} />
<Route path="events/bookings/:id" element={<EventBookingDetail />} />
<Route path="events/clients" element={<EventClients />} />
<Route path="events/clients/new" element={<EventClientForm />} />
<Route path="events/facilities" element={<EventFacilities />} />
<Route path="events/facilities/new" element={<FacilityCreate />} />
<Route path="events/facilities/:id" element={<FacilityDetail />} />
<Route path="events/facilities/:id/edit" element={<FacilityEdit />} />
<Route path="events/reports" element={<EventReports />} />
<Route path="inventory" element={<Inventory />} />
<Route path="inventory/items/:id" element={<ItemView />} />
<Route path="inventory/items/:id/edit" element={<ItemEdit />} />
<Route path="inventory/items/:id/adjust-stock" element={<ItemAdjust />} />
<Route path="inventory/categories" element={<Misc.Categories />} />
<Route path="inventory/adjustments" element={<Adjustments scope="inventory" />}/>
<Route path="inventory/adjustments/new" element={<AdjustmentNew scope="inventory" />}/>
<Route path="inventory/adjustments/:id" element={<AdjustmentView scope="inventory" />}/>
<Route path="inventory/bin-card" element={<BinCard scope="inventory" />}/>
<Route path="inventory/stock-position"element={<StockPosition scope="inventory" />}/>
<Route path="inventory/stock-movement" element={<StockMovementReport />}/>
<Route path="stores" element={<StoreManagementList />} />
<Route path="stores/:storeId" element={<StoreDashboard />} />
<Route path="stores/:storeId/edit" element={<StoreEdit />} />
<Route path="stores/:storeId/items" element={<StoreItems />} />
<Route path="stores/:storeId/items/new" element={<StoreItemNew />} />
<Route path="stores/:storeId/items/:itemId" element={<StoreItemView />} />
<Route path="stores/:storeId/items/:itemId/edit" element={<StoreItemEdit />} />
<Route path="stores/:storeId/stock-issues/create" element={<StoreStockIssueNew />} />
<Route path="stores/bin-card" element={<BinCard scope="stores" />} />
<Route path="stores/adjustments"  element={<Adjustments scope="stores" />}/>
<Route path="stores/adjustments/new" element={<AdjustmentNew scope="stores" />}/>
       <Route  path="stores/adjustments/:id"  element={<AdjustmentView scope="stores" />}/>
     <Route path="stores/returns/new" element={<Misc.StockReturnNew />} />
<Route path="stores/returns" element={<Misc.StockReturns />} />

<Route path="stores/issues" element={<Misc.StockIssues />} />
<Route path="stores/issues/:id" element={<Misc.StockIssueView />} />
<Route path="stores/issues/:id/print" element={<Misc.StockIssuePrint />} />
          <Route path="stores/stock-position" element={<StockPosition scope="stores" />} />
          <Route path="stores/transfers" element={<Misc.StockTransfers />} />

          <Route path="orders" element={<Orders />} />
         <Route  path="orders/new"  element={<Navigate to="/pos" replace />}/>
          <Route path="orders/kitchen" element={<Kitchen />} />

          <Route path="stats/auto-extension" element={<Misc.AutoExtensionStats />} />
          <Route path="stats/auto-extension/logs" element={<Misc.AutoExtensionLogs />} />

          <Route path="finance/accounts" element={<ChartOfAccounts />} />
<Route path="finance/accounts/new" element={<AccountCreate />} />
<Route path="finance/accounts/:id/edit" element={<AccountEdit />} />
<Route path="finance/accounts/:id" element={<AccountDetails />} />
          <Route path="finance/journal" element={<Journal />} />
<Route path="finance/journal/new" element={<JournalCreate />} />
<Route path="finance/journal/:id" element={<JournalDetails />} />
          <Route path="finance/trial-balance" element={<TrialBalance />} />
          <Route path="finance/balance-sheet" element={<BalanceSheet />} />
          <Route path="finance/profit-loss" element={<ProfitLoss />} />
          <Route path="finance/cash-flow" element={<CashFlow />} />
          <Route path="finance/payments" element={<GuestPayments />} />
          <Route path="finance/ledger-guest" element={<GuestLedger />} />
          <Route path="finance/ledger-city" element={<CityLedger />} />
          <Route path="finance/city-ledger" element={<CityLedgerPage />} />
          <Route path="finance/city-ledger/create" element={<CityLedgerCreate />} />
          <Route path="finance/purchase-orders" element={<PurchaseOrders />} />
          <Route path="finance/purchase-orders/new" element={<PurchaseOrderCreate />} />
<Route path="finance/payment-vouchers" element={<PaymentVouchers />} />
<Route path="finance/payment-vouchers/new" element={<PaymentVoucherCreate />} />
<Route path="finance/suppliers" element={<Suppliers />} />
<Route path="finance/suppliers/new" element={<SupplierCreate />} />
          <Route path="finance/payroll" element={<PayrollList />} />
<Route path="finance/payroll/new" element={<PayrollCreate />} />
<Route path="finance/payroll/settings" element={<PayrollSettings />} />
<Route path="finance/payroll/:id" element={<PayrollDetails />} />
<Route path="finance/payroll/:id/edit" element={<PayrollEdit />} />
<Route path="finance/payroll/:id/payslip/:slipId" element={<PayrollPayslip />} />
          <Route path="finance/receivables" element={<Receivables />} />
          <Route path="finance/currencies" element={<CurrencyManagement />} />

          <Route path="power" element={<PowerCosts />} />
          <Route path="guest-crm" element={<GuestCRM />} />

          <Route path="reports/sales-summary" element={<SalesSummary />} />
<Route path="reports/sales/overview" element={<SalesReportsOverview />} />
<Route path="reports/sales/detailed" element={<DetailedSalesReport />} />
<Route path="reports/sales/control-sheet" element={<ControlSheetReport />} />
<Route path="reports/sales/summary" element={<SalesSummaryReport />} />
<Route path="reports/sales/items" element={<ItemSalesSummary />} />
<Route path="reports/sales/detailed-summary" element={<DetailedSalesSummaryReport />} />
<Route path="reports" element={<ReportsDashboard />} />
<Route path="reports/payments-shift" element={<PaymentsShiftReport />} />
<Route path="reports/daily-financial" element={<DailyFinancialReport />} />
<Route path="reports/revenue-department" element={<RevenueDepartmentReport />} />
<Route path="reports/occupancy-statistics" element={<OccupancyStatisticsReport />} />
<Route path="reports/room-status-dashboard" element={<RoomStatusDashboard />} />
<Route path="reports/arrival-departure" element={<ArrivalDepartureReport />} />
<Route path="reports/room-type-performance" element={<RoomTypePerformanceReport />} />
<Route path="reports/guest-movement" element={<GuestMovementReport />} />
<Route path="reports/group-performance" element={<GroupPerformanceReport />} />
<Route path="reports/housekeeping-status" element={<HousekeepingStatusReport />} />

          <Route path="reports/check-in" element={<CheckInReport />} />
          <Route path="reports/check-out" element={<CheckOutReport />} />
          <Route path="reports/occupancy" element={<OccupancyReport />} />
          <Route path="reports/complimentary" element={<Complimentary />} />
          <Route path="reports/shifts" element={<Shifts />} />
          <Route path="reports/security" element={<SecurityReport />} />
          <Route path="reports/guests-info" element={<GuestsInfo />} />
          <Route path="reports/shifts/combined" element={<CombinedShiftsReport />} />
<Route path="security/dashboard" element={<SecurityDashboard />} />
<Route path="security/dss-reports" element={<DssReports />} />
<Route path="security/dss-reports/daily" element={<DailyDssReport />} />
<Route path="security/incidents" element={<SecurityIncidents />} />
<Route path="security/logs" element={<SecurityLogs />} />

          <Route path="guard" element={<Guard />} />
          <Route path="audit-log" element={<AuditLog />} />
          <Route path="messages" element={<Messages />} />

          <Route path="staff-notifications" element={<StaffNotifications />} />
          <Route path="staff-chat" element={<StaffChat />} />

          <Route path="bar-control" element={<BarControl />} />
          <Route path="housekeeping" element={<Housekeeping />} />
          <Route path="night-audit" element={<NightAudit />} />
          <Route path="guest-requests" element={<GuestRequests />} />

          <Route path="users" element={<Misc.Users />} />
          <Route path="change-password" element={<Misc.ChangePassword />} />
          <Route path="security" element={<Security />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
