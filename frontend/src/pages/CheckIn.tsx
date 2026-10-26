import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  LogOut,
  UserPlus,
} from 'lucide-react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { money } from '@/lib/utils';

import {
  Field,
  PageHeader,
} from '@/components/common';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Input,
  NativeSelect,
  Textarea,
} from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

function calendarNights(from: Date, to: Date): number {
  const start = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
  );

  const end = new Date(
    to.getFullYear(),
    to.getMonth(),
    to.getDate(),
  );

  const startDay = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );

  const endDay = Date.UTC(
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
  );

  return Math.max(1, (endDay - startDay) / 86_400_000);
}

type Guest = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  isVip?: boolean;
  vipNote?: string | null;
  isBlacklisted?: boolean;
  blacklistReason?: string | null;
  preferences?: string | null;
};

type Room = {
  id: string;
  number: string;
  rateOverride?: number | string | null;
  roomType: {
    name: string;
    nightlyRate: number | string;
  };
};

type Reservation = {
  id: string;
  guestId: string;
  roomId: string;
  status: string;
  arrival: string | Date;
  departure: string | Date;
  guest: Guest;
  room: Room;
};

type Group = {
  id: string;
  name: string;
};

type Policy = {
  maxDiscountPercent: number;
};

type CheckInResponse = {
  folio: {
    id: string;
  };
};

type CheckInForm = {
  roomId: string;
  groupId: string;
  numGuests: number;
  expectedDeparture: string;
  discountType: 'NONE' | 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  discountReason: string;
  isComplimentary: boolean;
  complimentaryReason: string;
  applyVat: boolean;
  applyServiceCharge: boolean;
  advancePayment: number;
  paymentMethod: 'CASH' | 'CARD' | 'TRANSFER';
  specialRequests: string;
};

const ID_TYPES = [
  "Driver's License",
  'National ID',
  'International Passport',
  "Voter's Card",
];

const DISCOUNT_REASONS = [
  'Loyalty',
  'Corporate rate',
  'Management approval',
  'Long stay',
  'Promotion',
];


/**
 * Formats a Date as a browser-local datetime-local value.
 * Avoids converting the local input minimum to UTC.
 */
const toLocalDateTimeInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function startOfDay(value: string | Date): number {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return NaN;
  }

  date.setHours(0, 0, 0, 0);

  return date.getTime();
}

