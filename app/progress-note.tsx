"use client";

import { useEffect, useState } from "react";
import type { ProgressUpdate } from "@/lib/progress/types";

interface ProgressNoteProps {
  // Latest report from the server (see lib/progress/): what it is doing
  // right now, with a real done/total count when it has one. Null until the
  // first report arrives.
  progress?: ProgressUpdate | null;
  // Shown only until the server's first report lands, or for routes that
  // don't report progress. Plain wording — never a guess about what stage
  // the work is in.
  fallback?: string;
  // Honest nudge once a wait runs long; says nothing about *why*.
  slowAfterSeconds?: number;
}

// Spinner + elapsed time + the server's real status line (and a bar when
// it has counts). Mount it only while the action is in flight — it resets
// its timer on mount.
export function ProgressNote({ progress, fallback = "Working…", slowAfterSeconds = 30 }: ProgressNoteProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const hasCount = progress?.total !== undefined && progress.done !== undefined && progress.total > 0;
  const pct = hasCount ? Math.min(100, Math.round((progress!.done! / progress!.total!) * 100)) : 0;

  return (
    <div role="status" className="flex flex-col gap-1.5 text-xs text-foreground-muted">
      <p className="inline-flex items-center gap-2">
        <span className="spinner" aria-hidden="true" />
        <span>
          {progress?.text ?? fallback}
          {hasCount && (
            <span className="tabular-nums">
              {" "}
              {progress!.done}/{progress!.total}
            </span>
          )}
          {elapsed >= 3 && <span className="tabular-nums"> ({elapsed}s)</span>}
        </span>
      </p>
      {hasCount && (
        <div
          className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      )}
      {elapsed >= slowAfterSeconds && <p>Taking longer than usual — the free data source or AI provider may be slow.</p>}
    </div>
  );
}
