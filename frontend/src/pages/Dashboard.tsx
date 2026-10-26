
import {
  BedDouble,
  Building,
  Calendar,
  CalendarDays,
  DoorClosed,
  DoorOpen,
  LogIn,
  TrendingUp,
  UserCheck,
  Wallet,
  AlertTriangle,
  ChartNoAxesCombined,
  CircleDollarSign,
  Gauge,
} from 'lucide-react';

import { PageHeader } from '@/components/common';
import { useGet } from '@/lib/hooks';
import { cn, money, num } from '@/lib/utils';

interface ForecastDay {
  date: string;
  availableRooms: number;
  bookedRooms: number;
  forecastOccupiedRooms: number;
  forecastOccupancy: number;
  forecastRoomRevenue: number;
  averageDailyRate: number;
  revPar: number;
  historicalSamples: number;
  confidence: 'medium' | 'low' | 'very-low';
}

interface PricingSuggestion {
  date: string;
  currentAverageRate: number;
  suggestedAverageRate: number;
  changePercent: number;
  reason: string;
  requiresManagerApproval: true;
}

interface ForecastResponse {
  generatedAt: string;
  currency: string;
  period: {
    start: string;
    endExclusive: string;
    days: number;
  };
  summary: {
    roomCount: number;
    averageForecastOccupancy: number;
    forecastRoomRevenue: number;
    averageRevPar: number;
    historicalDays: number;
  };
  days: ForecastDay[];
  pricingSuggestions: PricingSuggestion[];
  limitations: string[];
}

function Tile({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  icon: any;
  color: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between rounded-lg border-l-4 bg-white p-5 shadow-sm',
        color,
      )}
    >
      <div>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </div>
      <div className="rounded-lg bg-slate-100 p-2">
        <Icon className="h-5 w-5 text-slate-600" />
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPercent(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  // Support either fractional values (0.75) or percentages (75).
  const percentage = Math.abs(value) <= 1 ? value * 100 : value;

  return `${num(percentage, 1)}%`;
}

function confidenceLabel(confidence: ForecastDay['confidence']) {
  switch (confidence) {
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    case 'very-low':
      return 'Very low';
    default:
      return confidence;
  }
}

