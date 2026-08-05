import { describe, expect, it } from "vitest";
import { formatScreenerRowsForPrompt } from "./format";
import type { ScreenerRow } from "./types";

describe("formatScreenerRowsForPrompt", () => {
  it("renders dividendYield as a percentage, not the raw fraction", () => {
    const rows: ScreenerRow[] = [
      {
        symbol: "TCS.NS",
        name: "Tata Consultancy Services",
        sector: "IT",
        price: 2400,
        changePercent: 1.2,
        dividendYield: 0.0263, // stored internally as a fraction (2.63%)
      },
    ];
    const text = formatScreenerRowsForPrompt(rows);
    expect(text).toContain("dividendYieldPercent");
    expect(text).toContain("2.63");
    expect(text).not.toContain("0.03,"); // the pre-fix raw-fraction rendering
  });

  it("leaves a missing dividendYield blank rather than rendering 0", () => {
    const rows: ScreenerRow[] = [
      { symbol: "TCS.NS", name: "TCS", sector: "IT", price: 2400, changePercent: 1.2 },
    ];
    const text = formatScreenerRowsForPrompt(rows);
    expect(text.trim().endsWith(",")).toBe(true);
  });
});
