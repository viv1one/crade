import { describe, expect, it, vi } from "vitest";
import { EventEngine } from "./engine";

type TestEvents = {
  ping: { count: number };
  done: void;
};

describe("EventEngine", () => {
  it("dispatches to all registered handlers for an event type", () => {
    const engine = new EventEngine<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    engine.on("ping", a);
    engine.on("ping", b);

    engine.emit("ping", { count: 1 });

    expect(a).toHaveBeenCalledWith({ count: 1 });
    expect(b).toHaveBeenCalledWith({ count: 1 });
  });

  it("only calls handlers for the emitted event type", () => {
    const engine = new EventEngine<TestEvents>();
    const pingHandler = vi.fn();
    const doneHandler = vi.fn();
    engine.on("ping", pingHandler);
    engine.on("done", doneHandler);

    engine.emit("ping", { count: 1 });

    expect(pingHandler).toHaveBeenCalledTimes(1);
    expect(doneHandler).not.toHaveBeenCalled();
  });

  it("stops calling a handler after off()", () => {
    const engine = new EventEngine<TestEvents>();
    const handler = vi.fn();
    engine.on("ping", handler);
    engine.off("ping", handler);

    engine.emit("ping", { count: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it("is a no-op when emitting an event with no handlers", () => {
    const engine = new EventEngine<TestEvents>();
    expect(() => engine.emit("done", undefined)).not.toThrow();
  });
});
