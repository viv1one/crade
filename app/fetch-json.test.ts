import { describe, expect, it } from "vitest";
import { errorMessage, safeJson } from "./fetch-json";

const res = (body: string, status: number, type = "application/json") =>
  new Response(body, { status, headers: { "Content-Type": type } });

describe("safeJson", () => {
  it("returns parsed JSON on success", async () => {
    expect(await safeJson(res('{"a":1}', 200))).toEqual({ a: 1 });
  });
  it("throws the server's error field on a JSON error response", async () => {
    await expect(safeJson(res('{"error":"nope"}', 400))).rejects.toThrow("nope");
  });
  it("does not leak an HTML error page into the message", async () => {
    await expect(safeJson(res("<html>Bad Gateway</html>", 502, "text/html"))).rejects.toThrow(/^Request failed \(502\)$/);
  });
  it("quotes a short plain-text error body", async () => {
    await expect(safeJson(res("upstream timeout", 504, "text/plain"))).rejects.toThrow("Request failed (504): upstream timeout");
  });
  it("reports a 200 with a non-JSON body as unexpected", async () => {
    await expect(safeJson(res("<html>login</html>", 200, "text/html"))).rejects.toThrow(/unexpected response/i);
  });
});

describe("errorMessage", () => {
  it("turns a network TypeError into an actionable message", () => {
    expect(errorMessage(new TypeError("Failed to fetch"), "x")).toMatch(/couldn't reach the server/i);
    expect(errorMessage(new TypeError("Load failed"), "x")).toMatch(/couldn't reach the server/i);
  });
  it("passes through an Error's own message", () => {
    expect(errorMessage(new Error("Insufficient cash"), "x")).toBe("Insufficient cash");
  });
  it("falls back for non-errors and empty messages", () => {
    expect(errorMessage("boom", "fallback")).toBe("fallback");
    expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
  });
});
