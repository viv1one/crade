"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BacktestMetrics,
  CrossSectionalBacktestConfig,
  EquityPoint,
  StrategyParams,
} from "@/lib/backtest/types";
import type { Trade } from "@/lib/paper-trading/types";
import type { AiReview } from "./use-backtest";

export interface CrossSectionalBacktestRun {
  _id: string;
  ownerId: string;
  config: CrossSectionalBacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  aiReview?: AiReview;
  createdAt: string;
}

export interface RunCrossSectionalBacktestInput {
  strategyId: string;
  interval: string;
  range: string;
  params: StrategyParams;
  startingCash?: number;
}

export function useCrossSectionalBacktest() {
  const [history, setHistory] = useState<CrossSectionalBacktestRun[]>([]);
  const [current, setCurrent] = useState<CrossSectionalBacktestRun | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    fetch("/api/backtest/cross-sectional")
      .then((res) => res.json())
      .then((data: CrossSectionalBacktestRun[]) => setHistory(data))
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const run = useCallback(async (input: RunCrossSectionalBacktestInput) => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/backtest/cross-sectional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Cross-sectional backtest failed");
      setCurrent(data);
      setHistory((prev) => [data, ...prev]);
      return data as CrossSectionalBacktestRun;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cross-sectional backtest failed");
      return null;
    } finally {
      setRunning(false);
    }
  }, []);

  const getReview = useCallback(async (id: string) => {
    setReviewLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/backtest/cross-sectional/${id}/review`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI review failed");
      const patch = (run: CrossSectionalBacktestRun) => (run._id === id ? { ...run, aiReview: data } : run);
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
