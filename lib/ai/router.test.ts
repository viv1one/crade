import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// providers read their API keys from process.env when the module loads, so the
// env is set and the module re-imported fresh for each test.
async function loadChat(env: Record<string, string>) {
  vi.resetModules();
  for (const k of ["NIM_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) delete process.env[k];
  Object.assign(process.env, env);
  return import("./router");
}

const okResponse = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

// A fetch that never answers, but honors its abort signal like the real one.
function hangingFetch(signal?: AbortSignal | null): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat() deadlines", () => {
  it("throws AiDeadlineError without calling any provider when the deadline is nearly up", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { chat } = await loadChat({ NIM_API_KEY: "k" });
    const { AiDeadlineError } = await import("./types");
    await expect(chat([], { task: "agent_report", deadline: Date.now() + 500 })).rejects.toBeInstanceOf(AiDeadlineError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("abandons a provider that hangs past the deadline instead of waiting forever", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => hangingFetch(init?.signal)));
    const { chat } = await loadChat({ NIM_API_KEY: "k" });
    const { AiDeadlineError } = await import("./types");
    const started = Date.now();
    await expect(chat([], { task: "agent_report", deadline: Date.now() + 2300 })).rejects.toBeInstanceOf(AiDeadlineError);
    expect(Date.now() - started).toBeLessThan(4000);
  });

  it("without a deadline behaves as before: succeeds, and a plain failure is not a deadline error", async () => {
    const { chat } = await loadChat({ NIM_API_KEY: "k" });
    const { AiDeadlineError } = await import("./types");
    vi.stubGlobal("fetch", vi.fn(async () => okResponse("hi")));
    expect((await chat([], { task: "agent_report" })).content).toBe("hi");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const err = await chat([], { task: "agent_report" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AiDeadlineError);
    expect(String(err.message)).toMatch(/All AI providers failed/);
  });

  it("startAt begins the chain at a different provider (so a retry doesn't repeat the slow one)", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return okResponse("ok");
      })
    );
    const { chat } = await loadChat({ NIM_API_KEY: "k", ANTHROPIC_API_KEY: "k" });
    // agent_report chain: nim, anthropic, openai, nim-large -> configured: nim, anthropic, nim-large
    await chat([], { task: "agent_report" });
    await chat([], { task: "agent_report", startAt: 1 });
    expect(urls[0]).toContain("nvidia.com");
    expect(urls[1]).toContain("anthropic.com");
  });

  it("handles a deadline far enough out that the per-attempt share isn't a whole number of ms", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse("fine")));
    const { chat } = await loadChat({ NIM_API_KEY: "k" });
    // 65% of a fractional-looking remainder used to be passed to AbortSignal.timeout as-is and throw.
    for (const extra of [45_001, 47_333, 59_999]) {
      expect((await chat([], { task: "agent_report", deadline: Date.now() + extra })).content).toBe("fine");
    }
  });

  it("still falls through to the next provider when the first errors quickly", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return urls.length === 1 ? new Response("down", { status: 500 }) : okResponse("second");
      })
    );
    const { chat } = await loadChat({ NIM_API_KEY: "k", ANTHROPIC_API_KEY: "k" });
    const result = await chat([], { task: "agent_report", deadline: Date.now() + 20_000 });
    expect(result.content).toBe("second");
    expect(urls).toHaveLength(2);
  });
});
