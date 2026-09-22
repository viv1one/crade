import { describe, expect, it } from "vitest";
import { nextEvaluationTime } from "./next-evaluation";

describe("nextEvaluationTime", () => {
  it("rounds up to the next 4-hour UTC boundary", () => {
    expect(nextEvaluationTime(new Date("2026-01-01T02:30:00Z")).toISOString()).toBe(
      "2026-01-01T04:00:00.000Z"
    );
    expect(nextEvaluationTime(new Date("2026-01-01T03:59:59Z")).toISOString()).toBe(
      "2026-01-01T04:00:00.000Z"
    );
  });

  it("rolls into the next day past the last boundary", () => {
    expect(nextEvaluationTime(new Date("2026-01-01T21:00:01Z")).toISOString()).toBe(
      "2026-01-02T00:00:00.000Z"
    );
  });

  it("returns the following boundary when already exactly on one", () => {
    expect(nextEvaluationTime(new Date("2026-01-01T00:00:00Z")).toISOString()).toBe(
      "2026-01-01T04:00:00.000Z"
    );
  });
});
