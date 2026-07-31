"use client";

import { useCallback, useEffect, useState } from "react";
import type { BacktestMetrics, EquityPoint, PairsBacktestConfig, PairsParams } from "@/lib/backtest/types";
import type { Trade } from "@/lib/paper-trading/types";
import type { AiReview } from "./use-backtest";

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
  const [reviewLoading, setReviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    fetch("/api/backtest/pairs")
      .then((res) => res.json())
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
      const res = await fetch("/api/backtest/pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Pairs backtest failed");
      setCurrent(data);
      setHistory((prev) => [data, ...prev]);
      return data as PairsBacktestRun;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairs backtest failed");
      return null;
    } finally {
      setRunning(false);
    }
  }, []);

  const getReview = useCallback(async (id: string) => {
    setReviewLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/backtest/pairs/${id}/review`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI review failed");
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

  return { history, historyLoaded, current, setCurrent, running, reviewLoading, error, run, getReview };
}