export function CheckInLanding() {
  const tiles = [
    {
      to: '/in-house',
      icon: CheckCircle2,
      title: 'Checked-in Guests',
      sub: 'View currently staying guests',
      color: 'text-green-600',
    },
    {
      to: '/guests?status=CHECKED_OUT',
      icon: LogOut,
      title: 'Checked-out Guests',
      sub: 'View departed guests history',
      color: 'text-purple-600',
    },
    {
      to: '/check-in/new',
      icon: UserPlus,
      title: 'New Check-in',
      sub: 'Register new guests and assign rooms',
      color: 'text-blue-600',
    },
  ];

  return (
    <div className="mx-auto max-w-3xl py-12 text-center">
      <h1 className="text-3xl font-bold">
        Hotel Management System
      </h1>

      <p className="mt-2 text-muted-foreground">
        Manage guest check-ins, check-outs, and hotel operations
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;

          return (
            <Link key={tile.to} to={tile.to}>
              <Card className="p-6 transition hover:shadow-md">
                <Icon
                  className={`mx-auto h-8 w-8 ${tile.color}`}
                />

                <div className="mt-3 font-semibold">
                  {tile.title}
                </div>

                <div className="mt-1 text-xs text-muted-foreground">
                  {tile.sub}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function CheckIn() {
  const nav = useNavigate();
  const { user } = useAuth();

  const canApprove =
    user?.role === 'ADMIN' ||
    user?.role === 'MANAGER';

  const { data: rooms } = useGet<Room[]>(
    '/rooms',
    { status: 'AVAILABLE' },
  );

  const { data: groups } = useGet<Group[]>('/groups');

  const { data: reservations } =
    useGet<Reservation[]>('/reservations');

  const { data: policy } =
    useGet<Policy>('/policy');

  const [reservationId, setReservationId] = useState('');
  const [q, setQ] = useState('');
  const [guestId, setGuestId] = useState('');
  const [picked, setPicked] = useState<Guest | null>(null);
  const [optIn, setOptIn] = useState(false);

  const [g, setG] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    idType: '',
    idNumber: '',
  });

  const [f, setF] = useState<CheckInForm>({
    roomId: '',
    groupId: '',
    numGuests: 1,
    expectedDeparture: '',
    discountType: 'NONE',
    discountValue: 0,
    discountReason: '',
    isComplimentary: false,
    complimentaryReason: '',
    applyVat: false,
    applyServiceCharge: false,
    advancePayment: 0,
    paymentMethod: 'CASH',
    specialRequests: '',
  });

  const set = <K extends keyof CheckInForm>(
    key: K,
    value: CheckInForm[K],
  ) => {
    setF((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const { data: found } = useGet<Guest[]>(
    '/guests/search',
    { q },
    q.trim().length > 1 && !guestId,
  );

  const selectedReservation = reservations?.find(
    (reservation) => reservation.id === reservationId,
  );

  const today = startOfDay(new Date());

  const eligibleReservations = useMemo(() => {
    return (reservations ?? []).filter((reservation) => {
      const arrival = startOfDay(reservation.arrival);
      const departure = startOfDay(reservation.departure);

      return (
        ['PENDING', 'CONFIRMED'].includes(reservation.status) &&
        Number.isFinite(arrival) &&
        Number.isFinite(departure) &&
        arrival <= today &&
        departure > today
      );
    });
  }, [reservations, today]);

  const room =
    rooms?.find((item) => item.id === f.roomId) ??
    selectedReservation?.room;

  const price = useMemo(() => {
    const rate = Math.max(
      0,
      Number(
        room?.rateOverride ??
        room?.roomType?.nightlyRate ??
        0,
      ) || 0,
    );

  const departureDate = f.expectedDeparture
  ? new Date(f.expectedDeparture)
  : null;

const nights =
  departureDate && Number.isFinite(departureDate.getTime())
    ? calendarNights(new Date(), departureDate)
    : 1;

    const gross = rate * nights;

    const requestedDiscount =
      f.discountType === 'PERCENTAGE'
        ? (gross * f.discountValue) / 100
        : f.discountType === 'FIXED'
          ? f.discountValue
          : 0;

    const discount = Math.min(
      gross,
      Math.max(0, Number(requestedDiscount) || 0),
    );

    const net = f.isComplimentary
      ? 0
      : Math.max(0, gross - discount);

    const service = f.applyServiceCharge
      ? net * 0.1
      : 0;

    const vat = f.applyVat
      ? net * 0.075
      : 0;

    return {
      rate,
      nights,
      gross,
      disc: discount,
      net,
      service,
      vat,
      total: net + service + vat,
    };
  }, [
    room,
    f.expectedDeparture,
    f.discountType,
    f.discountValue,
    f.isComplimentary,
    f.applyVat,
    f.applyServiceCharge,
  ]);

  const submit = useAction(
    () =>
      api.post<CheckInResponse>('/stays/check-in', {
        ...(reservationId ? { reservationId } : {}),

        ...(guestId
          ? { guestId }
          : {
              guest: {
                ...Object.fromEntries(
                  Object.entries(g).filter(
                    ([, value]) => value.trim() !== '',
                  ),
                ),
                whatsappOptIn: optIn,
              },
            }),

        roomId: f.roomId,
        groupId: f.groupId || undefined,
        numGuests: Number(f.numGuests),
        expectedDeparture: new Date(
          f.expectedDeparture,
        ).toISOString(),

        discountType: f.discountType,
        discountValue: Number(f.discountValue),
        discountReason:
          f.discountReason || undefined,

        isComplimentary: f.isComplimentary,
        complimentaryReason:
          f.complimentaryReason || undefined,

        applyVat: f.applyVat,
        applyServiceCharge: f.applyServiceCharge,

        advancePayment: Number(f.advancePayment),
        paymentMethod:
          Number(f.advancePayment) > 0
            ? f.paymentMethod
            : undefined,

        specialRequests:
          f.specialRequests.trim() || undefined,
      }),
    {
      success: 'Guest checked in',
      invalidate: [
        '/rooms',
        '/stays/in-house',
        '/guests',
      ],
      onSuccess: (response) => {
        nav(`/folios/${response.folio.id}`);
      },
    },
  );

  const handleReservationChange = (id: string) => {
    setReservationId(id);

    if (!id) {
      setGuestId('');
      setPicked(null);
      setQ('');

      setF((previous) => ({
        ...previous,
        roomId: '',
      }));

      return;
    }

    const reservation = reservations?.find(
      (item) => item.id === id,
    );

    if (!reservation) {
      return;
    }

    setGuestId(reservation.guestId);
    setPicked(reservation.guest);

    setQ(
      `${reservation.guest.firstName} ${reservation.guest.lastName}`,
    );

    setF((previous) => ({
      ...previous,
      roomId: reservation.roomId,
      expectedDeparture: previous.expectedDeparture ||
        (() => {
          const departure = new Date(
            reservation.departure,
          );

          const pad = (value: number) =>
            String(value).padStart(2, '0');

          return (
            `${departure.getFullYear()}-` +
            `${pad(departure.getMonth() + 1)}-` +
            `${pad(departure.getDate())}T` +
            `${pad(departure.getHours())}:` +
            `${pad(departure.getMinutes())}`
          );
        })(),
    }));
  };

  const handleSubmit = () => {
    if (!f.roomId) {
      return;
    }

    if (
      !f.expectedDeparture ||
      !Number.isFinite(
        new Date(f.expectedDeparture).getTime(),
      ) ||
      new Date(f.expectedDeparture).getTime() <= Date.now()
    ) {
      return;
    }

    if (
      !guestId &&
      (
        !g.firstName.trim() ||
        !g.lastName.trim() ||
        !g.phone.trim()
      )
    ) {
      return;
    }

    if (
      picked?.isBlacklisted ||
      (f.isComplimentary && !f.complimentaryReason.trim()) ||
      (
        f.discountType !== 'NONE' &&
        !f.discountReason.trim()
      ) ||
      !Number.isInteger(Number(f.numGuests)) ||
      Number(f.numGuests) < 1 ||
      !Number.isFinite(Number(f.advancePayment)) ||
      Number(f.advancePayment) < 0
    ) {
      return;
    }

    submit.mutate(undefined);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Guest Check-in" />

      <Card className="space-y-5 p-6">
        <Field label="Check in from an existing reservation (Optional)">
          <NativeSelect
            value={reservationId}
            onChange={(event) =>
              handleReservationChange(event.target.value)
            }
          >
            <option value="">
              Walk-in / no reservation
            </option>

            {eligibleReservations.map((reservation) => (
              <option
                key={reservation.id}
                value={reservation.id}
              >
                {reservation.guest.firstName}{' '}
                {reservation.guest.lastName}
                {' — Room '}
                {reservation.room.number}
                {' — '}
                {new Date(
                  reservation.arrival,
                ).toLocaleDateString()}
                {' to '}
                {new Date(
                  reservation.departure,
                ).toLocaleDateString()}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Select existing guest">
          <Input
            placeholder="Type to search existing guests…"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setGuestId('');
              setPicked(null);
              setReservationId('');
            }}
          />
        </Field>

        {!!found?.length && !guestId && (
          <div className="rounded border">
            {found.map((guest) => (
              <button
                key={guest.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  setGuestId(guest.id);
                  setPicked(guest);
                  setQ(
                    `${guest.firstName} ${guest.lastName}`,
                  );
                }}
              >
                {guest.firstName} {guest.lastName}
                {' · '}
                {guest.phone}
                {guest.isVip ? ' · VIP' : ''}
                {guest.isBlacklisted
                  ? ' · BLACKLISTED'
                  : ''}
              </button>
            ))}
          </div>
        )}

        {picked && (
          picked.isBlacklisted ||
          picked.isVip ||
          picked.preferences
        ) && (
          <div
            className={`rounded-md border p-3 text-sm ${
              picked.isBlacklisted
                ? 'border-red-300 bg-red-50 text-red-800'
                : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}
          >
            {picked.isBlacklisted && (
              <div>
                <b>Blacklisted:</b>{' '}
                {picked.blacklistReason ||
                  'No reason provided.'}
                {' '}Check-in is blocked until an authorized
                manager removes the blacklist.
              </div>
            )}

            {picked.isVip && (
              <div>
                <b>VIP guest</b>
                {picked.vipNote
                  ? `: ${picked.vipNote}`
                  : ''}
              </div>
            )}

            {picked.preferences && (
              <div>
                <b>Preferences:</b>{' '}
                {picked.preferences}
              </div>
            )}
          </div>
        )}

        {!guestId && (
          <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
            <div className="text-sm font-semibold">
              Register New Guest
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name *">
                <Input
                  value={g.firstName}
                  onChange={(event) =>
                    setG({
                      ...g,
                      firstName: event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Last Name *">
                <Input
                  value={g.lastName}
                  onChange={(event) =>
                    setG({
                      ...g,
                      lastName: event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Phone *">
                <Input
                  value={g.phone}
                  onChange={(event) =>
                    setG({
                      ...g,
                      phone: event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Email">
                <Input
                  type="email"
                  value={g.email}
                  onChange={(event) =>
                    setG({
                      ...g,
                      email: event.target.value,
                    })
                  }
                />
              </Field>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={optIn}
                onChange={(event) =>
                  setOptIn(event.target.checked)
                }
              />

              <span>
                Guest agrees to receive WhatsApp messages
                about this stay (booking, receipt, checkout
                reminder). Tick only if the guest has said yes.
              </span>
            </label>

            <Field label="Address">
              <Input
                value={g.address}
                onChange={(event) =>
                  setG({
                    ...g,
                    address: event.target.value,
                  })
                }
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="ID Type">
                <NativeSelect
                  value={g.idType}
                  onChange={(event) =>
                    setG({
                      ...g,
                      idType: event.target.value,
                    })
                  }
                >
                  <option value="">Select ID Type</option>

                  {ID_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <Field label="ID Number">
                <Input
                  value={g.idNumber}
                  onChange={(event) =>
                    setG({
                      ...g,
                      idNumber: event.target.value,
                    })
                  }
                />
              </Field>
            </div>
          </div>
        )}

        <Field label="Select Room *">
          <NativeSelect
            value={f.roomId}
            onChange={(event) =>
              set('roomId', event.target.value)
            }
          >
            <option value="">Choose a room</option>

            {selectedReservation &&
              !rooms?.some(
                (item) =>
                  item.id === selectedReservation.roomId,
              ) && (
                <option
                  value={selectedReservation.roomId}
                >
                  {selectedReservation.room.number}
                  {' — Reserved room'}
                </option>
              )}

            {rooms?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.number}
                {' — '}
                {item.roomType.name}
                {' ('}
                {money(
                  item.rateOverride ??
                  item.roomType.nightlyRate,
                )}
                {')'}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {canApprove && (
          <div className="space-y-3 rounded-lg border border-purple-100 bg-purple-50/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-purple-700">
                Complimentary Stay
              </span>

              <span className="flex items-center gap-2 text-xs">
                {f.isComplimentary
                  ? 'Enabled'
                  : 'Disabled'}

                <Switch
                  checked={f.isComplimentary}
                  onCheckedChange={(value) =>
                    set('isComplimentary', value)
                  }
                />
              </span>
            </div>

            {f.isComplimentary && (
              <Field label="Reason *">
                <Input
                  value={f.complimentaryReason}
                  onChange={(event) =>
                    set(
                      'complimentaryReason',
                      event.target.value,
                    )
                  }
                />
              </Field>
            )}
          </div>
        )}

        <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
          <div className="text-sm font-semibold text-blue-700">
            Room Rate Summary
          </div>

          <div className="grid grid-cols-3 text-center">
            <div>
              <div className="text-xs text-muted-foreground">
                Room Rate
              </div>
              <div className="font-bold text-blue-700">
                {money(price.gross)}
              </div>
              <div className="text-xs text-muted-foreground">
                {price.nights} night(s)
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">
                Discount
              </div>
              <div className="font-bold text-green-600">
                {money(price.disc)}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">
                Net Amount
              </div>
              <div className="font-bold text-purple-700">
                {money(price.net)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount Type">
              <NativeSelect
                value={f.discountType}
                onChange={(event) =>
                  set(
                    'discountType',
                    event.target.value as CheckInForm['discountType'],
                  )
                }
              >
                <option value="NONE">No Discount</option>
                <option value="PERCENTAGE">
                  Percentage (%)
                </option>
                <option value="FIXED">
                  Fixed amount (₦)
                </option>
              </NativeSelect>
            </Field>

            <Field label="Discount Value">
              <Input
                type="number"
                min="0"
                max={
                  f.discountType === 'PERCENTAGE'
                    ? 100
                    : undefined
                }
                value={f.discountValue}
                onChange={(event) =>
                  set(
                    'discountValue',
                    Number(event.target.value),
                  )
                }
                disabled={f.discountType === 'NONE'}
              />
            </Field>
          </div>

          {f.discountType !== 'NONE' && (
            <Field
              label="Discount Reason *"
              hint={
                canApprove
                  ? 'A reason is required when applying a discount.'
                  : `Discounts above ${
                      policy?.maxDiscountPercent ?? 10
                    }% may require manager approval.`
              }
            >
              <NativeSelect
                value={f.discountReason}
                onChange={(event) =>
                  set('discountReason', event.target.value)
                }
              >
                <option value="">Select Reason</option>

                {DISCOUNT_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-2 text-sm font-semibold">
            Additional Charges
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center justify-between gap-2 rounded border bg-slate-50 p-3 text-sm">
              <span>
                VAT (7.5%)
                <br />
                <span className="text-xs text-muted-foreground">
                  {money(price.vat)}
                </span>
              </span>

              <Switch
                checked={f.applyVat}
                onCheckedChange={(value) =>
                  set('applyVat', value)
                }
              />
            </label>

            <label className="flex items-center justify-between gap-2 rounded border bg-slate-50 p-3 text-sm">
              <span>
                Service Charge (10%)
                <br />
                <span className="text-xs text-muted-foreground">
                  {money(price.service)}
                </span>
              </span>

              <Switch
                checked={f.applyServiceCharge}
                onCheckedChange={(value) =>
                  set('applyServiceCharge', value)
                }
              />
            </label>
          </div>

          <div className="mt-3 flex justify-between border-t pt-3 text-sm font-semibold">
            <span>Estimated Total</span>
            <span>{money(price.total)}</span>
          </div>
        </div>

        <Field label="Assign to Group (Optional)">
          <NativeSelect
            value={f.groupId}
            onChange={(event) =>
              set('groupId', event.target.value)
            }
          >
            <option value="">No Group</option>

            {groups?.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Number of Guests">
            <Input
              type="number"
              min="1"
              step="1"
              value={f.numGuests}
              onChange={(event) =>
                set(
                  'numGuests',
                  Number(event.target.value),
                )
              }
            />
          </Field>

          <Field
            label="Departure Date *"
            hint="Select the expected departure date and time."
          >
            <Input
              type="datetime-local"
              min={toLocalDateTimeInput(new Date())}
              value={f.expectedDeparture}
              onChange={(event) =>
                set(
                  'expectedDeparture',
                  event.target.value,
                )
              }
            />
          </Field>

          <Field label="Advance Payment (₦)">
            <Input
              type="number"
              min="0"
              value={f.advancePayment}
              onChange={(event) =>
                set(
                  'advancePayment',
                  Number(event.target.value),
                )
              }
            />
          </Field>

          <Field label="Payment Method">
            <NativeSelect
              value={f.paymentMethod}
              onChange={(event) =>
                set(
                  'paymentMethod',
                  event.target.value as CheckInForm['paymentMethod'],
                )
              }
            >
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="TRANSFER">Transfer</option>
            </NativeSelect>
          </Field>
        </div>

        <Field label="Special Requests">
          <Textarea
            value={f.specialRequests}
            onChange={(event) =>
              set(
                'specialRequests',
                event.target.value,
              )
            }
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => nav('/check-in')}
          >
            Cancel
          </Button>

          <Button
            onClick={handleSubmit}
            disabled={
              submit.isPending ||
              !f.roomId ||
              !f.expectedDeparture ||
              (
                !guestId &&
                (
                  !g.firstName.trim() ||
                  !g.lastName.trim() ||
                  !g.phone.trim()
                )
              ) ||
              !!picked?.isBlacklisted
            }
          >
            {submit.isPending
              ? 'Checking in…'
              : 'Check in guest'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
