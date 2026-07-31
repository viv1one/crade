"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BacktestMetrics,
  EquityPoint,
  PortfolioBacktestConfig,
  StrategyParams,
  SymbolContribution,
} from "@/lib/backtest/types";
import type { Trade } from "@/lib/paper-trading/types";
import type { AiReview } from "./use-backtest";

export interface PortfolioBacktestRun {
  _id: string;
  ownerId: string;
  config: PortfolioBacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  bySymbol: SymbolContribution[];
  aiReview?: AiReview;
  createdAt: string;
}

export interface RunPortfolioBacktestInput {
  symbols: string[];
  interval: string;
  range: string;
  strategyId: string;
  params: StrategyParams;
  startingCash?: number;
}

export function usePortfolioBacktest() {
  const [history, setHistory] = useState<PortfolioBacktestRun[]>([]);
  const [current, setCurrent] = useState<PortfolioBacktestRun | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    fetch("/api/backtest/portfolio")
      .then((res) => res.json())
      .then((data: PortfolioBacktestRun[]) => setHistory(data))
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const run = useCallback(async (input: RunPortfolioBacktestInput) => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/backtest/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Portfolio backtest failed");
      setCurrent(data);
      setHistory((prev) => [data, ...prev]);
      return data as PortfolioBacktestRun;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portfolio backtest failed");
      return null;
    } finally {
      setRunning(false);
    }
  }, []);

  const getReview = useCallback(async (id: string) => {
    setReviewLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/backtest/portfolio/${id}/review`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI review failed");
      const patch = (run: PortfolioBacktestRun) => (run._id === id ? { ...run, aiReview: data } : run);
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
