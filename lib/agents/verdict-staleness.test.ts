import { describe, expect, it } from "vitest";
import { isVerdictStale } from "./verdict-staleness";

describe("isVerdictStale", () => {
  const now = new Date("2026-01-10T12:00:00Z");

  it("is not stale just now", () => {
    expect(isVerdictStale(now.toISOString(), now)).toBe(false);
  });

  it("is not stale at 47 hours old", () => {
    const createdAt = new Date(now.getTime() - 47 * 60 * 60 * 1000).toISOString();
    expect(isVerdictStale(createdAt, now)).toBe(false);
  });

  it("is stale past 48 hours old", () => {
    const createdAt = new Date(now.getTime() - 49 * 60 * 60 * 1000).toISOString();
    expect(isVerdictStale(createdAt, now)).toBe(true);
  });
});
