"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Quote } from "@/lib/market-data";
import type { HistoricalBar } from "@/lib/market-data/types";
import { rsi, sma } from "@/lib/backtest/indicators";
import { useWatchlist } from "./use-watchlist";
import { Disclaimer } from "./disclaimer";
import { FREE_DATA_SOURCE, PAPER_TRADING_ONLY } from "@/lib/disclaimers";
import { SYMBOL_SUGGESTIONS_ID } from "./symbol-datalist";

function friendlyFetchError(raw: string): string {
  if (/request failed|providers failed|status \d{3}|fetch/i.test(raw)) {
    return "Couldn't fetch a quote — check the symbol is correct.";
  }
  return raw;
}

interface RowUiState {
  quote?: Quote;
  error?: string;
  loading: boolean;
  qtyInput: string;
}

interface IndicatorState {
  loading: boolean;
  rsi14?: number;
  sma20?: number;
  sma50?: number;
  error?: string;
}

const EMPTY_ROW: RowUiState = { loading: false, qtyInput: "1" };

function computeIndicators(bars: HistoricalBar[]): Omit<IndicatorState, "loading" | "error"> {
  const last = <T,>(values: (T | undefined)[]) => values[values.length - 1];
  return {
    rsi14: last(rsi(bars, 14)),
    sma20: last(sma(bars, 20)),
    sma50: last(sma(bars, 50)),
  };
}

interface WatchlistProps {
  onBuy: (symbol: string, qty: number, price: number) => void;
  onSell: (symbol: string, qty: number, price: number) => void;
}

