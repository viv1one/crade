import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// continuation.ts imports the executor (which reaches for the database); not needed here.
vi.mock("./run-executor", () => ({ executeRunSlice: vi.fn() }));

const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  process.env.CRON_SECRET = "s3cret";
});
afterEach(() => vi.unstubAllGlobals());

// Outside a request scope next/server's after() throws, so these exercise the
// fallback path (run the work in the background) — which is the same work.
const flush = () => new Promise((r) => setTimeout(r, 20));

describe("scheduleContinuation", () => {
  it("does nothing without CRON_SECRET (the receiving route would refuse it anyway)", async () => {
    delete process.env.CRON_SECRET;
    const { scheduleContinuation, continuationEnabled } = await import("./continuation");
    scheduleContinuation("http://host", "abc");
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(continuationEnabled()).toBe(false);
  });

  it("asks the cron route to run the next slice, authenticated with the secret", async () => {
    const { scheduleContinuation, continuationEnabled } = await import("./continuation");
    scheduleContinuation("http://host", "run 1");
    await flush();
    expect(continuationEnabled()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://host/api/cron/resume-agent-runs?runId=run%201");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer s3cret");
  });

  it("swallows a failed hand-off (the page or the sweeper will pick the run up)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));
    const { scheduleContinuation } = await import("./continuation");
    expect(() => scheduleContinuation("http://host", "abc")).not.toThrow();
    await flush();
  });
});
