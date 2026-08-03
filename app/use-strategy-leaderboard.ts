"use client";

import { useCallback, useState } from "react";
import type { LeaderboardResult } from "@/lib/backtest/types";

// Simpler than the other use-*-backtest hooks: this is a cached, shared
// GET (no per-user persistence, no history list, no AI review) — see
// app/api/backtest/leaderboard/route.ts.
export function useStrategyLeaderboard() {
  const [result, setResult] = useState<LeaderboardResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (interval: string, range: string, refresh = false) => {
    setRunning(true);
    setError(null);
    try {
      const params = new URLSearchParams({ interval, range });
      if (refresh) params.set("refresh", "true");
      const res = await fetch(`/api/backtest/leaderboard?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Strategy leaderboard failed");
      setResult(data);
      return data as LeaderboardResult;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Strategy leaderboard failed");
      return null;
    } finally {
      setRunning(false);
    }
  }, []);

  return { result, running, error, run };
}
