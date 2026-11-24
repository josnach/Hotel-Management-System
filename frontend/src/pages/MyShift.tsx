
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Clock3, MapPin, CalendarDays, LogIn, LogOut, RefreshCw } from 'lucide-react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type WorkLocation = {
  id?: string;
  name?: string;
  type?: string;
};

type WorkSchedule = {
  id?: string;
  startTime?: string;
  endTime?: string;
  graceMinutes?: number;
  workLocation?: WorkLocation | null;
  workLocationId?: string;
};

type CurrentShift = {
  id: string;
  startedAt: string;
  scheduledEndAt: string;
  graceEndsAt: string;
  status: string;
  workLocation?: WorkLocation | null;
};

type TodayShift = {
  isDayOff?: boolean;
  schedule?: WorkSchedule | null;
};

type MyShiftResponse = {
  today?: TodayShift;
  currentShift?: CurrentShift | null;
  canClockIn?: boolean;
};

function formatDateTime(value?: string | null): string {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function MyShift() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [clockOutNote, setClockOutNote] = useState('');

  const shiftQuery = useQuery({
    queryKey: ['my-work-shift'],
    queryFn: () => api.get('/work-shifts/me') as Promise<MyShiftResponse>,
    refetchInterval: 60_000,
  });

 const clockInMutation = useMutation({
  mutationFn: () => api.post('/work-shifts/clock-in', {}),
  onSuccess: async () => {
    await queryClient.invalidateQueries({
      queryKey: ['my-work-shift'],
    });

    await queryClient.invalidateQueries({
      queryKey: ['dashboard-work-shift-check'],
    });

    navigate('/', { replace: true });
  },
});

  const clockOutMutation = useMutation({
    mutationFn: () =>
      api.post('/work-shifts/clock-out', {
        note: clockOutNote.trim() || undefined,
      }),
    onSuccess: async () => {
      setClockOutNote('');
      await queryClient.invalidateQueries({ queryKey: ['my-work-shift'] });
      await queryClient.invalidateQueries();
    },
  });

  const data = shiftQuery.data;
  const schedule = data?.today?.schedule;
  const shift = data?.currentShift;
  const isActive = Boolean(shift);
  const isBusy = clockInMutation.isPending || clockOutMutation.isPending;

  const locationName =
    shift?.workLocation?.name ??
    schedule?.workLocation?.name ??
    'No work location assigned';

  const mutationError =
    clockInMutation.error ?? clockOutMutation.error;

  const errorMessage =
    mutationError instanceof Error
      ? mutationError.message
      : mutationError
        ? 'The shift action failed. Please try again.'
        : '';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Staff attendance</p>
        <h1 className="text-2xl font-bold">My Shift</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome, {user?.fullName ?? user?.username}. View your schedule and
          manage your work shift here.
        </p>
      </div>

      {shiftQuery.isLoading && (
        <div className="rounded-xl border bg-card p-6 text-sm">
          Loading your shift details…
        </div>
      )}

      {shiftQuery.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Unable to load your shift details.
          <button
            type="button"
            className="ml-3 inline-flex items-center gap-2 font-semibold underline"
            onClick={() => shiftQuery.refetch()}
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-blue-700" />
                  <h2 className="text-lg font-semibold">Shift status</h2>
                </div>

                <p className="mt-2 text-sm text-muted-foreground">
                  {isActive
                    ? 'You are currently clocked in.'
                    : 'You are not currently clocked in.'}
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  isActive
                    ? 'bg-green-100 text-green-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {isActive ? 'ACTIVE' : 'NOT CLOCKED IN'}
              </span>
            </div>

            {isActive && shift && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Clock-in time</p>
                  <p className="mt-1 font-medium">
                    {formatDateTime(shift.startedAt)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">
                    Scheduled end
                  </p>
                  <p className="mt-1 font-medium">
                    {formatDateTime(shift.scheduledEndAt)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">
                    Grace deadline
                  </p>
                  <p className="mt-1 font-medium">
                    {formatDateTime(shift.graceEndsAt)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Work location</p>
                  <p className="mt-1 font-medium">{locationName}</p>
                </div>
              </div>
            )}

            {!isActive && (
              <div className="mt-5">
                {data.today?.isDayOff ? (
                  <p className="rounded-lg bg-muted p-4 text-sm">
                    You are not scheduled to work today. Contact your manager
                    if your schedule needs to be updated.
                  </p>
                ) : schedule ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Scheduled start
                      </p>
                      <p className="mt-1 font-medium">
                        {schedule.startTime ?? '—'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Scheduled end
                      </p>
                      <p className="mt-1 font-medium">
                        {schedule.endTime ?? '—'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Grace period
                      </p>
                      <p className="mt-1 font-medium">
                        {schedule.graceMinutes ?? 30} minutes
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Work location
                      </p>
                      <p className="mt-1 flex items-center gap-2 font-medium">
                        <MapPin className="h-4 w-4" />
                        {locationName}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg bg-muted p-4 text-sm">
                    No active schedule was found for today. Please contact your
                    manager or administrator.
                  </p>
                )}
              </div>
            )}

            {errorMessage && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {errorMessage}
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {!isActive && schedule && !data.today?.isDayOff && (
                <button
                  type="button"
                  disabled={isBusy || !data.canClockIn}
                  onClick={() => clockInMutation.mutate()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" />
                  {clockInMutation.isPending ? 'Clocking in…' : 'Clock In'}
                </button>
              )}

              {isActive && (
                <div className="w-full space-y-3">
                  <label className="block text-sm font-medium">
                    Clock-out note (optional)
                    <textarea
                      value={clockOutNote}
                      onChange={(event) => setClockOutNote(event.target.value)}
                      maxLength={500}
                      rows={2}
                      placeholder="Add a note for your manager"
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => clockOutMutation.mutate()}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <LogOut className="h-4 w-4" />
                    {clockOutMutation.isPending ? 'Clocking out…' : 'Clock Out'}
                  </button>
                </div>
              )}

              {isActive && (
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
                >
                  Continue to dashboard
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold">Attendance reminder</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Your work shift is separate from the cash drawer shift. Clocking
              in here does not open a cash drawer.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
