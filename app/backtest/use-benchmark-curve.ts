"use client";

import { useEffect, useState } from "react";
import type { EquityPoint } from "@/lib/backtest/types";

// Confirmed live (2026-09-22) that ^NSEI (Yahoo's Nifty 50 index ticker)
// resolves through the existing market-data provider chain for both quote
// and historical — same "unofficial, not a stable contract" footing as
// every other free-provider symbol this app uses.
const NIFTY_INDEX_SYMBOL = "^NSEI";

// Fetches Nifty 50 index history and normalizes it into a buy-and-hold
// equity curve aligned index-for-index with the strategy's own
// `equityCurve` (same length, nearest-timestamp match per point) so
// EquityChart can plot both on the same x-scale without a separate time
// axis. Always fetches 2 years of daily bars (a safe superset of any
// backtest window this app runs) and filters/aligns client-side rather
// than trying to reverse-engineer the exact interval/range string a given
// backtest config used.
export function useBenchmarkCurve(equityCurve: EquityPoint[], startingCash: number) {
  const [benchmarkCurve, setBenchmarkCurve] = useState<EquityPoint[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (equityCurve.length === 0) {
      setBenchmarkCurve(null);
      return;
    }
    setLoading(true);
    fetch(`/api/history/${encodeURIComponent(NIFTY_INDEX_SYMBOL)}?interval=1d&range=2y`)
      .then((res) => res.json())
      .then((data: { bars?: { time: number; close: number }[] }) => {
        const bars = data.bars ?? [];
        if (bars.length === 0) {
          setBenchmarkCurve(null);
          return;
        }
        // Nearest-bar-at-or-before each equityCurve timestamp — a real
        // trading calendar has gaps (weekends/holidays) the strategy's own
        // bars share, so exact-timestamp matching would miss most points.
        const sortedBars = [...bars].sort((a, b) => a.time - b.time);
        function closestClose(targetTime: number): number {
          let result = sortedBars[0].close;
          for (const b of sortedBars) {
            if (b.time > targetTime) break;
            result = b.close;
          }
          return result;
        }
        const basePrice = closestClose(equityCurve[0].time);
        const aligned = equityCurve.map((p) => ({
          time: p.time,
          equity: basePrice !== 0 ? startingCash * (closestClose(p.time) / basePrice) : startingCash,
        }));
        setBenchmarkCurve(aligned);
      })
      .catch(() => setBenchmarkCurve(null))
      .finally(() => setLoading(false));
  }, [equityCurve, startingCash]);

  return { benchmarkCurve, loading };
}
