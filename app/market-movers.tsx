"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ScreenerRow } from "@/lib/screener/types";

export function MarketMovers() {
  const [rows, setRows] = useState<ScreenerRow[] | null>(null);

  useEffect(() => {
    fetch("/api/screener")
      .then((res) => res.json())
      .then((data) => setRows(Array.isArray(data.rows) ? data.rows : []))
      .catch(() => setRows([]));
  }, []);

  if (rows === null || rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.slice(0, 3);
  const losers = sorted.slice(-3).reverse();

  return (
    <div className="w-full max-w-2xl flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground-muted">Nifty 50 movers</h2>
        <Link href="/screener" className="text-xs underline underline-offset-4 hover:no-underline">
          Full screener →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Top gainers</span>
          {gainers.map((r) => (
            <div key={r.symbol} className="flex items-center justify-between text-sm">
              <span className="font-mono">{r.symbol}</span>
              <span className="text-success font-mono">
                +{r.changePercent.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">Top losers</span>
          {losers.map((r) => (
            <div key={r.symbol} className="flex items-center justify-between text-sm">
              <span className="font-mono">{r.symbol}</span>
              <span className="text-danger font-mono">{r.changePercent.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
