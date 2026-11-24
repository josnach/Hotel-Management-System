
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Clock3,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
} from 'lucide-react';

import { api } from '@/lib/api';

type Weekday =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

type LocationType = 'SALES_POINT' | 'RECEPTION_DESK';

type Staff = {
  id: string;
  username: string;
  fullName: string | null;
  role: 'RECEPTIONIST' | 'WAITER';
  workShiftSchedules: Schedule[];
};

type WorkLocation = {
  id: string;
  name: string;
  type: LocationType;
  salesPointId: string | null;
  isActive: boolean;
  salesPoint?: { id: string; name: string } | null;
};

type SalesPoint = {
  id: string;
  name: string;
  isActive: boolean;
};

type Schedule = {
  id: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  workLocationId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  workLocation?: WorkLocation;
};

type Override = {
  id: string;
  date: string;
  isDayOff: boolean;
  startTime: string | null;
  endTime: string | null;
  graceMinutes: number | null;
  workLocationId: string | null;
  note: string | null;
  workLocation?: WorkLocation | null;
};

type ShiftHistory = {
  id: string;
  startedAt: string;
  closedAt: string | null;
  status: string;
  workLocation?: WorkLocation | null;
};

type StaffDetail = {
  user: Staff;
  schedules: Schedule[];
  overrides: Override[];
  shifts: ShiftHistory[];
};

type LocationResponse = {
  locations: WorkLocation[];
  salesPoints: SalesPoint[];
};

const weekdays: { value: Weekday; label: string }[] = [
  { value: 'MONDAY', label: 'Monday' },
  { value: 'TUESDAY', label: 'Tuesday' },
  { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'THURSDAY', label: 'Thursday' },
  { value: 'FRIDAY', label: 'Friday' },
  { value: 'SATURDAY', label: 'Saturday' },
  { value: 'SUNDAY', label: 'Sunday' },
];

const emptySchedule = {
  weekday: 'MONDAY' as Weekday,
  startTime: '08:00',
  endTime: '17:00',
  graceMinutes: 30,
  workLocationId: '',
};

const emptyOverride = {
  date: new Date().toLocaleDateString('en-CA'),
  isDayOff: false,
  startTime: '08:00',
  endTime: '17:00',
  graceMinutes: 30,
  workLocationId: '',
  note: '',
};

