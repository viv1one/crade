"use client";

import { useCallback, useEffect, useState } from "react";
import type { Trade, Holding } from "@/lib/paper-trading/types";
import { STARTING_CASH } from "@/lib/paper-trading/types";
import type { EquityPoint } from "@/lib/backtest/types";
import { PortfolioDiagnostics } from "./portfolio-diagnostics";
import { Collapsible } from "./collapsible";
import { EquityChart } from "./backtest/equity-chart";
import { useBenchmarkCurve } from "./backtest/use-benchmark-curve";
import { safeJson } from "./fetch-json";

interface PortfolioProps {
  cash: number;
  holdings: Record<string, Holding>;
  trades: Trade[];
  equityCurve: EquityPoint[];
  error: string | null;
  loaded: boolean;
  onReset: () => void;
}

export function Portfolio({ cash, holdings, trades, equityCurve, error, loaded, onReset }: PortfolioProps) {
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
          const data = await safeJson<{ price: number }>(res).catch(() => null);
          return data ? ([symbol, data.price] as const) : null;
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
  const totalPnl = totalValue - STARTING_CASH;
  const { benchmarkCurve } = useBenchmarkCurve(equityCurve, STARTING_CASH);

  return (
    <div id="portfolio" className="w-full max-w-2xl flex flex-col gap-4 scroll-mt-8">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!loaded && <p className="text-sm text-foreground-muted">Loading portfolio…</p>}

      {loaded && (
        <>
          {/* The answer to "how am I doing?" first: three numbers. */}
          <div className="card grid grid-cols-3 gap-3 p-4">
            <div>
              <div className="text-xs text-foreground-muted">Cash</div>
              <div className="font-mono text-sm font-medium">₹{cash.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-xs text-foreground-muted">Total value</div>
              <div className="font-mono text-sm font-medium">₹{totalValue.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-xs text-foreground-muted">P&amp;L</div>
              <div className={`font-mono text-sm font-semibold ${totalPnl >= 0 ? "text-success" : "text-danger"}`}>
                {totalPnl >= 0 ? "+" : ""}₹{totalPnl.toFixed(0)}
              </div>
            </div>
          </div>

          <ul className="card flex flex-col divide-y divide-border overflow-hidden">
            {symbols.length === 0 && (
              <li className="p-4 text-sm text-foreground-muted">
                No open positions yet. Tap Buy on a stock in your watchlist to place your first simulated trade.
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
                    <span className="text-xs text-foreground-muted">
                      {holding.qty} @ avg ₹{holding.avgCost.toFixed(2)}
                    </span>
                  </div>
                  <div className={`text-sm font-semibold text-right ${pnl >= 0 ? "text-success" : "text-danger"}`}>
                    <div>
                      {pnl >= 0 ? "+" : ""}₹{pnl.toFixed(2)}
                    </div>
                    <div className="text-xs font-normal">
                      ({pnl >= 0 ? "+" : ""}
                      {pnlPct.toFixed(2)}%)
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Everything below is optional depth, one tap away. */}
          {equityCurve.length > 1 && (
            <Collapsible title="Performance">
              <p className="mb-2 text-xs text-foreground-muted">
                One point per trade, marked to the live quote at that moment — it only moves when you buy or sell.
              </p>
              <EquityChart equityCurve={equityCurve} startingCash={STARTING_CASH} benchmarkCurve={benchmarkCurve ?? undefined} />
            </Collapsible>
          )}

          <Collapsible title="Trade history" hint={trades.length > 0 ? `${trades.length}` : undefined}>
            <ul className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto">
              {trades.length === 0 && <li className="py-2 text-sm text-foreground-muted">No trades yet.</li>}
              {trades.map((trade) => (
                <li key={trade.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-xs">
                  <span className={`font-medium ${trade.side === "buy" ? "text-success" : "text-danger"}`}>
                    {trade.side.toUpperCase()}
                  </span>
                  <span className="font-mono">{trade.symbol}</span>
                  <span>
                    {trade.qty} @ ₹{trade.price.toFixed(2)}
                  </span>
                  {trade.realizedPnl !== undefined && (
                    <span className={trade.realizedPnl >= 0 ? "text-success" : "text-danger"}>
                      {trade.realizedPnl >= 0 ? "+" : ""}₹{trade.realizedPnl.toFixed(2)}
                    </span>
                  )}
                  <span className="text-foreground-muted">{new Date(trade.timestamp).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          </Collapsible>

          {symbols.length > 0 && (
            <Collapsible title="AI review of my portfolio">
              <PortfolioDiagnostics endpoint="/api/portfolio/diagnostics" hasHoldings />
            </Collapsible>
          )}

          <Collapsible variant="inline" title="What is paper trading?">
            <p className="text-xs text-foreground-muted">
              You start with ₹1,00,000 of fake cash. Buy and sell from your watchlist and each trade fills instantly at
              the latest quote — no real money, no broker, no orders. It&apos;s a safe way to test your instincts. To
              invest for real, use your own broker (e.g. Groww).
            </p>
          </Collapsible>

          <div className="flex items-center justify-between gap-2">
            <button onClick={refreshPrices} disabled={loading || symbols.length === 0} className="btn-secondary-sm">
              {loading ? "Refreshing…" : "Refresh prices"}
            </button>
            <button onClick={onReset} className="btn-secondary-sm text-danger">
              Reset to ₹1,00,000
            </button>
          </div>
        </>
      )}
    </div>
  );
}
