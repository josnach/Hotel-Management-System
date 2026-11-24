export type AppRole =
  | 'ADMIN'
  | 'MANAGER'
  | 'RECEPTIONIST'
  | 'WAITER'
  | 'CHEF'
  | 'HOUSEKEEPING'
  | 'ACCOUNTANT'
  | 'STOREKEEPER'
  | 'MAINTENANCE';

const ALL_ROLES: AppRole[] = [
  'ADMIN',
  'MANAGER',
  'RECEPTIONIST',
  'WAITER',
  'CHEF',
  'HOUSEKEEPING',
  'ACCOUNTANT',
  'STOREKEEPER',
  'MAINTENANCE',
];

/**
 * Frontend route permissions.
 *
 * ADMIN and MANAGER are handled as broad-access roles in canAccessPath().
 * Every other role must have an explicit matching route below.
 *
 * Dynamic route segments use the React Router-style ":param" syntax.
 */
const ROLE_ROUTES: Record<Exclude<AppRole, 'ADMIN' | 'MANAGER'>, string[]> = {
  RECEPTIONIST: [
    '/my-shift',
   '/night-audit',
    '/',
    '/next-checkout',
    '/rooms',
    '/room-types',
     '/room-types/:id',
    '/maintenance',
    '/check-in',
    '/check-in/new',
    '/in-house',
    '/guests',
    '/guests/:id',
    '/guests/:id/history',
    '/documents',
     '/groups',
    '/groups/:id',
    '/groups/:id/history',
    '/reservations',
    '/reservations/calendar',
    '/reservations/new',
    '/folios',
    '/folios/:id',
    '/guest-crm',
    '/reports/check-in',
    '/reports/check-out',
    '/reports/occupancy',
    '/security',
    '/staff-notifications',
    '/staff-chat',
    '/change-password',
    '/security',
      '/events',
    '/events/bookings',
    '/events/bookings/new',
    '/events/bookings/:id',
    '/events/bookings/:id/edit',
    '/events/clients',
    '/events/clients/new',
    '/events/facilities',
    '/events/facilities/:id',
    '/events/facilities/new',
    '/events/facilities/:id/edit',
    '/events/calendar',
    '/events/reports',
    '/reports', '/reports/payments-shift', '/reports/occupancy-statistics', '/reports/room-status-dashboard',
    '/reports/arrival-departure', '/reports/room-type-performance', '/reports/guest-movement', '/reports/housekeeping-status',
    '/reports/shifts/combined', '/security/dashboard', '/security/dss-reports', '/security/dss-reports/daily', '/security/incidents', '/security/logs',


  ],

  WAITER: [
    '/my-shift',
     '/night-audit',
    '/',
    '/rooms',
    '/room-types',
'/room-types/:id',
    '/guests',
    '/guests/:id',
    '/in-house',
    '/pos',
    '/sales-points',
    '/credit',
    '/orders',
    '/orders/new',
    '/orders/kitchen',
    '/staff-notifications',
    '/staff-chat',
    '/change-password',
    '/security',
  ],

  CHEF: [
    '/',
    '/orders/kitchen',
    '/staff-notifications',
    '/staff-chat',
    '/change-password',
    '/security',
  ],

  HOUSEKEEPING: [
    '/',
    '/rooms',
    '/housekeeping',
    '/guest-requests',
    '/maintenance',
    '/maintenance/requests',
'/maintenance/requests/new',
'/maintenance/schedule',
'/maintenance/reports',
'/reports', '/reports/housekeeping-status',
    '/reports/occupancy',
    '/staff-notifications',
    '/staff-chat',
    '/change-password',
    '/security',
  ],

  ACCOUNTANT: [
    '/',
    '/rooms',
    '/room-types',
    '/guests',
    '/guests/:id',
    '/guests/:id/history',
    '/staff',
     '/staff/:id',
    '/folios',
    '/folios/:id',
    '/finance/accounts',
    '/finance/accounts/new',
'/finance/accounts/:id',
'/finance/accounts/:id/edit',
    '/finance/journal',
'/finance/journal/new',
'/finance/journal/:id',
    '/finance/trial-balance',
    '/finance/balance-sheet',
    '/finance/profit-loss',
    '/finance/cash-flow',
    '/finance/payments',
    '/finance/ledger-guest',
    '/finance/ledger-city',
     '/finance/city-ledger',
    '/finance/city-ledger/create',
    '/finance/purchase-orders',
        '/finance/purchase-orders/new',
    '/finance/payment-vouchers',
    '/finance/payment-vouchers/new',
    '/finance/suppliers',
    '/finance/suppliers/new',
    '/finance/payroll',
        '/finance/payroll/new',
    '/finance/payroll/settings',
    '/finance/payroll/:id',
    '/finance/payroll/:id/edit',
    '/finance/payroll/:id/payslip/:slipId',
    '/finance/receivables',
    '/finance/currencies',
    '/power',
    '/reports/sales-summary',
    '/reports/sales/overview',
'/reports/sales/detailed',
'/reports/sales/control-sheet',
'/reports/sales/summary',
'/reports/sales/items',
'/reports/sales/detailed-summary',
    '/reports/check-in',
    '/reports/check-out',
    '/reports/occupancy',
    '/reports/complimentary',
    '/reports/shifts',
    '/reports/shifts/combined',
    '/reports', '/reports/payments-shift', '/reports/daily-financial', '/reports/revenue-department', '/reports/group-performance',
    '/reports/security',
    '/reports/guests-info',
    '/audit-log',
    '/staff-notifications',
    '/staff-chat',
    '/change-password',
    '/security',

  ],

  STOREKEEPER: [
    '/',
    '/inventory',
    '/inventory/categories',
    '/inventory/adjustments',
    '/inventory/bin-card',
    '/inventory/stock-position',
    '/stores',
    '/stores/:storeId',
    '/stores/:storeId/edit',
'/stores/:storeId/items',
'/stores/:storeId/items/new',
'/stores/:storeId/items/:itemId',
'/stores/:storeId/items/:itemId/edit',
'/stores/:storeId/stock-issues/create',
    '/stores/bin-card',
    '/stores/adjustments',
    '/stores/returns',
    '/stores/issues',
    '/stores/stock-position',
    '/stores/transfers',
    '/staff-notifications',
    '/staff-chat',
    '/change-password',
    '/security',
  ],

  MAINTENANCE: [
    '/',
    '/rooms',
    '/maintenance',
    '/power',
    '/staff-notifications',
    '/staff-chat',
    '/change-password',
    '/security',
  ],
};

