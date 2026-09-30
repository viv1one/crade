import { NOOP_REPORTER, PROGRESS_HEADER, type ProgressEvent, type ProgressReporter } from "./types";

function errorMessage(data: unknown, status: number): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === "string") return e;
  }
  return `Request failed (${status})`;
}

// Lets an existing route handler report progress without changing what it
// returns. The handler still produces an ordinary Response (NextResponse.json
// etc.); if the caller opted in via PROGRESS_HEADER, that response is
// converted into a final NDJSON `result`/`error` event after any `progress`
// events the handler emitted. Callers that didn't opt in get the handler's
// Response untouched.
export function withProgress(
  request: Request,
  handler: (report: ProgressReporter) => Promise<Response>
): Promise<Response> | Response {
  if (request.headers.get(PROGRESS_HEADER) !== "1") return handler(NOOP_REPORTER);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: ProgressEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true; // client went away — stop writing, keep the handler running to completion
        }
      };
      try {
        const res = await handler((update) => send({ type: "progress", ...update }));
        const text = await res.text();
        let data: unknown = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
        if (res.ok) send({ type: "result", status: res.status, data });
        else send({ type: "error", status: res.status, error: errorMessage(data, res.status) });
      } catch (err) {
        send({ type: "error", status: 500, error: err instanceof Error ? err.message : "Request failed" });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  });
}

// Shared by the worker-pool fetchers: reports "label done/total" after each
// item finishes. Returns the increment function.
export function makeCounter(total: number, label: string, report: ProgressReporter): () => void {
  let done = 0;
  report({ text: label, done: 0, total });
  return () => {
    done += 1;
    report({ text: label, done, total });
  };
}
