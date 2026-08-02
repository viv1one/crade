import { describe, expect, it } from "vitest";
import { parseBulkHoldings } from "./holdings-bulk-parse";

describe("parseBulkHoldings", () => {
  it("parses whitespace-separated lines and auto-appends .NS", () => {
    const { rows, errors } = parseBulkHoldings("TCS 10 3800\nINFY 5 1450.5");
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { line: 1, symbol: "TCS.NS", qty: 10, avgCost: 3800 },
      { line: 2, symbol: "INFY.NS", qty: 5, avgCost: 1450.5 },
    ]);
  });

  it("parses comma-separated lines and leaves an explicit suffix alone", () => {
    const { rows, errors } = parseBulkHoldings("RELIANCE.NS, 5, 1300");
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([{ line: 1, symbol: "RELIANCE.NS", qty: 5, avgCost: 1300 }]);
  });

  it("skips blank lines silently", () => {
    const { rows, errors } = parseBulkHoldings("TCS 10 3800\n\n   \nINFY 5 1450");
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });

  it("collects a per-line error without dropping the other valid lines", () => {
    const { rows, errors } = parseBulkHoldings("TCS 10 3800\nonly two tokens here\nINFY 5 1450");
    expect(rows).toEqual([
      { line: 1, symbol: "TCS.NS", qty: 10, avgCost: 3800 },
      { line: 3, symbol: "INFY.NS", qty: 5, avgCost: 1450 },
    ]);
    expect(errors).toEqual([
      { line: 2, raw: "only two tokens here", message: 'expected "symbol qty price"' },
    ]);
  });

  it("rejects a non-positive quantity or price with a specific message", () => {
    const { errors } = parseBulkHoldings("TCS 0 3800\nINFY 5 -10");
    expect(errors[0]).toMatchObject({ line: 1, message: expect.stringMatching(/quantity/i) });
    expect(errors[1]).toMatchObject({ line: 2, message: expect.stringMatching(/avg cost/i) });
  });
});
