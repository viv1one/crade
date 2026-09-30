"use client";

import { useCallback, useEffect, useState } from "react";
import type { BacktestMetrics, EquityPoint, PairsBacktestConfig, PairsParams } from "@/lib/backtest/types";
import type { Trade } from "@/lib/paper-trading/types";
import type { AiReview } from "./use-backtest";
import { safeJson } from "./fetch-json";
import { fetchWithProgress } from "@/lib/progress/client";
import type { ProgressUpdate } from "@/lib/progress/types";

export interface PairsBacktestRun {
  _id: string;
  ownerId: string;
  config: PairsBacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  aiReview?: AiReview;
  createdAt: string;
}

export interface RunPairsBacktestInput {
  symbolA: string;
  symbolB: string;
  interval: string;
  range: string;
  params: PairsParams;
  startingCash?: number;
}

export function usePairsBacktest() {
  const [history, setHistory] = useState<PairsBacktestRun[]>([]);
  const [current, setCurrent] = useState<PairsBacktestRun | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    fetch("/api/backtest/pairs")
      .then((res) => safeJson<PairsBacktestRun[]>(res))
      .then((data: PairsBacktestRun[]) => setHistory(data))
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const run = useCallback(async (input: RunPairsBacktestInput) => {
    setRunning(true);
    setError(null);
    try {
      const data = await fetchWithProgress<PairsBacktestRun>(
        "/api/backtest/pairs",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        setProgress
      );
      setCurrent(data);
      setHistory((prev) => [data, ...prev]);
      return data as PairsBacktestRun;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairs backtest failed");
      return null;
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, []);

  const getReview = useCallback(async (id: string) => {
    setReviewLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/backtest/pairs/${id}/review`, { method: "POST" });
      const data = await safeJson<AiReview>(res);
      const patch = (run: PairsBacktestRun) => (run._id === id ? { ...run, aiReview: data } : run);
      setCurrent((prev) => (prev ? patch(prev) : prev));
      setHistory((prev) => prev.map(patch));
      return data as AiReview;
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI review failed");
      return null;
    } finally {
      setReviewLoading(false);
    }
  }, []);

  return { history, historyLoaded, current, setCurrent, running, progress, reviewLoading, error, run, getReview };
}
