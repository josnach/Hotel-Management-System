
export type DailyPerformance = {
  date: string; // YYYY-MM-DD
  availableRooms: number;
  occupiedRooms: number;
  roomRevenue: number;
};

export type UpcomingBooking = {
  checkIn: string;  // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD (exclusive)
  roomCount: number;
  expectedRoomRevenue: number;
};

export type PricingInput = {
  date: string;
  currentRate: number;
  minimumRate: number;
  maximumRate: number;
  forecastOccupancy: number; // 0–100
  historicalSamples: number;
};

export type DailyForecast = {
  date: string;
  availableRooms: number;
  forecastOccupiedRooms: number;
  forecastOccupancy: number;
  forecastRoomRevenue: number;
  averageDailyRate: number;
  revPar: number;
  confidence: "low" | "medium" | "high";
};

export type PricingSuggestion = {
  date: string;
  currentRate: number;
  suggestedRate: number;
  changePercent: number;
  reason: string;
  requiresApproval: true;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

function utcDate(date: string): Date {
  const parsed = new Date(`${date}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }

  return parsed;
}

function addDays(date: string, days: number): string {
  const result = utcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (utcDate(end).getTime() - utcDate(start).getTime()) /
      86_400_000
  );
}

export function forecastRevenue(input: {
  startDate: string;
  days: number;
  totalRooms: number;
  history: DailyPerformance[];
  bookings: UpcomingBooking[];
}): DailyForecast[] {
  const { startDate, days, totalRooms, history, bookings } = input;

  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error("Forecast period must be between 1 and 90 days.");
  }

  if (!Number.isInteger(totalRooms) || totalRooms < 1) {
    throw new Error("totalRooms must be a positive integer.");
  }

  const validHistory = history.filter(
    (day) =>
      Number.isFinite(day.availableRooms) &&
      Number.isFinite(day.occupiedRooms) &&
      Number.isFinite(day.roomRevenue) &&
      day.availableRooms > 0 &&
      day.occupiedRooms >= 0 &&
      day.occupiedRooms <= day.availableRooms &&
      day.roomRevenue >= 0
  );

  const historyByWeekday = new Map<number, DailyPerformance[]>();

  for (const day of validHistory) {
    const weekday = utcDate(day.date).getUTCDay();
    const entries = historyByWeekday.get(weekday) ?? [];
    entries.push(day);
    historyByWeekday.set(weekday, entries);
  }

  const overallOccupancy = average(
    validHistory.map((day) => day.occupiedRooms / day.availableRooms)
  );

  const overallAdr = average(
    validHistory
      .filter((day) => day.occupiedRooms > 0)
      .map((day) => day.roomRevenue / day.occupiedRooms)
  );

  return Array.from({ length: days }, (_, offset) => {
    const date = addDays(startDate, offset);
    const weekday = utcDate(date).getUTCDay();
    const weekdayHistory = historyByWeekday.get(weekday) ?? [];

    // Blend weekday performance with the overall average.
    // This reduces overreaction to a small number of observations.
    const weekdayWeight =
      weekdayHistory.length / (weekdayHistory.length + 4);

    const weekdayOccupancy = average(
      weekdayHistory.map((day) => day.occupiedRooms / day.availableRooms)
    );

    const weekdayAdr = average(
      weekdayHistory
        .filter((day) => day.occupiedRooms > 0)
        .map((day) => day.roomRevenue / day.occupiedRooms)
    );

    const baselineOccupancy =
      weekdayWeight * weekdayOccupancy +
      (1 - weekdayWeight) * overallOccupancy;

    const baselineAdr =
      weekdayWeight * weekdayAdr +
      (1 - weekdayWeight) * overallAdr;

    const bookedRooms = bookings
      .filter(
        (booking) => booking.checkIn <= date && date < booking.checkOut
      )
      .reduce((sum, booking) => sum + booking.roomCount, 0);

    const bookedRevenue = bookings
      .filter(
        (booking) => booking.checkIn <= date && date < booking.checkOut
      )
      .reduce((sum, booking) => {
        const nights = daysBetween(booking.checkIn, booking.checkOut);
        return sum +
          (nights > 0 ? booking.expectedRoomRevenue / nights : 0);
      }, 0);

    const occupancy = clamp(
      Math.max(bookedRooms, totalRooms * baselineOccupancy),
      0,
      totalRooms
    );

    // Use the higher of the historical revenue baseline and
    // known booking revenue. This is a simple baseline, not ML.
    const historicalRevenue = occupancy * baselineAdr;
    const forecastRevenue = Math.max(historicalRevenue, bookedRevenue);

    const forecastAdr =
      occupancy > 0 ? forecastRevenue / occupancy : 0;

    return {
      date,
      availableRooms: totalRooms,
      forecastOccupiedRooms: Math.round(occupancy * 100) / 100,
      forecastOccupancy: Math.round((occupancy / totalRooms) * 10000) / 100,
      forecastRoomRevenue: Math.round(forecastRevenue * 100) / 100,
      averageDailyRate: Math.round(forecastAdr * 100) / 100,
      revPar: Math.round((forecastRevenue / totalRooms) * 100) / 100,
      confidence:
        validHistory.length >= 28
          ? "high"
          : validHistory.length >= 7
            ? "medium"
            : "low",
    };
  });
}

export function suggestRoomRate(
  input: PricingInput
): PricingSuggestion {
  const {
    date,
    currentRate,
    minimumRate,
    maximumRate,
    forecastOccupancy,
    historicalSamples,
  } = input;

  if (
    ![currentRate, minimumRate, maximumRate, forecastOccupancy]
      .every(Number.isFinite) ||
    minimumRate <= 0 ||
    maximumRate < minimumRate ||
    currentRate <= 0 ||
    forecastOccupancy < 0 ||
    forecastOccupancy > 100
  ) {
    throw new Error("Invalid room pricing inputs.");
  }

  if (currentRate < minimumRate || currentRate > maximumRate) {
    throw new Error("Current rate is outside its allowed price limits.");
  }

  if (historicalSamples < 7) {
    return {
      date,
      currentRate,
      suggestedRate: currentRate,
      changePercent: 0,
      reason:
        "Insufficient historical data. Keep the current rate until demand estimates improve.",
      requiresApproval: true,
    };
  }

  let adjustment = 0;
  let reason = "Demand is within the normal range; retain the current rate.";

  if (forecastOccupancy >= 85) {
    adjustment = 0.10;
    reason = "High forecast occupancy (85% or above); consider increasing the rate by 10%.";
  } else if (forecastOccupancy >= 70) {
    adjustment = 0.05;
    reason = "Strong forecast occupancy; consider increasing the rate by 5%.";
  } else if (forecastOccupancy < 30) {
    adjustment = -0.10;
    reason = "Low forecast occupancy (below 30%); consider a 10% reduction.";
  } else if (forecastOccupancy < 45) {
    adjustment = -0.05;
    reason = "Soft forecast demand; consider a 5% reduction.";
  }

  const suggestedRate = Math.round(
    clamp(currentRate * (1 + adjustment), minimumRate, maximumRate)
  );

  return {
    date,
    currentRate,
    suggestedRate,
    changePercent:
      Math.round(((suggestedRate - currentRate) / currentRate) * 10000) / 100,
    reason,
    requiresApproval: true,
  };
}
