import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, FileText, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useGet } from '@/lib/hooks';
import {  dt, money } from '@/lib/utils';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function durationLabel(start: string, end?: string | null) {
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();

  const totalMinutes = Math.max(0, Math.floor((to - from) / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  }

  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }

  if (days === 0 && minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }

  return parts.length ? parts.join(', ') : 'Less than a minute';
}

function displayStatus(status: string) {
  return status === 'CHECKED_IN' ? 'Checked in' : 'Checked out';
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value ?? '—'}</span>
    </div>
  );
}

export default function GuestHistory() {
  const { id } = useParams();

  const { data, isLoading, isError, error } = useGet<any>(
    `/guests/${id}/history`,
    undefined,
    Boolean(id),
  );

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading guest history...
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-6">
        <p className="font-semibold text-red-600">
          Unable to load guest history
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {(error as Error)?.message || 'An unexpected error occurred.'}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/guests">Back to Guests</Link>
        </Button>
      </Card>
    );
  }

  if (!data?.guest) {
    return (
      <Card className="p-6">
        <p className="font-semibold">Guest not found</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/guests">Back to Guests</Link>
        </Button>
      </Card>
    );
  }

  const { guest, statistics, stays, recentCheckIns } = data;

  const guestName = `${guest.firstName} ${guest.lastName}`;

  return (
    <div className="space-y-6">
      {/* Page heading and actions */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">
            Guest History - {guestName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete stay history and folio overview
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/folios">
              <FileText className="mr-2 h-4 w-4" />
              VIEW ALL FOLIOS
            </Link>
          </Button>

          <Button asChild variant="dark">
            <Link to="/guests">
              <ArrowLeft className="mr-2 h-4 w-4" />
              BACK TO GUESTS
            </Link>
          </Button>
        </div>
      </div>

      {/* Guest information and stay statistics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Guest Information</CardTitle>
          </CardHeader>

          <CardContent>
            <InfoRow label="Name" value={guestName} />
            <InfoRow label="Email" value={guest.email || '—'} />
            <InfoRow label="Phone" value={guest.phone || '—'} />
            <InfoRow label="Address" value={guest.address || '—'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stay Statistics</CardTitle>
          </CardHeader>

          <CardContent>
            <InfoRow
              label="Total Stays"
              value={statistics.totalStays}
            />

            <InfoRow
              label="Current Status"
              value={
                <Badge variant={statusVariant(statistics.currentStatus)}>
                  {displayStatus(statistics.currentStatus)}
                </Badge>
              }
            />

            <InfoRow
              label="Member of Group"
              value={statistics.memberOfGroup || '—'}
            />

            <InfoRow
              label="Total Balance"
              value={
                <span
                  className={
                    Number(statistics.totalBalance) < 0
                      ? 'font-semibold text-red-600'
                      : 'font-semibold'
                  }
                >
                  {money(statistics.totalBalance)}
                </span>
              }
            />
          </CardContent>
        </Card>
      </div>

      {/* Stay history */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Stay History</CardTitle>
            <span className="text-sm text-muted-foreground">
              Total Stays: {stays.length}
            </span>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Folio ID</th>
                  <th className="px-3 py-3">Room</th>
                  <th className="px-3 py-3">Check-in</th>
                  <th className="px-3 py-3">Check-out</th>
                  <th className="px-3 py-3">Duration</th>
                  <th className="px-3 py-3 text-right">Balance</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Group</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {stays.map((stay: any) => (
                  <tr key={stay.id} className="border-b last:border-0">
                    <td className="px-3 py-3 font-mono text-xs">
                      {stay.folioNo || '—'}
                    </td>

                    <td className="px-3 py-3">{stay.room}</td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      {dt(stay.checkInAt)}
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      {stay.checkOutAt
                        ? dt(stay.checkOutAt)
                        : '—'}
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      {durationLabel(stay.checkInAt, stay.checkOutAt)}
                    </td>

                    <td
                      className={`px-3 py-3 text-right font-semibold ${
                        Number(stay.balance) < 0
                          ? 'text-red-600'
                          : ''
                      }`}
                    >
                      {money(stay.balance)}
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      <Badge variant={statusVariant(stay.status)}>
                        {displayStatus(stay.status)}
                      </Badge>
                    </td>

                    <td className="px-3 py-3">
                      {stay.group || '—'}
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {stay.folioId ? (
                          <>
                            <Link
                              to={`/folios/${stay.folioId}?print=1`}
                              title="Print folio"
                              className="text-muted-foreground hover:text-primary"
                            >
                              <Printer className="h-4 w-4" />
                            </Link>

                            <Link
                              to={`/folios/${stay.folioId}`}
                              title="View folio"
                              className="text-blue-700 hover:text-blue-900"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {stays.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No stay history found for this guest.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-xs text-muted-foreground">
            Showing {stays.length ? 1 : 0} to {stays.length} of{' '}
            {stays.length} results
          </div>
        </CardContent>
      </Card>

      {/* Recent check-ins */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Recent Check-ins</CardTitle>
            <span className="text-sm text-muted-foreground">
              Total Check-ins: {recentCheckIns.length}
            </span>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Room</th>
                  <th className="px-3 py-3">Check-in Time</th>
                  <th className="px-3 py-3">Check-out Time</th>
                  <th className="px-3 py-3">Guests</th>
                  <th className="px-3 py-3">Special Requests</th>
                </tr>
              </thead>

              <tbody>
                {recentCheckIns.map((stay: any) => (
                  <tr key={stay.id} className="border-b last:border-0">
                    <td className="px-3 py-3">{stay.room}</td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      {dt(stay.checkInAt)}
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap">
                      {stay.checkOutAt
                        ? dt(stay.checkOutAt)
                        : '—'}
                    </td>

                    <td className="px-3 py-3">{stay.numGuests}</td>

                    <td className="px-3 py-3">
                      {stay.specialRequests || 'No special request'}
                    </td>
                  </tr>
                ))}

                {recentCheckIns.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No check-in history found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}