function confidenceClass(confidence: ForecastDay['confidence']) {
  switch (confidence) {
    case 'medium':
      return 'bg-green-100 text-green-800';
    case 'low':
      return 'bg-yellow-100 text-yellow-800';
    case 'very-low':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function pricingChangeClass(change: number) {
  if (change > 0) return 'text-green-700';
  if (change < 0) return 'text-red-700';
  return 'text-slate-600';
}

export default function Dashboard() {
  const { data: d } = useGet('/dashboard');

  // Fetch the forecast independently so forecast failures do not hide
  // the existing dashboard information.
 
const {
  data: forecast,
  isLoading: forecastLoading,
  error: forecastError,
} = useGet<ForecastResponse>('/revenue-forecast', { days: 30 });


  const now = new Date();

  const upd = d?.updatedAt
    ? new Date(d.updatedAt).toLocaleTimeString('en-NG', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const generatedAt = forecast?.generatedAt
    ? new Date(forecast.generatedAt).toLocaleString('en-NG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '';

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={now.toLocaleDateString('en-NG', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      />

      {/* Existing dashboard cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Tile
          label="Today's Revenue"
          value={money(d?.todayRevenue)}
          sub={`Updated: ${upd}`}
          icon={Calendar}
          color="border-blue-600"
        />
        <Tile
          label="This Week's Revenue"
          value={money(d?.weekRevenue)}
          sub="Week to date"
          icon={CalendarDays}
          color="border-purple-600"
        />
        <Tile
          label="This Month's Revenue"
          value={money(d?.monthRevenue)}
          sub={now.toLocaleString('en-NG', {
            month: 'long',
            year: 'numeric',
          })}
          icon={Calendar}
          color="border-green-600"
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <Tile
          label="Profit Margin (Month)"
          value={`${num(d?.profitMargin, 1)}%`}
          sub={`Gross Profit: ${money(d?.grossProfit)}`}
          icon={TrendingUp}
          color="border-yellow-500"
        />
        <Tile
          label="Check-ins Today"
          value={String(d?.checkInsToday ?? 0)}
          sub={`In-house guests: ${d?.inHouseGuests ?? 0}`}
          icon={LogIn}
          color="border-green-500"
        />
        <Tile
          label="Check-outs Today"
          value={String(d?.checkOutsToday ?? 0)}
          sub="Check-outs processed"
          icon={DoorClosed}
          color="border-red-500"
        />
        <Tile
          label="Occupancy Rate"
          value={`${num(d?.occupancyRate, 1)}%`}
          sub={`${d?.occupied ?? 0} / ${d?.totalRooms ?? 0} rooms occupied`}
          icon={BedDouble}
          color="border-indigo-600"
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <Tile
          label="In-House Outstanding"
          value={money(d?.inHouseOutstanding)}
          sub="Guests currently checked in"
          icon={UserCheck}
          color="border-orange-500"
        />
        <Tile
          label="City Ledger Outstanding"
          value={money(d?.cityLedgerOutstanding)}
          sub="Receivables from city ledger"
          icon={Building}
          color="border-slate-500"
        />
        <Tile
          label="Check-ins"
          value={String(d?.checkInsToday ?? 0)}
          sub="Today"
          icon={DoorOpen}
          color="border-teal-500"
        />
        <Tile
          label="Cash Position"
          value="See Cash Flow"
          sub="Finance → Financial Reports"
          icon={Wallet}
          color="border-cyan-500"
        />
      </div>

      {/* Revenue Forecasting and Dynamic Pricing */}
      <section className="mt-8 space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <ChartNoAxesCombined className="h-6 w-6" />
              Revenue Forecasting
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Projected room revenue and occupancy for the next 30 days.
            </p>
          </div>

          {generatedAt && (
            <p className="text-xs text-muted-foreground">
              Generated {generatedAt}
            </p>
          )}
        </div>

        {forecastLoading && (
          <div
            className="rounded-lg border bg-white p-6 text-sm text-muted-foreground shadow-sm"
            role="status"
          >
            Loading revenue forecast…
          </div>
        )}

        {forecastError && !forecastLoading && (
          <div
            className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Revenue forecast unavailable</p>
              <p className="mt-1">
                The existing dashboard is still available. Check that you are
                signed in with an authorised role and that the forecast API is
                running.
              </p>
              <p className="mt-1 text-xs">
                The endpoint requires ADMIN, MANAGER, or ACCOUNTANT access.
                If the problem continues, inspect the
                /api/revenue-forecast request in your browser's Network tab.
              </p>
            </div>
          </div>
        )}

        {forecast && !forecastLoading && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tile
                label="Forecast Room Revenue"
                value={money(forecast.summary.forecastRoomRevenue)}
                sub={`Next ${forecast.period.days} days`}
                icon={CircleDollarSign}
                color="border-green-600"
              />
              <Tile
                label="Average Forecast Occupancy"
                value={formatPercent(
                  forecast.summary.averageForecastOccupancy,
                )}
                sub={`${forecast.summary.roomCount} rooms in forecast`}
                icon={BedDouble}
                color="border-indigo-600"
              />
              <Tile
                label="Average RevPAR"
                value={money(forecast.summary.averageRevPar)}
                sub="Revenue per available room"
                icon={Gauge}
                color="border-blue-600"
              />
              <Tile
                label="Historical Data"
                value={`${forecast.summary.historicalDays} days`}
                sub="History used by the forecast"
                icon={CalendarDays}
                color="border-purple-600"
              />
            </div>

            {forecast.limitations?.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  Forecast limitations
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                  {forecast.limitations.map((limitation, index) => (
                    <li key={`${index}-${limitation}`}>{limitation}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
              <div className="border-b p-4">
                <h3 className="font-semibold">Daily Revenue Forecast</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Estimated occupancy and room revenue by date.
                </p>
              </div>

              {forecast.days.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No daily forecast data was returned for this period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3 text-right">Occupied</th>
                        <th className="px-4 py-3 text-right">Occupancy</th>
                        <th className="px-4 py-3 text-right">
                          Forecast Revenue
                        </th>
                        <th className="px-4 py-3 text-right">Avg. Daily Rate</th>
                        <th className="px-4 py-3 text-right">RevPAR</th>
                        <th className="px-4 py-3">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {forecast.days.map((day) => (
                        <tr
                          key={day.date}
                          className="hover:bg-slate-50"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-medium">
                            {formatDate(day.date)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {day.forecastOccupiedRooms} / {day.availableRooms}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatPercent(day.forecastOccupancy)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                            {money(day.forecastRoomRevenue)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {money(day.averageDailyRate)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {money(day.revPar)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium',
                                confidenceClass(day.confidence),
                              )}
                            >
                              {confidenceLabel(day.confidence)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Dynamic Pricing Suggestions */}
            <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">
                    Dynamic Pricing Suggestions
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Suggested average room rates based on the forecast.
                  </p>
                </div>
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Manager approval required
                </span>
              </div>

              {forecast.pricingSuggestions.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  There are no pricing suggestions for this forecast period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[750px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3 text-right">Current Rate</th>
                        <th className="px-4 py-3 text-right">Suggested Rate</th>
                        <th className="px-4 py-3 text-right">Change</th>
                        <th className="px-4 py-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {forecast.pricingSuggestions.map((suggestion, index) => (
                        <tr
                          key={`${suggestion.date}-${index}`}
                          className="hover:bg-slate-50"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-medium">
                            {formatDate(suggestion.date)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {money(suggestion.currentAverageRate)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                            {money(suggestion.suggestedAverageRate)}
                          </td>
                          <td
                            className={cn(
                              'whitespace-nowrap px-4 py-3 text-right font-semibold',
                              pricingChangeClass(suggestion.changePercent),
                            )}
                          >
                            {suggestion.changePercent > 0 ? '+' : ''}
                            {num(suggestion.changePercent, 1)}%
                          </td>
                          <td className="max-w-sm px-4 py-3 text-muted-foreground">
                            {suggestion.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border-t bg-slate-50 p-4 text-xs text-slate-600">
                These are recommendations only. This dashboard does not change
                room prices or apply rate changes automatically. Review each
                suggestion and obtain manager approval before changing rates.
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
