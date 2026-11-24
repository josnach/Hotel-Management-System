
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  checkInReservation,
  confirmReservation,
  fmtDate,
  money,
  nightsLabel,
  statusClass,
  statusLabel,
  type Reservation,
} from "@/lib/reservations";

type Filter = "ALL" | "PENDING" | "CONFIRMED" | "CHECKED_IN" | "CANCELLED";

interface ListResponse {
  data: Reservation[];
  counts: {
    all: number;
    pending: number;
    confirmed: number;
    checkedIn: number;
    cancelled: number;
  };
}

export default function ReservationList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Reservation[]>([]);
  const [counts, setCounts] = useState({
    all: 0,
    pending: 0,
    confirmed: 0,
    checkedIn: 0,
    cancelled: 0,
  });
  const [filter, setFilter] = useState<Filter>("ALL");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ status: filter });
      if (query) p.set("q", query);

      const res = await api<ListResponse>(`/reservations?${p}`);

      setRows(res.data);
      setCounts(res.counts);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [filter, query]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCheckIn = async (id: string) => {
    try {
      if (await checkInReservation(id)) {
        load();
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleConfirm = async (id: string) => {
    try {
      if (await confirmReservation(id)) load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const pills: { key: Filter; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: counts.all },
    { key: "PENDING", label: "Pending", count: counts.pending },
    { key: "CONFIRMED", label: "Confirmed", count: counts.confirmed },
    { key: "CHECKED_IN", label: "Checked In", count: counts.checkedIn },
    { key: "CANCELLED", label: "Cancelled", count: counts.cancelled },
  ];

  return (
    <div className="rounded-lg bg-white shadow-sm">
      {/* header */}
      <div className="flex items-center justify-between px-6 py-5">
        <h1 className="text-xl font-semibold text-gray-900">Reservations</h1>

        <Button
          className="bg-blue-600 hover:bg-blue-700"
          onClick={() => navigate("/reservations/new")}
        >
          New Reservation
        </Button>

        <Button
          className="bg-green-600 hover:bg-green-700"
          onClick={() => navigate("/reservations/calendar")}
        >
          Reservation Calendar
        </Button>
      </div>

      {/* search */}
      <form
        className="flex gap-3 border-t px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input.trim());
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search by reservation number, guest name, phone, or room..."
          className="flex-1"
        />

        <Button type="submit" className="bg-gray-700 hover:bg-gray-800">
          Search
        </Button>
      </form>

      {/* status pills */}
      <div className="flex flex-wrap gap-2 px-4 pb-4">
        {pills.map((p) => (
          <button
            key={p.key}
            onClick={() => setFilter(p.key)}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === p.key
                ? "bg-blue-100 text-blue-800"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {p.label} ({p.count})
          </button>
        ))}
      </div>

      {error && <p className="px-6 pb-3 text-sm text-red-600">{error}</p>}

      {/* table */}
      <div className="overflow-x-auto border-t">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              {[
                "Reservation #",
                "Guest",
                "Room",
                "Dates",
                "Amount",
                "Status",
                "Actions",
              ].map((h) => (
                <th key={h} className="px-6 py-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="font-semibold text-gray-900">
                    {r.reservationNumber}
                  </div>
                  <div className="text-gray-500">{fmtDate(r.createdAt)}</div>
                </td>

                <td className="px-6 py-4">
                  <div className="font-semibold text-gray-900">
                    {r.guest.name}
                  </div>
                  <div className="text-gray-500">{r.guest.phone}</div>
                </td>

                <td className="px-6 py-4 font-semibold">
                  {r.room.number}
                </td>

                <td className="px-6 py-4">
                  <div className="text-gray-900">{fmtDate(r.checkIn)}</div>
                  <div className="text-gray-500">
                    {fmtDate(r.checkOut)} ({nightsLabel(r.nights)})
                  </div>
                </td>

                <td className="px-6 py-4">
                  <div className="font-semibold text-gray-900">
                    {money(r.estimatedTotal)}
                  </div>
                  <div className="text-gray-500">
                    Paid: {money(r.paidAmount)}
                  </div>
                </td>

                <td className="px-6 py-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      statusClass[r.status]
                    }`}
                  >
                    {statusLabel[r.status]}
                  </span>
                </td>

                <td className="px-6 py-4">
                  <div className="flex gap-4">
  <Link to={`/reservations/${r.id}`} className="text-blue-600 hover:underline">View</Link>
  {(r.status === "CONFIRMED" || r.status === "PENDING") && (
    <Link to={`/reservations/${r.id}/edit`} className="text-green-600 hover:underline">Edit</Link>
  )}
  {r.status === "PENDING" && (
    <button onClick={() => handleConfirm(r.id)} className="text-amber-600 hover:underline">Confirm</button>
  )}
  {r.status === "CONFIRMED" && (
    <button onClick={() => handleCheckIn(r.id)} className="text-purple-600 hover:underline">Check In</button>
  )}
</div>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-10 text-center text-gray-500"
                >
                  No reservations found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
