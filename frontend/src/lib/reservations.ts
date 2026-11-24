
import { api as authenticatedApi } from "@/lib/api";

export type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "CANCELLED"
  | "NO_SHOW";

export type ReservationPaymentMethod =
  | "CASH"
  | "CARD"
  | "TRANSFER"
  | "ROOM_CHARGE"
  | "STAFF_CREDIT"
  | "CITY_LEDGER";

export interface ReservationPayment {
  id: number;
  date: string;
  description: string;
  amount: number;
  method?: ReservationPaymentMethod | null;
}

export interface Reservation {
  id: string;
  reservationNumber: string;
  createdAt: string;
  status: ReservationStatus;

  guest: {
    name: string;
    phone: string;
    email?: string | null;
    idNumber?: string | null;
  };

  room: {
    id: string;
    number: string;
    type: string;
    pricePerNight: number;
  };

  group: {
    id: string;
    name: string;
  } | null;

  checkIn: string;
  checkOut: string;
  nights: number;
  numberOfGuests: number;

  estimatedTotal: number;
  paidAmount: number;
  balanceDue: number;

  paymentMethod?: string | null;
  guaranteeType?: string | null;
  specialRequests?: string | null;

  payments: ReservationPayment[];
}

/**
 * Reservation API helper.
 *
 * All requests use the shared authenticated API client in api.ts.
 * This ensures the hms_token JWT is attached automatically.
 */
export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();

  // Convert supplied headers into a plain object.
  const headers = new Headers(init.headers);
  const extraHeaders: Record<string, string> = {};

  headers.forEach((value, key) => {
    extraHeaders[key] = value;
  });

  // Reservation requests use JSON bodies.
  let body: unknown;

  if (init.body !== undefined && init.body !== null) {
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    } else {
      body = init.body;
    }
  }

  switch (method) {
    case "GET":
      return authenticatedApi.get<T>(path);

    case "POST":
      return authenticatedApi.post<T>(
        path,
        body,
        extraHeaders,
      );

    case "PUT":
      return authenticatedApi.put<T>(path, body);

    case "PATCH":
      return authenticatedApi.patch<T>(path, body);

    case "DELETE":
      return authenticatedApi.del<T>(path);

    default:
      throw new Error(
        `Unsupported reservation API method: ${method}`,
      );
  }
}

export const money = (n: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(n);

export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const fmtDateTime = (d: string) =>
  `${fmtDate(d)} at ${new Date(d).toLocaleTimeString(
    "en-US",
    {
      hour: "numeric",
      minute: "2-digit",
    },
  )}`;

export const nightsLabel = (n: number) =>
  `${n} night${n === 1 ? "" : "s"}`;

export const statusLabel: Record<
  ReservationStatus,
  string
> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked In",
  CHECKED_OUT: "Checked Out",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-Show",
};

export const statusClass: Record<
  ReservationStatus,
  string
> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  CONFIRMED: "bg-green-100 text-green-800",
  CHECKED_IN: "bg-blue-100 text-blue-800",
  CHECKED_OUT: "bg-gray-100 text-gray-700",
  CANCELLED: "bg-red-100 text-red-800",
  NO_SHOW: "bg-orange-100 text-orange-800",
};

/**
 * Same confirmation text as the original system.
 * Returns the updated reservation or null if cancelled.
 */
export async function checkInReservation(
  id: string,
): Promise<Reservation | null> {
  if (
    !window.confirm(
      "Check in this guest? This will create a folio and start charging room rates.",
    )
  ) {
    return null;
  }

  return api<Reservation>(
    `/reservations/${id}/check-in`,
    {
      method: "POST",
    },
  );
}

export async function confirmReservation(id: string): Promise<Reservation | null> {
  if (!window.confirm("Confirm this reservation?")) return null;
  return api<Reservation>(`/reservations/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
}
