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

export interface PortfolioBacktestRun {
  _id: string;
  ownerId: string;
  config: PortfolioBacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  bySymbol: SymbolContribution[];
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

  return { history, historyLoaded, current, setCurrent, running, error, run };
}
