import { describe, expect, it } from "vitest";
import { annualizedReturnPct } from "./holdings-cagr";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const EPOCH = new Date(0);

describe("annualizedReturnPct", () => {
  it("doubling over exactly one year is a 100% annualized return", () => {
    const now = new Date(EPOCH.getTime() + YEAR_MS);
    expect(annualizedReturnPct(100, 200, EPOCH, now)).toBeCloseTo(100, 5);
  });

  it("doubling over exactly two years is a ~41.42% annualized return, not the raw 100% total gain", () => {
    const now = new Date(EPOCH.getTime() + 2 * YEAR_MS);
    const result = annualizedReturnPct(100, 200, EPOCH, now);
    expect(result).toBeCloseTo((Math.sqrt(2) - 1) * 100, 5);
    expect(result).not.toBeCloseTo(100, 0); // distinct from simple total-P&L%
  });

  it("a loss annualizes to a negative rate", () => {
    const now = new Date(EPOCH.getTime() + YEAR_MS);
    expect(annualizedReturnPct(200, 100, EPOCH, now)).toBeCloseTo(-50, 5);
  });

  it("returns undefined when nothing was invested", () => {
    const now = new Date(EPOCH.getTime() + YEAR_MS);
    expect(annualizedReturnPct(0, 100, EPOCH, now)).toBeUndefined();
  });

  it("returns undefined when the purchase date is in the future (or 'now' predates it)", () => {
    expect(annualizedReturnPct(100, 150, EPOCH, EPOCH)).toBeUndefined();
    const past = new Date(EPOCH.getTime() - YEAR_MS);
    expect(annualizedReturnPct(100, 150, EPOCH, past)).toBeUndefined();
  });
});
