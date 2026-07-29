"use client";

import { useCallback, useEffect, useState } from "react";
import type { BacktestMetrics, EquityPoint, PairsBacktestConfig, PairsParams } from "@/lib/backtest/types";
import type { Trade } from "@/lib/paper-trading/types";

export interface PairsBacktestRun {
  _id: string;
  ownerId: string;
  config: PairsBacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
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

  return { history, historyLoaded, current, setCurrent, running, error, run };
}
