"use client";

import { fetchWithProgress } from "@/lib/progress/client";
import type { ProgressUpdate } from "@/lib/progress/types";
import { useCallback, useState } from "react";
import type { LeaderboardResult } from "@/lib/backtest/types";

// Simpler than the other use-*-backtest hooks: this is a cached, shared
// GET (no per-user persistence, no history list, no AI review) — see
// app/api/backtest/leaderboard/route.ts.
export function useStrategyLeaderboard() {
  const [result, setResult] = useState<LeaderboardResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (interval: string, range: string, refresh = false) => {
    setRunning(true);
    setError(null);
    try {
      const params = new URLSearchParams({ interval, range });
      if (refresh) params.set("refresh", "true");
      const data = await fetchWithProgress<LeaderboardResult>(
        `/api/backtest/leaderboard?${params.toString()}`,
        {},
        setProgress
      );
      setResult(data);
      return data as LeaderboardResult;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Strategy leaderboard failed");
      return null;
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, []);

  return { result, running, progress, error, run };
}