export function Watchlist({ onBuy, onSell }: WatchlistProps) {
  const { symbols, addSymbol, removeSymbol, loaded, isNew } = useWatchlist();
  const [input, setInput] = useState("");
  const [rowState, setRowState] = useState<Record<string, RowUiState>>({});
  const [starterNoteDismissed, setStarterNoteDismissed] = useState(false);
  const [showIndicators, setShowIndicators] = useState(false);
  const [indicatorState, setIndicatorState] = useState<Record<string, IndicatorState>>({});
  const indicatorFetchedRef = useRef<Set<string>>(new Set());

  function getRow(symbol: string): RowUiState {
    return rowState[symbol] ?? EMPTY_ROW;
  }

  function patchRow(symbol: string, patch: Partial<RowUiState>) {
    setRowState((prev) => ({ ...prev, [symbol]: { ...getRow(symbol), ...patch } }));
  }

  async function fetchQuote(symbol: string) {
    patchRow(symbol, { loading: true, error: undefined });
    try {
      const res = await fetch(`/api/quote/${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch quote");
      patchRow(symbol, { quote: data, loading: false });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed to fetch quote";
      patchRow(symbol, {
        error: friendlyFetchError(raw),
        loading: false,
      });
    }
  }

  async function fetchIndicators(symbol: string) {
    setIndicatorState((prev) => ({ ...prev, [symbol]: { loading: true } }));
    try {
      const res = await fetch(`/api/history/${encodeURIComponent(symbol)}?interval=1d&range=6mo`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch history");
      setIndicatorState((prev) => ({ ...prev, [symbol]: { loading: false, ...computeIndicators(data.bars) } }));
    } catch {
      setIndicatorState((prev) => ({ ...prev, [symbol]: { loading: false, error: "Unavailable" } }));
    }
  }

  // Only fetch historical bars (a heavier request than a quote) once the
  // user actually asks to see indicators — not on every page load.
  useEffect(() => {
    if (!showIndicators) return;
    for (const symbol of symbols) {
      if (!indicatorFetchedRef.current.has(symbol)) {
        indicatorFetchedRef.current.add(symbol);
        fetchIndicators(symbol);
      }
    }
  }, [showIndicators, symbols]);

  function handleAddSymbol(e: React.FormEvent) {
    e.preventDefault();
    let symbol = input.trim().toUpperCase();
    if (!symbol) return;
    if (!symbol.includes(".")) symbol = `${symbol}.NS`;
    addSymbol(symbol);
    setInput("");
  }

  function refreshAll() {
    symbols.forEach((s) => fetchQuote(s));
  }

  // Auto-fetch a symbol's quote the first time it appears (initial load or
  // just added) instead of making the user click Fetch. fetchedRef tracks
  // which symbols have already been kicked off so this doesn't re-fetch on
  // every unrelated re-render — only genuinely new symbols trigger a call.
  const fetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!loaded) return;
    for (const symbol of symbols) {
      if (!fetchedRef.current.has(symbol)) {
        fetchedRef.current.add(symbol);
        fetchQuote(symbol);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, symbols]);

  function trade(symbol: string, side: "buy" | "sell") {
    const row = getRow(symbol);
    if (!row.quote || row.quote.stale) return;
    const qty = Math.floor(Number(row.qtyInput));
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (side === "buy") onBuy(symbol, qty, row.quote.price);
    else onSell(symbol, qty, row.quote.price);
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Watchlist</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIndicators((v) => !v)}
            aria-pressed={showIndicators}
            className={`btn-secondary-sm ${showIndicators ? "is-active" : ""}`}
          >
            RSI/SMA
          </button>
          <button
            onClick={refreshAll}
            disabled={!loaded}
            className="btn-secondary rounded-full disabled:opacity-40"
          >
            Refresh all
          </button>
        </div>
      </div>

      <form onSubmit={handleAddSymbol} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add symbol, e.g. RELIANCE.NS or Adani"
          aria-label="Add a stock symbol"
          list={SYMBOL_SUGGESTIONS_ID}
          className="input flex-1"
        />
        <button type="submit" className="btn-primary">
          Add
        </button>
      </form>

      {isNew && !starterNoteDismissed && (
        <p className="text-xs text-foreground-muted -mt-4">
          Starter picks — remove any you don&apos;t want.{" "}
          <button
            type="button"
            onClick={() => setStarterNoteDismissed(true)}
            className="underline underline-offset-4 hover:no-underline"
          >
            Dismiss
          </button>
        </p>
      )}

      <ul className="card flex flex-col divide-y divide-border overflow-hidden">
        {!loaded && (
          <li className="p-4 text-sm text-foreground-muted">Loading watchlist…</li>
        )}
        {loaded && symbols.length === 0 && (
          <li className="p-4 text-sm text-foreground-muted">
            No symbols yet — add one above.
          </li>
        )}
        {symbols.map((symbol) => {
          const row = getRow(symbol);
          return (
            <li key={symbol} className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <Link
                    href={`/?symbol=${encodeURIComponent(symbol)}#chat`}
                    className="font-mono text-sm font-medium underline-offset-4 hover:underline"
                    title={`Research ${symbol} in AI Chat`}
                  >
                    {symbol}
                  </Link>
                  {row.error && (
                    <span role="alert" className="text-xs text-danger">
                      {row.error}
                    </span>
                  )}
                  {row.quote && (
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`text-sm font-semibold ${
                          row.quote.change >= 0 ? "text-success" : "text-danger"
                        }`}
                      >
                        {row.quote.price.toFixed(2)} ({row.quote.change >= 0 ? "+" : ""}
                        {row.quote.changePercent.toFixed(2)}%)
                      </span>
                      {row.quote.stale && (
                        <span
                          className="badge badge-warning"
                          title="Live data unavailable — showing the last known price"
                        >
                          Stale
                        </span>
                      )}
                    </span>
                  )}
                  {showIndicators && (() => {
                    const ind = indicatorState[symbol];
                    if (!ind || ind.loading) {
                      return <span className="text-xs text-foreground-muted">Loading indicators…</span>;
                    }
                    if (ind.error) {
                      return <span className="text-xs text-foreground-muted">Indicators unavailable</span>;
                    }
                    const rsiValue = ind.rsi14;
                    const rsiFlag = rsiValue !== undefined && rsiValue < 30 ? " (oversold)" : rsiValue !== undefined && rsiValue > 70 ? " (overbought)" : "";
                    return (
                      <span className="text-xs text-foreground-muted">
                        RSI(14): {rsiValue !== undefined ? rsiValue.toFixed(0) : "—"}
                        {rsiFlag} · SMA20: {ind.sma20 !== undefined ? ind.sma20.toFixed(2) : "—"} · SMA50:{" "}
                        {ind.sma50 !== undefined ? ind.sma50.toFixed(2) : "—"}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchQuote(symbol)}
                    disabled={row.loading}
                    className="btn-secondary-sm"
                  >
                    {row.loading ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="spinner" aria-hidden="true" /> Loading…
                      </span>
                    ) : (
                      "Refresh"
                    )}
                  </button>
                  <button
                    onClick={() => removeSymbol(symbol)}
                    className="p-1 text-sm text-foreground-muted hover:text-danger transition-colors"
                    aria-label={`Remove ${symbol}`}
                    title={`Remove ${symbol}`}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={row.qtyInput}
                  onChange={(e) => patchRow(symbol, { qtyInput: e.target.value })}
                  className="input w-20 px-2 py-1 text-xs"
                  aria-label={`Quantity for ${symbol}`}
                />
                <button
                  onClick={() => trade(symbol, "buy")}
                  disabled={!row.quote || row.quote.stale}
                  className="btn-success-sm"
                  title={!row.quote ? "Waiting for a quote" : row.quote.stale ? "Quote is stale — can't trade on it" : undefined}
                >
                  Buy
                </button>
                <button
                  onClick={() => trade(symbol, "sell")}
                  disabled={!row.quote || row.quote.stale}
                  className="btn-danger-sm"
                  title={!row.quote ? "Waiting for a quote" : row.quote.stale ? "Quote is stale — can't trade on it" : undefined}
                >
                  Sell
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <Disclaimer>
        {FREE_DATA_SOURCE} {PAPER_TRADING_ONLY}
      </Disclaimer>
    </div>
  );
}
