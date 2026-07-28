"use client";

import { useState } from "react";
import type { Quote } from "@/lib/market-data";
import { useWatchlist } from "./use-watchlist";

interface RowUiState {
  quote?: Quote;
  error?: string;
  loading: boolean;
  qtyInput: string;
}

const EMPTY_ROW: RowUiState = { loading: false, qtyInput: "1" };

interface WatchlistProps {
  onBuy: (symbol: string, qty: number, price: number) => void;
  onSell: (symbol: string, qty: number, price: number) => void;
}

export function Watchlist({ onBuy, onSell }: WatchlistProps) {
  const { symbols, addSymbol, removeSymbol, loaded } = useWatchlist();
  const [input, setInput] = useState("");
  const [rowState, setRowState] = useState<Record<string, RowUiState>>({});

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
      patchRow(symbol, {
        error: err instanceof Error ? err.message : "Failed to fetch quote",
        loading: false,
      });
    }
  }

  function handleAddSymbol(e: React.FormEvent) {
    e.preventDefault();
    const symbol = input.trim().toUpperCase();
    if (!symbol) return;
    addSymbol(symbol);
    setInput("");
  }

  function refreshAll() {
    symbols.forEach((s) => fetchQuote(s));
  }

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
        <button
          onClick={refreshAll}
          disabled={!loaded}
          className="rounded-full border border-black/[.08] dark:border-white/[.145] px-4 py-2 text-sm font-medium hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors disabled:opacity-40"
        >
          Refresh all
        </button>
      </div>

      <form onSubmit={handleAddSymbol} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add symbol, e.g. HDFCBANK.NS"
          className="flex-1 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <button
          type="submit"
          className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:bg-[#383838] dark:hover:bg-[#ccc] transition-colors"
        >
          Add
        </button>
      </form>

      <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145] rounded-lg border border-black/[.08] dark:border-white/[.145]">
        {!loaded && (
          <li className="p-4 text-sm text-black/50 dark:text-white/50">Loading watchlist…</li>
        )}
        {loaded && symbols.length === 0 && (
          <li className="p-4 text-sm text-black/50 dark:text-white/50">
            No symbols yet — add one above.
          </li>
        )}
        {symbols.map((symbol) => {
          const row = getRow(symbol);
          return (
            <li key={symbol} className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="font-mono text-sm font-medium">{symbol}</span>
                  {row.error && <span className="text-xs text-red-500">{row.error}</span>}
                  {row.quote && (
                    <span
                      className={`text-xs ${
                        row.quote.change >= 0 ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {row.quote.price.toFixed(2)} ({row.quote.change >= 0 ? "+" : ""}
                      {row.quote.changePercent.toFixed(2)}%)
                      {row.quote.stale && (
                        <span
                          className="ml-1 text-yellow-600"
                          title="Live data unavailable — showing the last known price"
                        >
                          (stale)
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchQuote(symbol)}
                    disabled={row.loading}
                    className="text-xs rounded-full border border-black/[.08] dark:border-white/[.145] px-3 py-1.5 hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors disabled:opacity-50"
                  >
                    {row.loading ? "Loading…" : "Fetch"}
                  </button>
                  <button
                    onClick={() => removeSymbol(symbol)}
                    className="text-xs text-black/50 dark:text-white/50 hover:text-red-500 transition-colors"
                    aria-label={`Remove ${symbol}`}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={row.qtyInput}
                  onChange={(e) => patchRow(symbol, { qtyInput: e.target.value })}
                  className="w-20 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground"
                  aria-label={`Quantity for ${symbol}`}
                />
                <button
                  onClick={() => trade(symbol, "buy")}
                  disabled={!row.quote || row.quote.stale}
                  className="text-xs rounded-lg bg-green-600 text-white px-3 py-1.5 font-medium hover:bg-green-700 transition-colors disabled:opacity-40"
                  title={!row.quote ? "Fetch a quote first" : row.quote.stale ? "Quote is stale — can't trade on it" : undefined}
                >
                  Buy
                </button>
                <button
                  onClick={() => trade(symbol, "sell")}
                  disabled={!row.quote || row.quote.stale}
                  className="text-xs rounded-lg bg-red-600 text-white px-3 py-1.5 font-medium hover:bg-red-700 transition-colors disabled:opacity-40"
                  title={!row.quote ? "Fetch a quote first" : row.quote.stale ? "Quote is stale — can't trade on it" : undefined}
                >
                  Sell
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-black/40 dark:text-white/40">
        Quotes via the free Yahoo Finance fallback provider — prototyping only, not licensed for
        redistribution. Buy/Sell are simulated paper trades, not real orders. See docs/plan.md §4.
      </p>
    </div>
  );
}
