import { NextResponse } from "next/server";

// Throw this (not a plain Error) for anything whose message is safe to
// show a user directly — validation failures, business-rule rejections
// like "insufficient cash". AppError is still an Error subclass, so
// existing `.toThrow(/pattern/i)` test assertions keep working unchanged.
export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

// Route-handler catch-block helper: forwards an AppError's message
// verbatim (it was written to be user-facing), but generalizes anything
// else — a raw Mongo/network exception, for instance — to a fixed
// message instead of `err.message`, so an internal detail never reaches
// the client just because a catch block did `instanceof Error ? err.message
// : fallback`. The real error still gets logged server-side either way.
export function toErrorResponse(
  err: unknown,
  fallbackMessage = "Something went wrong",
  fallbackStatus = 500
): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: fallbackMessage }, { status: fallbackStatus });
}