function matchesRoute(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) return false;

  return patternParts.every((part, index) => {
    return part.startsWith(':') || part === pathParts[index];
  });
}

/**
 * Returns whether a role may open a frontend route.
 * ADMIN and MANAGER retain broad access.
 */
export function canAccessPath(
  role: string | undefined | null,
  pathname: string,
): boolean {
  if (!role || !ALL_ROLES.includes(role as AppRole)) return false;

  if (role === 'ADMIN' || role === 'MANAGER') return true;

  const routes = ROLE_ROUTES[role as Exclude<AppRole, 'ADMIN' | 'MANAGER'>];

  return routes.some((route) => matchesRoute(route, pathname));
}

/**
 * Use this to filter navigation items, including nested groups.
 * Items without a "to" property are treated as groups.
 */
export function filterNavigation<T extends { label: string }>(
  items: T[],
  role: string | undefined | null,
): T[] {
  return items.reduce<T[]>((visible, item) => {
    const node = item as T & {
      to?: string;
      children?: T[];
    };

    if (node.to) {
      if (canAccessPath(role, node.to.split('?')[0])) {
        visible.push(item);
      }
      return visible;
    }

    if (node.children) {
      const children = filterNavigation(node.children, role);

      if (children.length > 0) {
        visible.push({ ...item, children } as T);
      }
    }

    return visible;
  }, []);
}