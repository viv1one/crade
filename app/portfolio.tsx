"use client";

import { useCallback, useEffect, useState } from "react";
import type { Trade, Holding } from "@/lib/paper-trading/types";

interface PortfolioProps {
  cash: number;
  holdings: Record<string, Holding>;
  trades: Trade[];
  error: string | null;
  onReset: () => void;
}

export function Portfolio({ cash, holdings, trades, error, onReset }: PortfolioProps) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const symbols = Object.keys(holdings);

  const refreshPrices = useCallback(async () => {
    if (symbols.length === 0) return;
    setLoading(true);
    try {
      const entries = await Promise.all(
        symbols.map(async (symbol) => {
          const res = await fetch(`/api/quote/${encodeURIComponent(symbol)}`);
          if (!res.ok) return null;
          const data = await res.json();
          return [symbol, data.price as number] as const;
        })
      );
      setPrices((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(",")]);

  useEffect(() => {
    refreshPrices();
  }, [refreshPrices]);

  const holdingsValue = symbols.reduce((sum, symbol) => {
    const price = prices[symbol] ?? holdings[symbol].avgCost;
    return sum + price * holdings[symbol].qty;
  }, 0);
  const totalValue = cash + holdingsValue;
  const totalPnl = totalValue - 100_000;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">Paper Portfolio</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshPrices}
            disabled={loading || symbols.length === 0}
            className="rounded-full border border-black/[.08] dark:border-white/[.145] px-4 py-2 text-sm font-medium hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors disabled:opacity-40"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            onClick={onReset}
            className="rounded-full border border-black/[.08] dark:border-white/[.145] px-4 py-2 text-sm font-medium text-black/60 dark:text-white/60 hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="grid grid-cols-3 gap-4 rounded-lg border border-black/[.08] dark:border-white/[.145] p-4">
        <div>
          <div className="text-xs text-black/50 dark:text-white/50">Cash</div>
          <div className="font-mono text-sm font-medium">₹{cash.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-black/50 dark:text-white/50">Total value</div>
          <div className="font-mono text-sm font-medium">₹{totalValue.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-black/50 dark:text-white/50">Total P&amp;L</div>
          <div
            className={`font-mono text-sm font-medium ${
              totalPnl >= 0 ? "text-green-600" : "text-red-500"
            }`}
          >
            {totalPnl >= 0 ? "+" : ""}₹{totalPnl.toFixed(2)}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Holdings</h3>
        <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145] rounded-lg border border-black/[.08] dark:border-white/[.145]">
          {symbols.length === 0 && (
            <li className="p-4 text-sm text-black/50 dark:text-white/50">
              No open positions — buy something from the watchlist above.
            </li>
          )}
          {symbols.map((symbol) => {
            const holding = holdings[symbol];
            const price = prices[symbol] ?? holding.avgCost;
            const pnl = (price - holding.avgCost) * holding.qty;
            const pnlPct = ((price - holding.avgCost) / holding.avgCost) * 100;
            return (
              <li key={symbol} className="flex items-center justify-between gap-4 p-4">
                <div className="flex flex-col">
                  <span className="font-mono text-sm font-medium">{symbol}</span>
                  <span className="text-xs text-black/50 dark:text-white/50">
                    {holding.qty} @ avg ₹{holding.avgCost.toFixed(2)}
                  </span>
                </div>
                <div
                  className={`text-xs text-right ${
                    pnl >= 0 ? "text-green-600" : "text-red-500"
                  }`}
                >
                  <div>
                    {pnl >= 0 ? "+" : ""}₹{pnl.toFixed(2)}
                  </div>
                  <div>
                    ({pnl >= 0 ? "+" : ""}
                    {pnlPct.toFixed(2)}%)
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Trade history</h3>
        <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145] rounded-lg border border-black/[.08] dark:border-white/[.145] max-h-64 overflow-y-auto">
          {trades.length === 0 && (
            <li className="p-4 text-sm text-black/50 dark:text-white/50">No trades yet.</li>
          )}
          {trades.map((trade) => (
            <li key={trade.id} className="flex items-center justify-between gap-4 p-3 text-xs">
              <span
                className={`font-medium ${
                  trade.side === "buy" ? "text-green-600" : "text-red-500"
                }`}
              >
                {trade.side.toUpperCase()}
              </span>
              <span className="font-mono">{trade.symbol}</span>
              <span>
                {trade.qty} @ ₹{trade.price.toFixed(2)}
              </span>
              {trade.realizedPnl !== undefined && (
                <span className={trade.realizedPnl >= 0 ? "text-green-600" : "text-red-500"}>
                  {trade.realizedPnl >= 0 ? "+" : ""}₹{trade.realizedPnl.toFixed(2)}
                </span>
              )}
              <span className="text-black/40 dark:text-white/40">
                {new Date(trade.timestamp).toLocaleTimeString()}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-black/40 dark:text-white/40">
        Simulated only — starting balance ₹1,00,000 fake cash, no real orders placed. For live
        trading, use your broker (e.g. Groww) directly.
      </p>
    </div>
  );
}
