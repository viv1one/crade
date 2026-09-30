import { describe, expect, it } from "vitest";
import { withProgress, makeCounter } from "./server";
import { parseNdjson } from "./client";
import { PROGRESS_HEADER } from "./types";

const req = (optIn: boolean) =>
  new Request("http://x/", { headers: optIn ? { [PROGRESS_HEADER]: "1" } : {} });

async function events(res: Response) {
  const text = await res.text();
  return parseNdjson(text).events;
}

describe("withProgress", () => {
  it("returns the handler's own response when the caller did not opt in", async () => {
    const res = await withProgress(req(false), async (report) => {
      report({ text: "ignored" });
      return Response.json({ ok: 1 });
    });
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: 1 });
  });

  it("streams progress then a result when opted in", async () => {
    const res = await withProgress(req(true), async (report) => {
      report({ text: "step", done: 1, total: 2 });
      return Response.json({ value: 42 });
    });
    expect(await events(res)).toEqual([
      { type: "progress", text: "step", done: 1, total: 2 },
      { type: "result", status: 200, data: { value: 42 } },
    ]);
  });

  it("turns a non-2xx response into an error event with its message", async () => {
    const res = await withProgress(req(true), async () => Response.json({ error: "nope" }, { status: 400 }));
    expect(await events(res)).toEqual([{ type: "error", status: 400, error: "nope" }]);
  });

  it("turns a thrown error into an error event", async () => {
    const res = await withProgress(req(true), async () => {
      throw new Error("boom");
    });
    expect(await events(res)).toEqual([{ type: "error", status: 500, error: "boom" }]);
  });
});

describe("parseNdjson", () => {
  it("keeps an incomplete trailing line as the rest", () => {
    const { events: e, rest } = parseNdjson('{"type":"progress","text":"a"}\n{"type":"prog');
    expect(e).toHaveLength(1);
    expect(rest).toBe('{"type":"prog');
  });
  it("skips malformed lines", () => {
    expect(parseNdjson('nope\n{"type":"result","status":200,"data":1}\n').events).toHaveLength(1);
  });
});

describe("makeCounter", () => {
  it("reports 0/total then increments", () => {
    const seen: unknown[] = [];
    const tick = makeCounter(2, "Fetching", (u) => seen.push(u));
    tick();
    tick();
    expect(seen).toEqual([
      { text: "Fetching", done: 0, total: 2 },
      { text: "Fetching", done: 1, total: 2 },
      { text: "Fetching", done: 2, total: 2 },
    ]);
  });
});
