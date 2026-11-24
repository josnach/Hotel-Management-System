import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, money, nightsLabel, type Reservation } from "@/lib/reservations";

interface RoomOption {
  id: string;
  number: string;
  rateOverride: number | null;
  roomType: {
    nightlyRate: number;
  };
}

interface GroupOption {
  id: string;
  name: string;
}

const PAYMENT_METHODS = ["Cash", "Credit Card", "Debit Card", "Bank Transfer", "POS"];
const GUARANTEE_TYPES = ["Deposit", "Credit Card", "Company Guarantee", "None"];
const selectCls = "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm";
const toInput = (d: string) => d.slice(0, 10); // yyyy-mm-dd for <input type="date">

export default function ReservationEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [r, setR] = useState<Reservation | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    roomId: "", groupId: "", checkIn: "", checkOut: "",
    numberOfGuests: "1", paymentMethod: "Credit Card", guaranteeType: "Deposit", specialRequests: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<any>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    (async () => {
      try {
   const [res, rm, gr] = await Promise.all([
  api<Reservation>(`/reservations/${id}`),
  api<RoomOption[]>("/rooms"),
  api<GroupOption[]>("/groups"),
]);
if (res.status !== "CONFIRMED" && res.status !== "PENDING") {
  navigate(`/reservations/${id}`, { replace: true });
  return;
}

setR(res);
setRooms(rm);
setGroups(gr);

setForm({
  roomId: String(res.room.id),
  groupId: res.group ? String(res.group.id) : "",
  checkIn: toInput(res.checkIn),
  checkOut: toInput(res.checkOut),
  numberOfGuests: String(res.numberOfGuests),
  paymentMethod: res.paymentMethod || "Credit Card",
  guaranteeType: res.guaranteeType || "Deposit",
  specialRequests: res.specialRequests ?? "",
});
      } catch (e: any) { setError(e.message); }
    })();
  }, [id, navigate]);

const estimate = useMemo(() => {
  const room = rooms.find((x) => x.id === form.roomId);

  if (!room || !form.checkIn || !form.checkOut) {
    return null;
  }

  const nights = Math.round(
    (+new Date(form.checkOut) - +new Date(form.checkIn)) /
      86_400_000,
  );

  const pricePerNight =
    room.rateOverride ?? room.roomType.nightlyRate;

  return nights > 0
    ? {
        nights,
        total: nights * Number(pricePerNight),
      }
    : null;
}, [rooms, form.roomId, form.checkIn, form.checkOut]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!estimate) { setError("Check-out must be after check-in"); return; }
    setSaving(true); setError("");
    try {
      await api(`/reservations/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...form,
        roomId: form.roomId,
groupId: form.groupId || null,
          numberOfGuests: Number(form.numberOfGuests),
        }),
      });
      navigate(`/reservations/${id}`);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  if (!r) return <p className="p-6 text-gray-500">{error || "Loading..."}</p>;

  const L = ({ children }: { children: React.ReactNode }) => (
    <label className="mb-1 block text-sm font-medium text-gray-700">{children}</label>
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <form onSubmit={submit} className="rounded-lg bg-white shadow-sm">
        <div className="border-b px-6 py-5 text-lg font-semibold text-gray-900">Edit Reservation #{r.reservationNumber}</div>

        <div className="space-y-5 p-6">
          <div>
            <div className="mb-2 text-sm font-medium text-gray-700">Guest Information</div>
            <div className="grid grid-cols-2 gap-4 rounded-md bg-gray-50 p-4 text-sm">
              <div><div className="text-gray-600">Name</div><div className="font-semibold">{r.guest.name}</div></div>
              <div><div className="text-gray-600">Phone</div><div>{r.guest.phone}</div></div>
              <div><div className="text-gray-600">Email</div><div>{r.guest.email || "N/A"}</div></div>
              <div><div className="text-gray-600">ID</div><div>{r.guest.idNumber || "N/A"}</div></div>
            </div>
          </div>

          <div>
            <L>Select Room *</L>
            <select className={selectCls} value={form.roomId} onChange={set("roomId")} required>
              {rooms.map((x) => (
                <option key={x.id} value={x.id}>
  {x.number} - (
  {money(Number(x.rateOverride ?? x.roomType.nightlyRate))}/night)
</option>
              ))}
            </select>
          </div>

          <div>
            <L>Assign to Group (Optional)</L>
            <select className={selectCls} value={form.groupId} onChange={set("groupId")}>
              <option value="">No Group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><L>Expected Check-in *</L><Input type="date" required value={form.checkIn} onChange={set("checkIn")} /></div>
            <div><L>Expected Check-out *</L><Input type="date" required min={form.checkIn} value={form.checkOut} onChange={set("checkOut")} /></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><L>Number of Guests *</L><Input type="number" min={1} required value={form.numberOfGuests} onChange={set("numberOfGuests")} /></div>
            <div>
              <L>Estimated Total</L>
              <div className="flex h-10 items-center rounded-md bg-gray-100 px-3 text-sm font-semibold">
                {estimate ? `${money(estimate.total)} (${nightsLabel(estimate.nights)})` : "—"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <L>Payment Method *</L>
              <select className={selectCls} value={form.paymentMethod} onChange={set("paymentMethod")} required>
                {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <L>Guarantee Type *</L>
              <select className={selectCls} value={form.guaranteeType} onChange={set("guaranteeType")} required>
                {GUARANTEE_TYPES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div>
            <L>Special Requests</L>
            <Textarea rows={3} value={form.specialRequests} onChange={set("specialRequests")} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" className="bg-gray-700 hover:bg-gray-800" onClick={() => navigate(`/reservations/${id}`)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? "Updating..." : "Update Reservation"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
