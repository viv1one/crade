// A route that can take a while reports what it is actually doing as it
// goes, so the UI can show real work ("Fetched 23/50 stocks") instead of a
// timed guess. `done`/`total` are optional and only set when the count is
// real (e.g. symbols fetched), never estimated.
export interface ProgressUpdate {
  text: string;
  done?: number;
  total?: number;
}

export type ProgressReporter = (update: ProgressUpdate) => void;

// One JSON object per line ("NDJSON") on the wire. A run always ends with
// exactly one `result` or `error` event.
export type ProgressEvent =
  | ({ type: "progress" } & ProgressUpdate)
  | { type: "result"; status: number; data: unknown }
  | { type: "error"; status: number; error: string };

// Opt-in per request: without this header a route responds with its
// ordinary JSON, so existing callers and tests are unaffected.
export const PROGRESS_HEADER = "x-crade-progress";

export const NOOP_REPORTER: ProgressReporter = () => {};
