import { describe, expect, it } from "vitest";
import { coerceOptionalPrice, extractAction } from "./parse-decision";

describe("extractAction", () => {
  it("prefers a labelled action line", () => {
    expect(extractAction('Some prose.\n"action": "buy"')).toBe("buy");
    expect(extractAction("Decision: Sell — the data is weak.")).toBe("sell");
  });

  it("falls back to a single standalone action word", () => {
    expect(extractAction("Given everything, I recommend hold for now.")).toBe("hold");
  });

  it("returns null when multiple distinct action words appear with no label", () => {
    expect(extractAction("We considered buy but leaned toward sell.")).toBeNull();
  });

  it("returns null for empty or action-less text", () => {
    expect(extractAction("")).toBeNull();
    expect(extractAction("The market was volatile today.")).toBeNull();
  });
});

describe("coerceOptionalPrice", () => {
  it("passes through a finite number", () => {
    expect(coerceOptionalPrice(1234.5)).toBe(1234.5);
  });

  it("parses a formatted currency string", () => {
    expect(coerceOptionalPrice("₹1,234.50")).toBe(1234.5);
    expect(coerceOptionalPrice("$189.5")).toBe(189.5);
  });

  it("drops placeholder strings", () => {
    for (const v of ["N/A", "none", "-", "TBD", "unknown", ""]) {
      expect(coerceOptionalPrice(v)).toBeUndefined();
    }
  });

  it("drops a percentage rather than reading it as a price", () => {
    expect(coerceOptionalPrice("15%")).toBeUndefined();
  });

  it("drops a non-numeric string", () => {
    expect(coerceOptionalPrice("around 150-160")).toBeUndefined();
  });
});
