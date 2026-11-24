import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { money } from '@/lib/utils';
import { Field, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type AvailableRoom = {
  id: string;
  number: string;
  floor: number | null;
  type: string;
  capacity: number;
  nightlyRate: number;
};

type Guest = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  idType?: string | null;
  idNumber?: string | null;
  nationality?: string | null;
};

type GuestDetails = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  idType: string;
  idNumber: string;
  nationality: string;
};

type Group = {
  id: string;
  name: string;
};

const unwrap = (r: any) => r?.data ?? r;

const nightsBetween = (a: string, b: string) =>
  Math.max(
    1,
    Math.round(
      (new Date(`${b}T00:00:00`).getTime() -
        new Date(`${a}T00:00:00`).getTime()) /
        86_400_000,
    ),
  );

const emptyGuest: GuestDetails = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  address: '',
  idType: '',
  idNumber: '',
  nationality: '',
};

export default function NewReservation() {
  const navigate = useNavigate();

  const [guest, setGuest] = useState<GuestDetails>(emptyGuest);
  const [guestId, setGuestId] = useState('');
  const [guestSearch, setGuestSearch] = useState('');
  const [guestResults, setGuestResults] = useState<Guest[]>([]);
  const [searchingGuests, setSearchingGuests] = useState(false);

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState('');

  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [rooms, setRooms] = useState<AvailableRoom[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [numberOfGuests, setNumberOfGuests] = useState('1');

  const [deposit, setDeposit] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [guaranteeType, setGuaranteeType] = useState('Deposit');
  const [specialRequests, setSpecialRequests] = useState('');
  const [notes, setNotes] = useState('');

  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const datesValid = Boolean(arrival && departure && departure > arrival);
  const nights = datesValid ? nightsBetween(arrival, departure) : 0;

  const chosen = (rooms ?? []).filter((r) => selected.includes(r.id));
  const estimatedTotal = chosen.reduce(
    (sum, room) => sum + room.nightlyRate * nights,
    0,
  );

  const depositAmount = Number(deposit) || 0;

  const selectedGuest = guestResults.find((g) => g.id === guestId);

  // Load groups for the optional group association.
  useEffect(() => {
    let active = true;

    api
      .get('/groups')
      .then((response: any) => {
        if (active) setGroups(unwrap(response) ?? []);
      })
      .catch(() => {
        if (active) setGroups([]);
      });

    return () => {
      active = false;
    };
  }, []);

  // Search existing guests as the receptionist types.
  useEffect(() => {
    const query = guestSearch.trim();

    if (query.length < 2 || guestId) {
      setGuestResults([]);
      return;
    }

    let active = true;

    const timer = window.setTimeout(async () => {
      setSearchingGuests(true);

      try {
        const response = await api.get(
          `/guests/search?q=${encodeURIComponent(query)}`,
        );

        if (active) setGuestResults(unwrap(response) ?? []);
      } catch {
        if (active) setGuestResults([]);
      } finally {
        if (active) setSearchingGuests(false);
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [guestSearch, guestId]);

  const resetRooms = () => {
    setRooms(null);
    setSelected([]);
  };

  const checkAvailability = async () => {
    setError('');
    setChecking(true);
    setSelected([]);

    try {
      const response = await api.get(
        `/reservations/availability?arrival=${encodeURIComponent(arrival)}&departure=${encodeURIComponent(departure)}`,
      );

      setRooms(unwrap(response));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load available rooms');
    } finally {
      setChecking(false);
    }
  };

  const chooseGuest = (item: Guest) => {
    setGuestId(item.id);
    setGuestSearch(`${item.firstName} ${item.lastName} · ${item.phone}`);
    setGuestResults([]);
  };

  const clearGuestSelection = () => {
    setGuestId('');
    setGuestSearch('');
    setGuest(emptyGuest);
  };

  const updateGuest = (key: keyof GuestDetails, value: string) => {
    setGuest((current) => ({ ...current, [key]: value }));
  };

  const save = useAction(
    () =>
      api.post('/reservations/form', {
        ...(guestId ? { guestId } : { guest }),
        roomIds: selected,
        groupId: groupId || undefined,
        arrival,
        departure,
        numberOfGuests: Number(numberOfGuests),
        deposit: depositAmount,
        paymentMethod: paymentMethod || undefined,
        guaranteeType,
        specialRequests,
        notes,
      }),
    {
      success: 'Reservation saved',
      invalidate: ['/reservations', '/reservations/calendar'],
      onSuccess: () => navigate('/reservations'),
    },
  );

  const toggleRoom = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const guestValid = guestId
    ? true
    : Boolean(
        guest.firstName.trim() &&
          guest.lastName.trim() &&
          guest.phone.trim().length >= 5,
      );

  const canSave = Boolean(
    guestValid &&
      datesValid &&
      selected.length > 0 &&
      Number(numberOfGuests) >= 1 &&
      depositAmount >= 0 &&
      depositAmount <= estimatedTotal &&
      !save.isPending,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="New Reservation"
        subtitle="Create a reservation for an existing or new guest"
      >
        <Button variant="outline" asChild>
          <Link to="/reservations">Back to reservations</Link>
        </Button>
      </PageHeader>

      {/* Guest details */}
      <Card className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold">1. Guest information</h2>
          <p className="text-sm text-muted-foreground">
            Search for an existing guest or enter details for a new guest.
          </p>
        </div>

        <Field label="Search existing guest">
          <Input
            value={guestSearch}
            placeholder="Search by guest name or phone number"
            onChange={(e) => {
              setGuestSearch(e.target.value);
              if (guestId) setGuestId('');
            }}
          />
        </Field>

        {searchingGuests && (
          <p className="text-sm text-muted-foreground">Searching guests…</p>
        )}

        {guestResults.length > 0 && (
          <div className="max-h-56 overflow-y-auto rounded-lg border">
            {guestResults.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseGuest(item)}
                className="flex w-full flex-col border-b p-3 text-left last:border-b-0 hover:bg-muted"
              >
                <span className="font-medium">
                  {item.firstName} {item.lastName}
                </span>
                <span className="text-sm text-muted-foreground">
                  {item.phone} {item.email ? `· ${item.email}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}

        {guestId ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div>
              <div className="font-medium">
                {selectedGuest
                  ? `${selectedGuest.firstName} ${selectedGuest.lastName}`
                  : guestSearch}
              </div>
              <p className="text-sm text-muted-foreground">
                Existing guest selected. Their saved guest record will be used.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={clearGuestSelection}>
              Change guest
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="First name">
              <Input
                value={guest.firstName}
                onChange={(e) => updateGuest('firstName', e.target.value)}
              />
            </Field>

            <Field label="Last name">
              <Input
                value={guest.lastName}
                onChange={(e) => updateGuest('lastName', e.target.value)}
              />
            </Field>

            <Field label="Phone">
              <Input
                value={guest.phone}
                onChange={(e) => updateGuest('phone', e.target.value)}
              />
            </Field>

            <Field label="Email (optional)">
              <Input
                type="email"
                value={guest.email}
                onChange={(e) => updateGuest('email', e.target.value)}
              />
            </Field>

            <Field label="Address">
              <Input
                value={guest.address}
                onChange={(e) => updateGuest('address', e.target.value)}
              />
            </Field>

            <Field label="Nationality">
              <Input
                value={guest.nationality}
                onChange={(e) => updateGuest('nationality', e.target.value)}
              />
            </Field>

            <Field label="ID type">
              <select
                value={guest.idType}
                onChange={(e) => updateGuest('idType', e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select ID type</option>
                <option value="National ID">National ID</option>
                <option value="International Passport">International Passport</option>
                <option value="Driver's Licence">Driver's Licence</option>
                <option value="Voter's Card">Voter's Card</option>
                <option value="Other">Other</option>
              </select>
            </Field>

            <Field label="ID number">
              <Input
                value={guest.idNumber}
                onChange={(e) => updateGuest('idNumber', e.target.value)}
              />
            </Field>
          </div>
        )}
      </Card>

      {/* Reservation details */}
      <Card className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold">2. Reservation details</h2>
          <p className="text-sm text-muted-foreground">
            Select the dates and rooms required for this reservation.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Expected check-in">
            <Input
              type="date"
              value={arrival}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                setArrival(e.target.value);
                resetRooms();
              }}
            />
          </Field>

          <Field label="Expected check-out">
            <Input
              type="date"
              value={departure}
              min={arrival || undefined}
              onChange={(e) => {
                setDeparture(e.target.value);
                resetRooms();
              }}
            />
          </Field>

          <Field label="Group (optional)">
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Individual reservation</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={!datesValid || checking}
            onClick={checkAvailability}
          >
            {checking ? 'Checking availability…' : 'Check available rooms'}
          </Button>

          {datesValid && (
            <span className="text-sm text-muted-foreground">
              {nights} night{nights === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {rooms && rooms.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No rooms are available for those dates.
          </p>
        )}

        {rooms && rooms.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Available rooms</h3>
              <span className="text-sm text-muted-foreground">
                Select one or more rooms
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((room) => {
                const isSelected = selected.includes(room.id);

                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => toggleRoom(room.id)}
                    className={`rounded-lg border p-3 text-left text-sm transition ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                        : 'hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Room {room.number}</span>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        tabIndex={-1}
                      />
                    </div>
                    <div className="text-muted-foreground">
                      {room.type} · capacity {room.capacity}
                    </div>
                    <div className="mt-2 font-medium">
                      {money(room.nightlyRate)} / night
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Occupancy and payment */}
      <Card className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold">3. Occupancy and payment</h2>
          <p className="text-sm text-muted-foreground">
            Enter the occupancy and reservation payment arrangements.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label={selected.length > 1 ? 'Guests per room' : 'Number of guests'}
          >
            <Input
              type="number"
              min={1}
              value={numberOfGuests}
              onChange={(e) => setNumberOfGuests(e.target.value)}
            />
          </Field>

          <Field label="Payment method">
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select payment method</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="TRANSFER">Bank transfer</option>
            </select>
          </Field>

          <Field label="Guarantee type">
            <select
              value={guaranteeType}
              onChange={(e) => setGuaranteeType(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="Deposit">Deposit</option>
              <option value="Credit Card">Credit card guarantee</option>
              <option value="Company Account">Company account</option>
              <option value="Guarantee Letter">Guarantee letter</option>
              <option value="None">No guarantee</option>
            </select>
          </Field>

          <Field label="Deposit amount (optional)">
            <Input
              type="number"
              min={0}
              max={estimatedTotal}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </Field>
        </div>

        {selected.length > 0 && (
          <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
            <div className="flex justify-between">
              <span>Selected rooms</span>
              <span>{selected.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Duration</span>
              <span>
                {nights} night{nights === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Estimated total</span>
              <span>{money(estimatedTotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Deposit</span>
              <span>{money(depositAmount)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Estimated balance</span>
              <span>{money(Math.max(0, estimatedTotal - depositAmount))}</span>
            </div>
          </div>
        )}

        {depositAmount > estimatedTotal && (
          <p className="text-sm text-red-600">
            Deposit cannot exceed the estimated reservation total.
          </p>
        )}
      </Card>

      {/* Special requests */}
      <Card className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold">4. Special requests</h2>
          <p className="text-sm text-muted-foreground">
            Add guest preferences and internal reservation notes.
          </p>
        </div>

        <Field label="Special requests">
          <textarea
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            rows={3}
            placeholder="Room preferences, airport pickup, dietary requests…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Internal reservation notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Additional notes for hotel staff…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/reservations')}
          >
            Cancel
          </Button>

          <Button
            disabled={!canSave}
            onClick={() => save.mutate(undefined)}
          >
            {save.isPending ? 'Saving reservation…' : 'Save reservation'}
          </Button>
        </div>
      </Card>
    </div>
  );
}