import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./fetch-with-retry";

function mockResponse(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns immediately on a non-429 response, even an error status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(404));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com", undefined, { baseDelayMs: 1 });
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and succeeds once a later attempt returns 200", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com", undefined, {
      retries: 2,
      baseDelayMs: 1,
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting retries on sustained 429s", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(429));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRetry("https://example.com", undefined, { retries: 2, baseDelayMs: 1 })
    ).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries on a network-level throw, not just HTTP 429", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(mockResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com", undefined, {
      retries: 1,
      baseDelayMs: 1,
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
