
import { describe, expect, it } from "vitest";
import {
  forecastRevenue,
  suggestRoomRate,
} from "./forecast";

describe("Revenue forecasting", () => {
  it("forecasts revenue for the requested dates", () => {
    const result = forecastRevenue({
      startDate: "2026-11-02",
      days: 7,
      totalRooms: 10,
      history: Array.from({ length: 28 }, (_, i) => {
        const date = new Date("2026-10-05T00:00:00Z");
        date.setUTCDate(date.getUTCDate() + i);

        return {
          date: date.toISOString().slice(0, 10),
          availableRooms: 10,
          occupiedRooms: 8,
          roomRevenue: 80000,
        };
      }),
      bookings: [],
    });

    expect(result).toHaveLength(7);
    expect(result[0].forecastOccupancy).toBe(80);
    expect(result[0].forecastRoomRevenue).toBe(80000);
    expect(result[0].revPar).toBe(8000);
  });

  it("caps a suggested rate at the maximum", () => {
    const result = suggestRoomRate({
      date: "2026-11-02",
      currentRate: 20000,
      minimumRate: 10000,
      maximumRate: 21000,
      forecastOccupancy: 90,
      historicalSamples: 28,
    });

    expect(result.suggestedRate).toBe(21000);
    expect(result.requiresApproval).toBe(true);
  });

  it("does not change prices when historical data is insufficient", () => {
    const result = suggestRoomRate({
      date: "2026-11-02",
      currentRate: 20000,
      minimumRate: 10000,
      maximumRate: 30000,
      forecastOccupancy: 95,
      historicalSamples: 3,
    });

    expect(result.suggestedRate).toBe(20000);
  });

  it("rejects invalid forecast periods", () => {
    expect(() =>
      forecastRevenue({
        startDate: "2026-11-02",
        days: 120,
        totalRooms: 10,
        history: [],
        bookings: [],
      })
    ).toThrow();
  });
});
