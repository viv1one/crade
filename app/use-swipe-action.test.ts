import { describe, expect, it } from "vitest";
import { clampTranslate, resolveSwipeDirection } from "./use-swipe-action";

describe("clampTranslate", () => {
  it("passes through values within range", () => {
    expect(clampTranslate(50, 120)).toBe(50);
    expect(clampTranslate(-50, 120)).toBe(-50);
  });

  it("clamps to the max in either direction", () => {
    expect(clampTranslate(500, 120)).toBe(120);
    expect(clampTranslate(-500, 120)).toBe(-120);
  });
});

describe("resolveSwipeDirection", () => {
  it("returns null below the threshold in either direction", () => {
    expect(resolveSwipeDirection(50, 80)).toBeNull();
    expect(resolveSwipeDirection(-50, 80)).toBeNull();
    expect(resolveSwipeDirection(0, 80)).toBeNull();
  });

  it("returns left past the negative threshold, right past the positive", () => {
    expect(resolveSwipeDirection(-80, 80)).toBe("left");
    expect(resolveSwipeDirection(-120, 80)).toBe("left");
    expect(resolveSwipeDirection(80, 80)).toBe("right");
    expect(resolveSwipeDirection(120, 80)).toBe("right");
  });
});
