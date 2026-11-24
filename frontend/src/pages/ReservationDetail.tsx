import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  checkInReservation,
  confirmReservation,
  fmtDate,
  fmtDateTime,
  money,
  nightsLabel,
  statusClass,
  statusLabel,
  type Reservation,
} from "@/lib/reservations";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER";

const Card = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="mb-6 rounded-lg bg-white shadow-sm">
    <div className="border-b px-6 py-4 text-lg font-medium text-gray-900">
      {title}
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const Field = ({
  label,
  children,
  sub,
}: {
  label: string;
  children: React.ReactNode;
  sub?: string;
}) => (
  <div>
    <div className="text-sm text-gray-600">{label}</div>
    <div className="text-lg text-gray-900">{children}</div>
    {sub && <div className="text-sm text-gray-500">{sub}</div>}
  </div>
);

type AddPaymentResponse = {
  reservation: unknown;
  payment: {
    id: number;
    amount: number | string;
    description: string;
    method: PaymentMethod;
    createdAt: string;
  };
  recordedTotal: number | string;
  confirmedNow?: boolean;
};

export default function ReservationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [r, setR] = useState<Reservation | null>(null);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("CASH");

  const [error, setError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError("Reservation ID is missing.");
      return;
    }

    try {
      setError("");
      const reservation = await api<Reservation>(
        `/reservations/${id}`,
      );
      setR(reservation);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to load reservation.",
      );
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">{error}</p>
        <Button className="mt-4" onClick={() => void load()}>
          Try Again
        </Button>
      </div>
    );
  }

  if (!r) {
    return <p className="p-6 text-gray-500">Loading...</p>;
  }

  // Pending and Confirmed reservations can be edited, paid, cancelled
  // and checked in. Pending ones can also be confirmed.
  const editable = r.status === "CONFIRMED" || r.status === "PENDING";
  const canCheckIn = r.status === "CONFIRMED" || r.status === "PENDING";
  const canAddPayment = editable;
  const cancellable = editable;

  const confirmBooking = async () => {
    try {
      if (await confirmReservation(r.id)) await load();
    } catch (e: unknown) {
      alert(
        e instanceof Error
          ? e.message
          : "Unable to confirm reservation.",
      );
    }
  };

  const checkIn = async () => {
    try {
      const updated = await checkInReservation(r.id);

      if (updated) {
        setR(updated);
        await load();
      }
    } catch (e: unknown) {
      alert(
        e instanceof Error ? e.message : "Unable to check in guest.",
      );
    }
  };

  const addPayment = async () => {
    setPaymentError("");

    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setPaymentError("Enter a valid payment amount greater than zero.");
      return;
    }

    if (paymentAmount > r.balanceDue) {
      setPaymentError(
        "The payment cannot exceed the outstanding reservation balance.",
      );
      return;
    }

    try {
      setSavingPayment(true);

      await api<AddPaymentResponse>(
        `/reservations/${r.id}/payments`,
        {
          method: "POST",
          body: JSON.stringify({
            amount: paymentAmount,
            method: paymentMethod,
            description:
              desc.trim() || "Additional reservation deposit",
          }),
        },
      );

      setAmount("");
      setDesc("");
      setPaymentMethod("CASH");

      // The payment endpoint returns a wrapper object, and may also have
      // confirmed a Pending reservation. Reload to get the latest status.
      await load();
    } catch (e: unknown) {
      setPaymentError(
        e instanceof Error
          ? e.message
          : "Unable to record reservation payment.",
      );
    } finally {
      setSavingPayment(false);
    }
  };

  const cancelReservation = async () => {
    if (!window.confirm("Cancel this reservation?")) return;

    try {
      await api(`/reservations/${r.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "CANCELLED",
        }),
      });

      await load();
    } catch (e: unknown) {
      alert(
        e instanceof Error
          ? e.message
          : "Unable to cancel reservation.",
      );
    }
  };

  const markNoShow = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to mark reservation #${r.reservationNumber} as No Show? This action will update the reservation status.`,
    );

    if (!confirmed) return;

    try {
      await api(`/reservations/${r.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "NO_SHOW",
        }),
      });

      await load();
    } catch (e: unknown) {
      alert(
        e instanceof Error
          ? e.message
          : "Unable to mark reservation as No Show.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* Header */}
      <div className="mb-6 rounded-lg bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Reservation #{r.reservationNumber}
            </h1>
            <p className="text-sm text-gray-600">
              Created {fmtDateTime(r.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {editable && (
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() =>
                  navigate(`/reservations/${r.id}/edit`)
                }
              >
                Edit
              </Button>
            )}

            {r.status === "PENDING" && (
              <Button
                className="bg-amber-600 hover:bg-amber-700"
                onClick={confirmBooking}
              >
                Confirm
              </Button>
            )}

            {canCheckIn && (
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                onClick={checkIn}
              >
                Check In
              </Button>
            )}

            <Button
              className="bg-gray-700 hover:bg-gray-800"
              onClick={() => navigate("/reservations")}
            >
              Back to List
            </Button>
          </div>
        </div>

        <div className="border-t px-6 py-4">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${statusClass[r.status]}`}
          >
            {statusLabel[r.status]}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="lg:col-span-2">
          <Card title="Guest Information">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field label="Name">
                <span className="font-semibold">
                  {r.guest.name}
                </span>
              </Field>

              <Field label="Phone">{r.guest.phone}</Field>

              <Field label="Email">
                {r.guest.email || "N/A"}
              </Field>

              <Field label="ID">
                {r.guest.idNumber || "N/A"}
              </Field>
            </div>
          </Card>

          <Card title="Reservation Details">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field
                label="Room"
                sub={`${money(r.room.pricePerNight)}/night`}
              >
                <span className="font-semibold">
                  {r.room.number} - {r.room.type}
                </span>
              </Field>

              <Field label="Group">
                {r.group?.name ?? "No Group"}
              </Field>

              <Field label="Expected Check-in">
                <span className="font-semibold">
                  {fmtDate(r.checkIn)}
                </span>
              </Field>

              <Field label="Expected Check-out">
                <span className="font-semibold">
                  {fmtDate(r.checkOut)}
                </span>
              </Field>

              <Field label="Number of Guests">
                {r.numberOfGuests}
              </Field>

              <Field label="Stay Duration">
                {nightsLabel(r.nights)}
              </Field>
            </div>
          </Card>

          <Card title="Payment History">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2 text-right">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {r.payments.map((payment) => (
                    <tr key={payment.id} className="border-t">
                      <td className="whitespace-nowrap px-3 py-3">
                        {fmtDateTime(payment.date).replace(
                          " at",
                          "",
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {payment.description}
                      </td>

                      <td className="px-3 py-3">
                        {payment.method ?? "N/A"}
                      </td>

                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-green-600">
                        +{money(payment.amount)}
                      </td>
                    </tr>
                  ))}

                  {r.payments.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-6 text-center text-gray-500"
                      >
                        No payments recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div>
          <Card title="Financial Summary">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span>Estimated Total:</span>
                <span className="font-semibold">
                  {money(r.estimatedTotal)}
                </span>
              </div>

              <div className="flex justify-between gap-3">
                <span>Paid Amount:</span>
                <span className="font-semibold text-green-600">
                  {money(r.paidAmount)}
                </span>
              </div>

              <div className="flex justify-between gap-3 border-t pt-3 font-semibold">
                <span>Balance Due:</span>
                <span>{money(r.balanceDue)}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-3">
                <div>
                  Payment Method:
                  <div className="font-medium">
                    {r.paymentMethod || "N/A"}
                  </div>
                </div>

                <div>
                  Guarantee Type:
                  <div className="font-medium">
                    {r.guaranteeType || "N/A"}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {canAddPayment && (
            <Card title="Add Reservation Deposit">
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="payment-amount"
                    className="mb-1 block text-sm text-gray-700"
                  >
                    Payment Amount (NGN)
                  </label>

                  <Input
                    id="payment-amount"
                    type="number"
                    min="0.01"
                    max={r.balanceDue}
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={savingPayment}
                  />
                </div>

                <div>
                  <label
                    htmlFor="payment-method"
                    className="mb-1 block text-sm text-gray-700"
                  >
                    Payment Method
                  </label>

                  <select
                    id="payment-method"
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(
                        e.target.value as PaymentMethod,
                      )
                    }
                    disabled={savingPayment}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="TRANSFER">Bank Transfer</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="payment-description"
                    className="mb-1 block text-sm text-gray-700"
                  >
                    Description
                  </label>

                  <Input
                    id="payment-description"
                    placeholder="Additional reservation deposit"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    disabled={savingPayment}
                  />
                </div>

                {paymentError && (
                  <p className="text-sm text-red-600">
                    {paymentError}
                  </p>
                )}

                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={addPayment}
                  disabled={savingPayment || r.balanceDue <= 0}
                >
                  {savingPayment
                    ? "Recording Payment..."
                    : "Add Payment"}
                </Button>
              </div>
            </Card>
          )}

          {cancellable && (
            <Card title="Reservation Actions">
              <div className="space-y-3">
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700"
                  onClick={markNoShow}
                >
                  Mark as No Show
                </Button>

                <Button
                  className="w-full bg-red-600 hover:bg-red-700"
                  onClick={cancelReservation}
                >
                  Cancel Reservation
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}