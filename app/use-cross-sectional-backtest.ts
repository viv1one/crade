"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BacktestMetrics,
  CrossSectionalBacktestConfig,
  EquityPoint,
  StrategyParams,
} from "@/lib/backtest/types";
import type { Trade } from "@/lib/paper-trading/types";

export interface CrossSectionalBacktestRun {
  _id: string;
  ownerId: string;
  config: CrossSectionalBacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
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

  return { history, historyLoaded, current, setCurrent, running, error, run };
}