function errorMessage(error: any): string {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    'The operation could not be completed.'
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';

export default function WorkSchedules() {
  const queryClient = useQueryClient();

  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [tab, setTab] = useState<'schedules' | 'overrides' | 'locations'>(
    'schedules',
  );

  const [scheduleForm, setScheduleForm] = useState(emptySchedule);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(
    null,
  );

  const [overrideForm, setOverrideForm] = useState(emptyOverride);

  const [locationForm, setLocationForm] = useState({
    name: '',
    type: 'RECEPTION_DESK' as LocationType,
    salesPointId: '',
  });

  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null,
  );

 const staffQuery = useQuery({
  queryKey: ['work-schedules-staff'],
  queryFn: () => api.get<Staff[]>('/work-schedules/staff'),
});

const locationsQuery = useQuery({
  queryKey: ['work-schedule-locations'],
  queryFn: () => api.get<LocationResponse>('/work-schedules/locations'),
});

const detailQuery = useQuery({
  queryKey: ['work-schedule-staff-detail', selectedStaffId],
  enabled: Boolean(selectedStaffId),
  queryFn: () =>
    api.get<StaffDetail>(`/work-schedules/staff/${selectedStaffId}`),
});

  const staff = staffQuery.data ?? [];
  const locations = locationsQuery.data?.locations ?? [];
  const salesPoints = locationsQuery.data?.salesPoints ?? [];
  const activeLocations = locations.filter((location) => location.isActive);

  const selectedStaff = detailQuery.data?.user;
  const schedules = detailQuery.data?.schedules ?? [];
  const overrides = detailQuery.data?.overrides ?? [];
  const shifts = detailQuery.data?.shifts ?? [];

  const activeSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.isActive),
    [schedules],
  );

  useEffect(() => {
    if (!selectedStaffId && staff.length > 0) {
      setSelectedStaffId(staff[0].id);
    }
  }, [staff, selectedStaffId]);

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ['work-schedules-staff'] });
    queryClient.invalidateQueries({
      queryKey: ['work-schedule-locations'],
    });

    if (selectedStaffId) {
      queryClient.invalidateQueries({
        queryKey: ['work-schedule-staff-detail', selectedStaffId],
      });
    }
  }

  function notifyError(error: unknown) {
    window.alert(errorMessage(error));
  }

    const createSchedule = useMutation({
    mutationFn: async () => {
      if (!selectedStaffId) {
        throw new Error('Select a staff member first.');
      }

      const payload = {
        ...scheduleForm,
        graceMinutes: Number(scheduleForm.graceMinutes),
      };

      if (editingScheduleId) {
        return api.put(
          `/work-schedules/schedules/${editingScheduleId}`,
          payload,
        );
      }

      return api.post(
        `/work-schedules/staff/${selectedStaffId}/schedules`,
        payload,
      );
    },
    onSuccess: () => {
      setScheduleForm(emptySchedule);
      setEditingScheduleId(null);
      refreshAll();
      window.alert('Staff schedule saved successfully.');
    },
    onError: notifyError,
  });

    const deactivateSchedule = useMutation({
    mutationFn: async (id: string) => {
      return api.del(`/work-schedules/schedules/${id}`);
    },
    onSuccess: () => {
      refreshAll();
      window.alert('Staff schedule deactivated successfully.');
    },
    onError: notifyError,
  });
   const saveOverride = useMutation({
    mutationFn: async () => {
      if (!selectedStaffId) {
        throw new Error('Select a staff member first.');
      }

      const payload = {
        ...overrideForm,
        graceMinutes: overrideForm.isDayOff
          ? null
          : Number(overrideForm.graceMinutes),
        startTime: overrideForm.isDayOff ? null : overrideForm.startTime,
        endTime: overrideForm.isDayOff ? null : overrideForm.endTime,
        workLocationId: overrideForm.isDayOff
          ? null
          : overrideForm.workLocationId || null,
        note: overrideForm.note.trim() || null,
      };

      return api.put(
        `/work-schedules/staff/${selectedStaffId}/overrides`,
        payload,
      );
    },
    onSuccess: () => {
      setOverrideForm(emptyOverride);
      refreshAll();
      window.alert('Date override saved successfully.');
    },
    onError: notifyError,
  });
  const deleteOverride = useMutation({
    mutationFn: async (id: string) => {
      if (!selectedStaffId) return;

 await api.del(
  `/work-schedules/staff/${selectedStaffId}/overrides/${id}`,
);
    },
    onSuccess: refreshAll,
    onError: notifyError,
  });

  const saveLocation = useMutation({
    mutationFn: async () => {
      const name = locationForm.name.trim();

      if (!name) throw new Error('Enter a location name.');

      if (
        locationForm.type === 'SALES_POINT' &&
        !locationForm.salesPointId
      ) {
        throw new Error('Select an existing SalesPoint.');
      }

      if (editingLocationId) {
        const response = await api.put(
          `/work-schedules/locations/${editingLocationId}`,
          { name },
        );

        return response.data;
      }

      const response = await api.post('/work-schedules/locations', {
        name,
        type: locationForm.type,
        salesPointId:
          locationForm.type === 'SALES_POINT'
            ? locationForm.salesPointId
            : null,
      });

      return response.data;
    },
    onSuccess: () => {
      setLocationForm({
        name: '',
        type: 'RECEPTION_DESK',
        salesPointId: '',
      });
      setEditingLocationId(null);
      refreshAll();
      window.alert('Work location saved successfully.');
    },
    onError: notifyError,
  });

  const toggleLocation = useMutation({
    mutationFn: async (location: WorkLocation) => {
      await api.put(`/work-schedules/locations/${location.id}`, {
        isActive: !location.isActive,
      });
    },
    onSuccess: refreshAll,
    onError: notifyError,
  });

  function editSchedule(schedule: Schedule) {
    setEditingScheduleId(schedule.id);
    setScheduleForm({
      weekday: schedule.weekday,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      graceMinutes: schedule.graceMinutes,
      workLocationId: schedule.workLocationId,
    });
    setTab('schedules');
  }

  function editLocation(location: WorkLocation) {
    setEditingLocationId(location.id);
    setLocationForm({
      name: location.name,
      type: location.type,
      salesPointId: location.salesPointId ?? '',
    });
  }

  const isSaving =
    createSchedule.isPending ||
    saveOverride.isPending ||
    saveLocation.isPending;

  if (staffQuery.isLoading || locationsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-slate-600">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading staff schedules and work locations...
      </div>
    );
  }

  if (staffQuery.isError || locationsQuery.isError) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
        <p className="font-semibold">Unable to load work schedule management.</p>
        <p className="mt-1 text-sm">
          {errorMessage(staffQuery.error || locationsQuery.error)}
        </p>
        <button
          className={`${buttonClass} mt-4 bg-red-700 text-white`}
          onClick={() => {
            staffQuery.refetch();
            locationsQuery.refetch();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <CalendarDays className="h-4 w-4" />
            Staff Management / Attendance
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Work Schedule Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Assign individual shifts, work locations and date-specific rota
            changes to receptionists and waiters.
          </p>
        </div>

        <button
          className={`${buttonClass} border border-slate-300 bg-white text-slate-700`}
          onClick={refreshAll}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <Users className="h-5 w-5 text-blue-600" />
          <p className="mt-3 text-2xl font-bold">{staff.length}</p>
          <p className="text-sm text-slate-500">Eligible active staff</p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <Clock3 className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-2xl font-bold">{activeSchedules.length}</p>
          <p className="text-sm text-slate-500">
            Active schedules for selected staff
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <MapPin className="h-5 w-5 text-violet-600" />
          <p className="mt-3 text-2xl font-bold">
            {activeLocations.length}
          </p>
          <p className="text-sm text-slate-500">Active work locations</p>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <Field label="Select employee">
          <select
            className={inputClass}
            value={selectedStaffId}
            onChange={(event) => {
              setSelectedStaffId(event.target.value);
              setEditingScheduleId(null);
              setScheduleForm(emptySchedule);
            }}
          >
            <option value="">Select receptionist or waiter</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName || person.username} — {person.role}
              </option>
            ))}
          </select>
        </Field>

        {staff.length === 0 && (
          <p className="mt-3 text-sm text-amber-700">
            No active receptionists or waiters were found.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b">
        {[
          { id: 'schedules', label: 'Weekly Schedules', icon: Clock3 },
          { id: 'overrides', label: 'Date Overrides', icon: CalendarDays },
          { id: 'locations', label: 'Work Locations', icon: MapPin },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id as typeof tab)}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${
                tab === item.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'schedules' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-semibold">
              {editingScheduleId ? 'Update Schedule' : 'Assign Weekly Schedule'}
            </h2>

            <p className="mb-5 mt-1 text-sm text-slate-500">
              {selectedStaff
                ? `Schedule for ${selectedStaff.fullName || selectedStaff.username}`
                : 'Select an employee before assigning a schedule.'}
            </p>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                createSchedule.mutate();
              }}
            >
              <Field label="Working day">
                <select
                  className={inputClass}
                  value={scheduleForm.weekday}
                  onChange={(event) =>
                    setScheduleForm({
                      ...scheduleForm,
                      weekday: event.target.value as Weekday,
                    })
                  }
                >
                  {weekdays.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Start time">
                  <input
                    className={inputClass}
                    type="time"
                    required
                    value={scheduleForm.startTime}
                    onChange={(event) =>
                      setScheduleForm({
                        ...scheduleForm,
                        startTime: event.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="End time">
                  <input
                    className={inputClass}
                    type="time"
                    required
                    value={scheduleForm.endTime}
                    onChange={(event) =>
                      setScheduleForm({
                        ...scheduleForm,
                        endTime: event.target.value,
                      })
                    }
                  />
                </Field>
              </div>

              <Field label="Grace period (minutes)">
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  max={180}
                  value={scheduleForm.graceMinutes}
                  onChange={(event) =>
                    setScheduleForm({
                      ...scheduleForm,
                      graceMinutes: Number(event.target.value),
                    })
                  }
                />
              </Field>

              <Field label="Assigned work location">
                <select
                  className={inputClass}
                  required
                  value={scheduleForm.workLocationId}
                  onChange={(event) =>
                    setScheduleForm({
                      ...scheduleForm,
                      workLocationId: event.target.value,
                    })
                  }
                >
                  <option value="">Select work location</option>
                  {activeLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} — {location.type === 'SALES_POINT'
                        ? 'Sales Point'
                        : 'Reception Desk'}
                    </option>
                  ))}
                </select>
              </Field>

              {activeLocations.length === 0 && (
                <p className="text-sm text-amber-700">
                  Create and activate a work location before assigning a
                  schedule.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={
                    !selectedStaffId ||
                    !scheduleForm.workLocationId ||
                    isSaving
                  }
                  className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
                >
                  <Save className="h-4 w-4" />
                  {editingScheduleId ? 'Update Schedule' : 'Save Schedule'}
                </button>

                {editingScheduleId && (
                  <button
                    type="button"
                    className={`${buttonClass} border border-slate-300`}
                    onClick={() => {
                      setEditingScheduleId(null);
                      setScheduleForm(emptySchedule);
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-semibold">Employee Weekly Schedule</h2>

            {!selectedStaffId ? (
              <p className="mt-4 text-sm text-slate-500">
                Select an employee to view their schedules.
              </p>
            ) : detailQuery.isLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading schedules...</p>
            ) : detailQuery.isError ? (
              <p className="mt-4 text-sm text-red-600">
                {errorMessage(detailQuery.error)}
              </p>
            ) : schedules.length === 0 ? (
              <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                No schedule has been assigned to this employee yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {weekdays.map((day) => {
                  const daySchedules = schedules.filter(
                    (schedule) => schedule.weekday === day.value,
                  );

                  return (
                    <div
                      key={day.value}
                      className="rounded-lg border p-3"
                    >
                      <h3 className="mb-2 font-semibold">{day.label}</h3>

                      {daySchedules.length === 0 ? (
                        <p className="text-sm text-slate-400">
                          No schedule assigned
                        </p>
                      ) : (
                        daySchedules.map((schedule) => (
                          <div
                            key={schedule.id}
                            className="flex flex-wrap items-center justify-between gap-3 border-t py-2 first:border-0"
                          >
                            <div>
                              <p className="font-medium">
                                {schedule.startTime} – {schedule.endTime}
                              </p>
                              <p className="text-xs text-slate-500">
                                {schedule.workLocation?.name || 'Location unavailable'}
                                {' · '}
                                {schedule.graceMinutes} min grace
                                {' · '}
                                {schedule.isActive ? 'Active' : 'Inactive'}
                              </p>
                              <p className="text-xs text-slate-400">
                                Effective from {formatDate(schedule.effectiveFrom)}
                                {schedule.effectiveTo
                                  ? ` to ${formatDate(schedule.effectiveTo)}`
                                  : ''}
                              </p>
                            </div>

                            <div className="flex gap-2">
                              <button
                                className="text-sm font-medium text-blue-700"
                                onClick={() => editSchedule(schedule)}
                              >
                                Edit
                              </button>

                              {schedule.isActive && (
                                <button
                                  className="text-sm font-medium text-red-600"
                                  disabled={deactivateSchedule.isPending}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        'Deactivate this schedule? Its history will be retained.',
                                      )
                                    ) {
                                      deactivateSchedule.mutate(schedule.id);
                                    }
                                  }}
                                >
                                  Deactivate
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'overrides' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-semibold">Date-specific Override</h2>
            <p className="mb-5 mt-1 text-sm text-slate-500">
              Replace the employee's normal schedule for a particular date or
              mark that date as a day off.
            </p>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveOverride.mutate();
              }}
            >
              <Field label="Date">
                <input
                  className={inputClass}
                  type="date"
                  required
                  value={overrideForm.date}
                  onChange={(event) =>
                    setOverrideForm({
                      ...overrideForm,
                      date: event.target.value,
                    })
                  }
                />
              </Field>

              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={overrideForm.isDayOff}
                  onChange={(event) =>
                    setOverrideForm({
                      ...overrideForm,
                      isDayOff: event.target.checked,
                    })
                  }
                />
                Mark this date as a day off
              </label>

              {!overrideForm.isDayOff && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Start time">
                      <input
                        className={inputClass}
                        type="time"
                        required
                        value={overrideForm.startTime}
                        onChange={(event) =>
                          setOverrideForm({
                            ...overrideForm,
                            startTime: event.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="End time">
                      <input
                        className={inputClass}
                        type="time"
                        required
                        value={overrideForm.endTime}
                        onChange={(event) =>
                          setOverrideForm({
                            ...overrideForm,
                            endTime: event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>

                  <Field label="Grace period (minutes)">
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      max={180}
                      value={overrideForm.graceMinutes}
                      onChange={(event) =>
                        setOverrideForm({
                          ...overrideForm,
                          graceMinutes: Number(event.target.value),
                        })
                      }
                    />
                  </Field>

                  <Field label="Work location (optional)">
                    <select
                      className={inputClass}
                      value={overrideForm.workLocationId}
                      onChange={(event) =>
                        setOverrideForm({
                          ...overrideForm,
                          workLocationId: event.target.value,
                        })
                      }
                    >
                      <option value="">Use normal scheduled location</option>
                      {activeLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              )}

              <Field label="Note (optional)">
                <textarea
                  className={inputClass}
                  rows={3}
                  maxLength={500}
                  value={overrideForm.note}
                  onChange={(event) =>
                    setOverrideForm({
                      ...overrideForm,
                      note: event.target.value,
                    })
                  }
                  placeholder="Reason for this change..."
                />
              </Field>

              <button
                type="submit"
                disabled={!selectedStaffId || saveOverride.isPending}
                className={`${buttonClass} bg-blue-600 text-white`}
              >
                <Save className="h-4 w-4" />
                Save Date Override
              </button>
            </form>
          </section>

          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-semibold">Existing Overrides</h2>

            {!selectedStaffId ? (
              <p className="mt-4 text-sm text-slate-500">
                Select an employee to view overrides.
              </p>
            ) : overrides.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No date-specific overrides have been created.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {overrides.map((override) => (
                  <div
                    key={override.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-semibold">
                        {formatDate(override.date)}
                      </p>
                      <p className="mt-1 text-sm">
                        {override.isDayOff
                          ? 'Day off'
                          : `${override.startTime} – ${override.endTime}`}
                      </p>
                      {!override.isDayOff && (
                        <p className="text-xs text-slate-500">
                          {override.workLocation?.name || 'Normal location'}
                          {override.graceMinutes != null
                            ? ` · ${override.graceMinutes} min grace`
                            : ''}
                        </p>
                      )}
                      {override.note && (
                        <p className="mt-1 text-xs text-slate-500">
                          {override.note}
                        </p>
                      )}
                    </div>

                    <button
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      title="Delete override"
                      disabled={deleteOverride.isPending}
                      onClick={() => {
                        if (window.confirm('Delete this date override?')) {
                          deleteOverride.mutate(override.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'locations' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-semibold">
              {editingLocationId ? 'Update Work Location' : 'Create Work Location'}
            </h2>

            <p className="mb-5 mt-1 text-sm text-slate-500">
              SalesPoint locations use existing POS SalesPoints. Reception
              desks are separate work locations.
            </p>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveLocation.mutate();
              }}
            >
              <Field label="Location name">
                <input
                  className={inputClass}
                  required
                  maxLength={100}
                  value={locationForm.name}
                  onChange={(event) =>
                    setLocationForm({
                      ...locationForm,
                      name: event.target.value,
                    })
                  }
                  placeholder="e.g. Main Reception or Pool Bar"
                />
              </Field>

              <Field label="Location type">
                <select
                  className={inputClass}
                  value={locationForm.type}
                  disabled={Boolean(editingLocationId)}
                  onChange={(event) =>
                    setLocationForm({
                      ...locationForm,
                      type: event.target.value as LocationType,
                      salesPointId: '',
                    })
                  }
                >
                  <option value="RECEPTION_DESK">Reception Desk</option>
                  <option value="SALES_POINT">SalesPoint Work Location</option>
                </select>
              </Field>

              {locationForm.type === 'SALES_POINT' && (
                <Field label="Existing POS SalesPoint">
                  <select
                    className={inputClass}
                    required
                    value={locationForm.salesPointId}
                    onChange={(event) =>
                      setLocationForm({
                        ...locationForm,
                        salesPointId: event.target.value,
                      })
                    }
                  >
                    <option value="">Select existing SalesPoint</option>
                    {salesPoints.map((point) => (
                      <option key={point.id} value={point.id}>
                        {point.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saveLocation.isPending}
                  className={`${buttonClass} bg-blue-600 text-white`}
                >
                  <Plus className="h-4 w-4" />
                  {editingLocationId ? 'Update Location' : 'Create Location'}
                </button>

                {editingLocationId && (
                  <button
                    type="button"
                    className={`${buttonClass} border border-slate-300`}
                    onClick={() => {
                      setEditingLocationId(null);
                      setLocationForm({
                        name: '',
                        type: 'RECEPTION_DESK',
                        salesPointId: '',
                      });
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-semibold">Work Locations</h2>

            <div className="mt-4 space-y-3">
              {locations.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No work locations have been created.
                </p>
              ) : (
                locations.map((location) => (
                  <div
                    key={location.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{location.name}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            location.isActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {location.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-slate-500">
                        {location.type === 'SALES_POINT'
                          ? `SalesPoint · ${location.salesPoint?.name || 'Linked SalesPoint'}`
                          : 'Reception Desk'}
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        className="text-sm font-medium text-blue-700"
                        onClick={() => editLocation(location)}
                      >
                        Edit
                      </button>

                      <button
                        className={`text-sm font-medium ${
                          location.isActive ? 'text-red-600' : 'text-emerald-700'
                        }`}
                        disabled={toggleLocation.isPending}
                        onClick={() => {
                          const action = location.isActive
                            ? 'deactivate'
                            : 'activate';

                          if (
                            window.confirm(
                              `Are you sure you want to ${action} ${location.name}?`,
                            )
                          ) {
                            toggleLocation.mutate(location);
                          }
                        }}
                      >
                        {location.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {selectedStaffId && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">Recent Clock-in History</h2>

          {shifts.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No recorded work shifts for this employee yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="p-2">Clock-in</th>
                    <th className="p-2">Clock-out</th>
                    <th className="p-2">Location</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((shift) => (
                    <tr key={shift.id} className="border-b last:border-0">
                      <td className="p-2">{formatDateTime(shift.startedAt)}</td>
                      <td className="p-2">
                        {shift.closedAt
                          ? formatDateTime(shift.closedAt)
                          : '—'}
                      </td>
                      <td className="p-2">
                        {shift.workLocation?.name || '—'}
                      </td>
                      <td className="p-2">{shift.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
