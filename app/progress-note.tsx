"use client";

import { useEffect, useState } from "react";

interface ProgressNoteProps {
  // Ordered stages, each shown once `afterSeconds` have elapsed — lets a
  // slow action say what's plausibly happening and that a wait is normal,
  // instead of a bare spinner. The first stage should use afterSeconds: 0.
  stages: { afterSeconds: number; text: string }[];
}

// Spinner + elapsed time + a message that changes as the wait grows. Mount
// it only while the action is in flight (it resets its timer on mount).
export function ProgressNote({ stages }: ProgressNoteProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const current = [...stages].reverse().find((s) => elapsed >= s.afterSeconds) ?? stages[0];

  return (
    <p role="status" className="inline-flex items-center gap-2 text-xs text-foreground-muted">
      <span className="spinner" aria-hidden="true" />
      <span>
        {current.text}
        {elapsed >= 3 && <span className="tabular-nums"> ({elapsed}s)</span>}
      </span>
    </p>
  );
}
