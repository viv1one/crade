import { describe, expect, it } from "vitest";
import {
  calendarMonth,
  calendarYear,
  daysToMonthlyExpiry,
  isExpiryWeek,
  isPaydayWindow,
  isTurnOfMonth,
} from "./calendar";

function ts(year: number, month1based: number, day: number): number {
  return Date.UTC(year, month1based - 1, day) / 1000;
}

describe("calendarYear / calendarMonth", () => {
  it("extracts UTC year and 0-based month", () => {
    expect(calendarYear(ts(2024, 3, 15))).toBe(2024);
    expect(calendarMonth(ts(2024, 3, 15))).toBe(2); // March = index 2
  });
});

describe("isTurnOfMonth", () => {
  it("is true for the last N days of the month", () => {
    expect(isTurnOfMonth(ts(2024, 1, 31), 1, 3)).toBe(true);
    expect(isTurnOfMonth(ts(2024, 1, 30), 1, 3)).toBe(false);
  });

  it("is true for the first M days of the next month", () => {
    expect(isTurnOfMonth(ts(2024, 2, 1), 1, 3)).toBe(true);
    expect(isTurnOfMonth(ts(2024, 2, 3), 1, 3)).toBe(true);
    expect(isTurnOfMonth(ts(2024, 2, 4), 1, 3)).toBe(false);
  });

  it("handles February in a leap year correctly", () => {
    expect(isTurnOfMonth(ts(2024, 2, 29), 1, 3)).toBe(true);
    expect(isTurnOfMonth(ts(2024, 2, 28), 1, 3)).toBe(false);
  });
});

describe("isPaydayWindow", () => {
  it("is true only for the last day and first `windowDays` of the month", () => {
    expect(isPaydayWindow(ts(2024, 4, 30), 1)).toBe(true);
    expect(isPaydayWindow(ts(2024, 5, 1), 1)).toBe(true);
    expect(isPaydayWindow(ts(2024, 5, 2), 1)).toBe(false);
    expect(isPaydayWindow(ts(2024, 4, 29), 1)).toBe(false);
  });
});

describe("daysToMonthlyExpiry / isExpiryWeek", () => {
  // January 2024's last Thursday is the 25th.
  it("counts down to the last Thursday of the month", () => {
    expect(daysToMonthlyExpiry(ts(2024, 1, 25))).toBe(0);
    expect(daysToMonthlyExpiry(ts(2024, 1, 22))).toBe(3);
    expect(daysToMonthlyExpiry(ts(2024, 1, 26))).toBe(-1);
  });

  it("flags the window leading into expiry, not after it", () => {
    expect(isExpiryWeek(ts(2024, 1, 22), 3)).toBe(true);
    expect(isExpiryWeek(ts(2024, 1, 25), 3)).toBe(true);
    expect(isExpiryWeek(ts(2024, 1, 18), 3)).toBe(false);
    expect(isExpiryWeek(ts(2024, 1, 26), 3)).toBe(false);
  });
});
