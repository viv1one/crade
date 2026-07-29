"use client";

import { useCallback, useEffect, useState } from "react";
import type { BacktestConfig, BacktestMetrics, EquityPoint, StrategyParams } from "@/lib/backtest/types";
import type { Trade } from "@/lib/paper-trading/types";

export interface AiReview {
  content: string;
  provider: string;
  model: string;
  createdAt: string;
}

export interface BacktestRun {
  _id: string;
  ownerId: string;
  config: BacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  aiReview?: AiReview;
  createdAt: string;
}

export interface RunBacktestInput {
  symbol: string;
  interval: string;
  range: string;
  strategyId: string;
  params: StrategyParams;
  startingCash?: number;
}

export function useBacktest() {
  const [history, setHistory] = useState<BacktestRun[]>([]);
  const [current, setCurrent] = useState<BacktestRun | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    fetch("/api/backtest")
      .then((res) => res.json())
      .then((data: BacktestRun[]) => setHistory(data))
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const run = useCallback(async (input: RunBacktestInput) => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Backtest failed");
      setCurrent(data);
      setHistory((prev) => [data, ...prev]);
      return data as BacktestRun;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backtest failed");
      return null;
    } finally {
      setRunning(false);
    }
  }, []);

  const getReview = useCallback(async (id: string) => {
    setReviewLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/backtest/${id}/review`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI review failed");
      const patch = (run: BacktestRun) => (run._id === id ? { ...run, aiReview: data } : run);
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

  return {
    history,
    historyLoaded,
    current,
    setCurrent,
    running,
    reviewLoading,
    error,
    run,
    getReview,
  };
}
