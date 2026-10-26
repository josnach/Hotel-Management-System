import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Loading } from '@/components/common';
import { useAuth } from '@/lib/auth';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import NextCheckout from '@/pages/NextCheckout';
import InHouse from '@/pages/InHouse';
import Rooms from '@/pages/Rooms';
import RoomTypes from '@/pages/RoomTypes';
import CheckIn, { CheckInLanding } from '@/pages/CheckIn';
import Guests, { GuestDetail } from '@/pages/Guests';
import Folios, { FolioDetail } from '@/pages/Folios';
import POS from '@/pages/POS';
import Credit from '@/pages/Credit';
import Orders, { Kitchen, NewOrder } from '@/pages/Orders';
import Inventory, { Adjustments, BinCard, StockPosition } from '@/pages/Inventory';
import { EventCalendar, ReservationCalendar } from '@/pages/Calendars';
import { BalanceSheet, CashFlow, ChartOfAccounts, CityLedger, GuestLedger, GuestPayments, Journal, ProfitLoss, PurchaseOrders, TrialBalance } from '@/pages/Finance';
import { CheckInReport, CheckOutReport, Complimentary, GuestsInfo, OccupancyReport, SalesSummary, SecurityReport, Shifts } from '@/pages/Reports';
import Guard from '@/pages/Guard';
import AuditLog from '@/pages/AuditLog';
import Messages from '@/pages/Messages';
import BarControl from '@/pages/BarControl';
import Housekeeping from '@/pages/Housekeeping';
import NightAudit from '@/pages/NightAudit';
import GuestPortal from '@/pages/GuestPortal';
import GuestRequests from '@/pages/GuestRequests';
import PayrollPage from '@/pages/PayrollPage';
import Receivables from '@/pages/Receivables';
import PowerCosts from '@/pages/PowerCosts';
import GuestCRM from '@/pages/GuestCRM';
import * as M from '@/pages/Misc';
import StaffNotifications from './components/StaffNotifications';
import StaffChat from '@/pages/StaffChat';
import CurrencyManagement from '@/pages/CurrencyManagement';
import Documents from '@/pages/Documents';
import Security from '@/pages/Security';

function Protected() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  // Roles listed in REQUIRE_2FA_ROLES are held on the Security page until they enrol.
  if (user.mustSetUpTwoFactor && pathname !== '/security') return <Navigate to="/security" replace />;
  return <AppShell />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/room/:token" element={<GuestPortal />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="next-checkout" element={<NextCheckout />} />
        <Route path="rooms" element={<Rooms />} />
        <Route path="room-types" element={<RoomTypes />} />
        <Route path="maintenance" element={<M.Maintenance />} />
        <Route path="check-in" element={<CheckInLanding />} />
        <Route path="check-in/new" element={<CheckIn />} />
        <Route path="in-house" element={<InHouse />} />
        <Route path="guests" element={<Guests />} />
        <Route path="guests/:id" element={<GuestDetail />} />
         <Route path="documents" element={<Documents />} />
        <Route path="groups" element={<M.Groups />} />
        <Route path="reservations" element={<ReservationCalendar />} />
        <Route path="staff" element={<M.Staff />} />
        <Route path="folios" element={<Folios />} />
        <Route path="folios/:id" element={<FolioDetail />} />
        <Route path="pos" element={<POS />} />
        <Route path="sales-points" element={<M.SalesPoints />} />
        <Route path="credit" element={<Credit />} />
        <Route path="events" element={<EventCalendar />} />
        <Route path="events/calendar" element={<EventCalendar />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="inventory/categories" element={<M.Categories />} />
        <Route path="inventory/adjustments" element={<Adjustments scope="inventory" />} />
        <Route path="inventory/bin-card" element={<BinCard scope="inventory" />} />
        <Route path="inventory/stock-position" element={<StockPosition scope="inventory" />} />
        <Route path="stores" element={<M.Stores />} />
        <Route path="stores/bin-card" element={<BinCard scope="stores" />} />
        <Route path="stores/adjustments" element={<Adjustments scope="stores" />} />
        <Route path="stores/returns" element={<M.StockReturns />} />
        <Route path="stores/issues" element={<M.StockIssues />} />
        <Route path="stores/stock-position" element={<StockPosition scope="stores" />} />
        <Route path="stores/transfers" element={<M.StockTransfers />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/new" element={<NewOrder />} />
        <Route path="orders/kitchen" element={<Kitchen />} />
        <Route path="stats/auto-extension" element={<M.AutoExtensionStats />} />
        <Route path="stats/auto-extension/logs" element={<M.AutoExtensionLogs />} />
        <Route path="finance/accounts" element={<ChartOfAccounts />} />
        <Route path="finance/journal" element={<Journal />} />
        <Route path="finance/trial-balance" element={<TrialBalance />} />
        <Route path="finance/balance-sheet" element={<BalanceSheet />} />
        <Route path="finance/profit-loss" element={<ProfitLoss />} />
        <Route path="finance/cash-flow" element={<CashFlow />} />
        <Route path="finance/payments" element={<GuestPayments />} />
        <Route path="finance/ledger-guest" element={<GuestLedger />} />
        <Route path="finance/ledger-city" element={<CityLedger />} />
        <Route path="finance/purchase-orders" element={<PurchaseOrders />} />
        <Route path="finance/payroll" element={<PayrollPage />} />
        <Route path="finance/receivables" element={<Receivables />} />
        <Route path="finance/currencies" element={<CurrencyManagement />} />
        <Route path="power" element={<PowerCosts />} />
        <Route path="guest-crm" element={<GuestCRM />} />
        <Route path="reports/sales-summary" element={<SalesSummary />} />
        <Route path="reports/check-in" element={<CheckInReport />} />
        <Route path="reports/check-out" element={<CheckOutReport />} />
        <Route path="reports/occupancy" element={<OccupancyReport />} />
        <Route path="reports/complimentary" element={<Complimentary />} />
        <Route path="reports/shifts" element={<Shifts />} />
        <Route path="reports/security" element={<SecurityReport />} />
        <Route path="reports/guests-info" element={<GuestsInfo />} />
        <Route path="guard" element={<Guard />} />
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="messages" element={<Messages />} />
        <Route path="staff-notifications" element={<StaffNotifications />} />
        <Route path="staff-chat" element={<StaffChat />} />
        <Route path="bar-control" element={<BarControl />} />
        <Route path="housekeeping" element={<Housekeeping />} />
        <Route path="night-audit" element={<NightAudit />} />
        <Route path="guest-requests" element={<GuestRequests />} />
        <Route path="users" element={<M.Users />} />
        <Route path="change-password" element={<M.ChangePassword />} />
        <Route path="security" element={<Security />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
