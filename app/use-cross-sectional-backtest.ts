"use client";

import { fetchWithProgress } from "@/lib/progress/client";
import type { ProgressUpdate } from "@/lib/progress/types";
import { useCallback, useEffect, useState } from "react";
import type {
  BacktestMetrics,
  CrossSectionalBacktestConfig,
  EquityPoint,
  StrategyParams,
} from "@/lib/backtest/types";
import type { Trade } from "@/lib/paper-trading/types";
import type { AiReview } from "./use-backtest";
import { safeJson, errorMessage } from "./fetch-json";

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
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    fetch("/api/backtest/cross-sectional")
      .then((res) => safeJson<CrossSectionalBacktestRun[]>(res))
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
      const data = await fetchWithProgress<CrossSectionalBacktestRun>(
        "/api/backtest/cross-sectional",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        setProgress
      );
      setCurrent(data);
      setHistory((prev) => [data, ...prev]);
      return data as CrossSectionalBacktestRun;
    } catch (err) {
      setError(errorMessage(err, "Cross-sectional backtest failed"));
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
      const res = await fetch(`/api/backtest/cross-sectional/${id}/review`, { method: "POST" });
      const data = await safeJson<AiReview>(res);
      const patch = (run: CrossSectionalBacktestRun) => (run._id === id ? { ...run, aiReview: data } : run);
      setCurrent((prev) => (prev ? patch(prev) : prev));
      setHistory((prev) => prev.map(patch));
      return data as AiReview;
    } catch (err) {
      setError(errorMessage(err, "AI review failed"));
      return null;
    } finally {
      setReviewLoading(false);
    }
  }, []);

  return { history, historyLoaded, current, setCurrent, running, progress, reviewLoading, error, run, getReview };
}
