import { PROGRESS_HEADER, type ProgressEvent, type ProgressUpdate } from "./types";

// Splits a growing NDJSON buffer into complete events plus the unfinished
// tail. Exported (and pure) so it can be unit tested without a network.
export function parseNdjson(buffer: string): { events: ProgressEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: ProgressEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as ProgressEvent);
    } catch {
      // A malformed line is skipped rather than aborting the whole run.
    }
  }
  return { events, rest };
}

// fetch() that asks the route for live progress. Resolves with the route's
// normal JSON payload, throws Error(message) on failure — the same contract
// callers already had, plus an onProgress callback. If the server answers
// with plain JSON instead (older route, proxy error page, 401), that is
// handled the ordinary way.
export async function fetchWithProgress<T>(
  url: string,
  init: RequestInit = {},
  onProgress?: (update: ProgressUpdate) => void
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set(PROGRESS_HEADER, "1");
  const res = await fetch(url, { ...init, headers });

  const isStream = (res.headers.get("content-type") ?? "").includes("application/x-ndjson") && res.body;
  if (!isStream) {
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(res.ok ? "Server returned an unexpected response" : `Request failed (${res.status})`);
    }
    if (!res.ok) {
      const msg =
        typeof data === "object" && data !== null && typeof (data as { error?: unknown }).error === "string"
          ? (data as { error: string }).error
          : `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data as T;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: ProgressEvent | null = null;

  const handle = (events: ProgressEvent[]) => {
    for (const event of events) {
      if (event.type === "progress") onProgress?.({ text: event.text, done: event.done, total: event.total });
      else outcome = event;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseNdjson(buffer);
    buffer = parsed.rest;
    handle(parsed.events);
  }
  buffer += decoder.decode();
  handle(parseNdjson(buffer + "\n").events);

  const final = outcome as ProgressEvent | null;
  if (!final) throw new Error("Connection lost before the request finished — please try again");
  if (final.type === "error") throw new Error(final.error);
  if (final.type === "result") return final.data as T;
  throw new Error("Unexpected response");
}
