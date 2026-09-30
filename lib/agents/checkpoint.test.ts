import { describe, expect, it, vi } from "vitest";
import type { StoredChat } from "./checkpoint";

const chatMock = vi.fn();
vi.mock("../ai", () => ({ chat: (...args: unknown[]) => chatMock(...args) }));

function memory() {
  const store: Record<string, StoredChat> = {};
  return {
    store,
    cp: {
      get: (k: string) => store[k],
      save: (k: string, v: StoredChat) => void (store[k] = v),
    },
  };
}

describe("checkpointedChat", () => {
  it("calls the model once, stores the result, and replays it without calling again", async () => {
    chatMock.mockReset();
    chatMock.mockResolvedValue({ content: "hello", provider: "nim", model: "m" });
    const { checkpointedChat } = await import("./checkpoint");
    const { store, cp } = memory();

    const first = await checkpointedChat(cp, "step_a", [], { task: "agent_reasoning" });
    const second = await checkpointedChat(cp, "step_a", [], { task: "agent_reasoning" });

    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(first.content).toBe("hello");
    expect(second.content).toBe("hello");
    expect(store.step_a).toEqual({ content: "hello", provider: "nim", model: "m" });
  });

  it("is just chat() when there are no checkpoints", async () => {
    chatMock.mockReset();
    chatMock.mockResolvedValue({ content: "x", provider: "p", model: "m" });
    const { checkpointedChat } = await import("./checkpoint");
    await checkpointedChat(undefined, "k", [], { task: "agent_reasoning" });
    await checkpointedChat(undefined, "k", [], { task: "agent_reasoning" });
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it("doesn't store a call that failed", async () => {
    chatMock.mockReset();
    chatMock.mockRejectedValue(new Error("provider down"));
    const { checkpointedChat } = await import("./checkpoint");
    const { store, cp } = memory();
    await expect(checkpointedChat(cp, "k", [], { task: "agent_reasoning" })).rejects.toThrow("provider down");
    expect(store).toEqual({});
  });

  it("lets a save hook end the invocation cleanly after the call is stored", async () => {
    chatMock.mockReset();
    chatMock.mockResolvedValue({ content: "done", provider: "p", model: "m" });
    const { checkpointedChat, YieldForContinuation } = await import("./checkpoint");
    const { store } = memory();
    const cp = {
      get: (k: string) => store[k],
      save: (k: string, v: StoredChat) => {
        store[k] = v;
        throw new YieldForContinuation();
      },
    };
    await expect(checkpointedChat(cp, "k", [], { task: "agent_reasoning" })).rejects.toBeInstanceOf(YieldForContinuation);
    expect(store.k.content).toBe("done"); // stored before the hand-off, so the next invocation replays it
  });
});
