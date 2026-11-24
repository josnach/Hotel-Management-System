import { BarChart3, Bell, Coins, FileText, Boxes, Building2, CalendarDays, Landmark, MessagesSquare, ShieldAlert, ShoppingCart, type LucideIcon } from 'lucide-react';

export interface NavLeaf { label: string; to: string; badge?: 'unpaid' }
export interface NavGroup { label: string; children: NavLeaf[] }
export type NavItem = NavLeaf | NavGroup;
export interface NavSection { label: string; icon: LucideIcon; items: NavItem[]; /** Only these roles see the menu (the API enforces it too). */ roles?: string[] }

export const isGroup = (i: NavItem): i is NavGroup => 'children' in i;

/** Mirrors the top navigation of the original system. */
export const NAV: NavSection[] = [
  {
    label: 'Hotel Operations',
    icon: Building2,
    items: [
      {
        label: 'Room Management',
        children: [
          { label: 'Rooms', to: '/rooms' },
          { label: 'Room Types', to: '/room-types' },
          { label: 'Housekeeping', to: '/housekeeping' },
          { label: 'Maintenance', to: '/maintenance' },
        ],
      },
      {
        label: 'Guest Management',
        children: [
          { label: 'Check-in', to: '/check-in' },
          { label: 'In-House Guests', to: '/in-house' },
          { label: 'Guest Requests', to: '/guest-requests' },
          { label: 'Guest CRM', to: '/guest-crm' },
          { label: 'All Guests', to: '/guests' },
          { label: 'Groups', to: '/groups' },
          { label: 'Guest Documents', to: '/documents' }
        ],
      },
     {
  label: 'Reservations',
  children: [
    { label: 'All Reservations', to: '/reservations' },
    { label: 'Reservation Calendar', to: '/reservations/calendar' },
    { label: 'New Reservation', to: '/reservations/new' }
  ]
},
      { label: 'Staff Management', to: '/staff' },
      { label: 'Folios', to: '/folios' },
      { label: 'Cash Drawer & Night Audit', to: '/night-audit' },
    ],
  },
  {
  label: 'Sales & Retail',
  icon: ShoppingCart,
  roles: ['ADMIN', 'MANAGER', 'WAITER'],
  items: [
    { label: 'Point of Sale (POS)', to: '/pos' },
    { label: 'Sales Points', to: '/sales-points' },
    { label: 'Unpaid Bills', to: '/credit', badge: 'unpaid' },
  ],
},
 {
  label: 'Events',
  icon: CalendarDays,
  items: [
    { label: 'Events Dashboard', to: '/events' },
    { label: 'Event Bookings', to: '/events/bookings' },
    { label: 'Events Calendar', to: '/events/calendar' },
    { label: 'Event Clients', to: '/events/clients' },
    { label: 'Event Facilities', to: '/events/facilities' },
    { label: 'Event Reports', to: '/events/reports' },
  ],
},
  {
    label: 'Inventory & Operations',
    icon: Boxes,
    items: [
      {
        label: 'Inventory Management',
        children: [
          { label: 'All Inventory Items', to: '/inventory' },
          { label: 'Inventory Categories', to: '/inventory/categories' },
          { label: 'Pending Adjustments', to: '/inventory/adjustments' },
          { label: 'Inventory Bin Card', to: '/inventory/bin-card' },
          { label: 'Bar & Restaurant Control', to: '/bar-control' },
          { label: 'Inventory Stock Position', to: '/inventory/stock-position' },
          { label: 'Stock Movement Report', to: '/inventory/stock-movement' },
        ],
      },
      {
        label: 'Store Management',
        children: [
          { label: 'Stores', to: '/stores' },
          { label: 'Store Bin Card', to: '/stores/bin-card' },
          { label: 'Store Stock Adjustments', to: '/stores/adjustments' },
          { label: 'Stock Returns', to: '/stores/returns' },
          { label: 'Stock Issues', to: '/stores/issues' },
          { label: 'Store Stock Position', to: '/stores/stock-position' },
          { label: 'Stock Transfers', to: '/stores/transfers' },
        ],
      },
      {
        label: 'Orders Management',
        children: [
          { label: 'All Orders', to: '/orders' },
          { label: 'Kitchen Display', to: '/orders/kitchen' },
        ],
      },
      {
        label: 'Statistics',
        children: [
          { label: 'Auto Extension Statistics', to: '/stats/auto-extension' },
          { label: 'Auto Extension Logs', to: '/stats/auto-extension/logs' },
        ],
      },
    ],
  },
  {
    label: 'Finance',
    icon: Landmark,
    items: [
      {
        label: 'Accounting',
        children: [
          { label: 'Chart of Accounts', to: '/finance/accounts' },
          { label: 'Journal Entries', to: '/finance/journal' },
        ],
      },
      {
        label: 'Financial Reports',
        children: [
          { label: 'Trial Balance', to: '/finance/trial-balance' },
          { label: 'Balance Sheet', to: '/finance/balance-sheet' },
          { label: 'Profit & Loss', to: '/finance/profit-loss' },
          { label: 'Cash Flow', to: '/finance/cash-flow' },
        ],
      },
            {
        label: 'Payments',
        children: [
          { label: 'Payment Vouchers', to: '/finance/payment-vouchers' },
          { label: 'Purchase Orders', to: '/finance/purchase-orders' },
          { label: 'Suppliers', to: '/finance/suppliers' },
          { label: 'Guest Payments', to: '/finance/payments' },
        ],
      },
      {
        label: 'Ledgers',
        children: [
          { label: 'Guest Ledger', to: '/finance/ledger-guest' },
          { label: 'City Ledger', to: '/finance/city-ledger' }
        ],
      },
      {  label: 'Currency Management',  to: '/finance/currencies' },
      { label: 'Payroll Management', to: '/finance/payroll' },
      { label: 'Receivables Aging', to: '/finance/receivables' },
      { label: 'Power & Diesel', to: '/power' },
    ],
  },
  {
    label: 'Reports',
    icon: BarChart3,
    items: [
  { label: 'Reports Dashboard', to: '/reports' },
{
  label: 'Sales Reports',
  children: [
    { label: 'Sales Reports Overview', to: '/reports/sales/overview' },
    { label: 'Detailed Sales Report', to: '/reports/sales/detailed' },
    { label: 'Control Sheet', to: '/reports/sales/control-sheet' },
    { label: 'Sales Summary Report', to: '/reports/sales/summary' },
    { label: 'Item Sales Summary', to: '/reports/sales/items' },
    { label: 'Detailed Sales Summary', to: '/reports/sales/detailed-summary' },
    { label: 'Legacy Detailed Sales Summary', to: '/reports/sales-summary' },
  ],
},

      {
        label: 'Guest Reports',
        children: [
          { label: 'Check-in Report', to: '/reports/check-in' },
          { label: 'Check-out Report', to: '/reports/check-out' },
          { label: 'Occupancy Report', to: '/reports/occupancy' },
        ],
      },
      {
        label: 'Special Reports',
        children: [
          { label: 'Complimentary Report', to: '/reports/complimentary' },
          { label: 'Guest Security Report', to: '/reports/security' },
        ],
      },
      {
       label: 'Shift Reports',
  children: [
    { label: 'Frontdesk Payments Shifts Report', to: '/reports/payments-shift' },
    { label: 'Combined Shifts Report', to: '/reports/shifts/combined' },
  ],
},
      {
        label: 'Security',
        children: [
       { label: 'All DSS Reports', to: '/security/dss-reports' },
    { label: 'Security Dashboard', to: '/security/dashboard' },
    { label: 'Guests Info', to: '/reports/guests-info' },
        ],
      },
    ],
  },
  {
    label: 'Control',
    icon: ShieldAlert,
    roles: ['ADMIN', 'MANAGER'],
    items: [
      { label: 'Revenue Guard', to: '/guard' },
      { label: 'Audit Log', to: '/audit-log' },
      { label: 'WhatsApp Messages', to: '/messages' },
      { label: 'Work Schedules', to: '/work-schedules'},
    ],
  },
  {
    label: 'Notifications',
    icon: Bell,
    items: [{ label: 'Staff Notifications', to: '/staff-notifications' }],
  },

  { label: 'Staff Chat', icon: MessagesSquare, items: [{ label: 'Staff Chat', to: '/staff-chat' }] },
];
