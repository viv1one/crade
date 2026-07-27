"use client";

import { useState } from "react";
import type { Quote } from "@/lib/market-data";

interface Row {
  symbol: string;
  quote?: Quote;
  error?: string;
  loading: boolean;
  qtyInput: string;
}

const DEFAULT_SYMBOLS = ["RELIANCE.NS", "TCS.NS", "INFY.NS"];

interface WatchlistProps {
  onBuy: (symbol: string, qty: number, price: number) => void;
  onSell: (symbol: string, qty: number, price: number) => void;
}

export function Watchlist({ onBuy, onSell }: WatchlistProps) {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>(
    DEFAULT_SYMBOLS.map((symbol) => ({ symbol, loading: false, qtyInput: "1" }))
  );

  async function fetchQuote(symbol: string) {
    setRows((prev) =>
      prev.map((r) => (r.symbol === symbol ? { ...r, loading: true, error: undefined } : r))
    );
    try {
      const res = await fetch(`/api/quote/${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch quote");
      setRows((prev) =>
        prev.map((r) =>
          r.symbol === symbol ? { ...r, quote: data, loading: false } : r
        )
      );
    } catch (err) {
      setRows((prev) =>
        prev.map((r) =>
          r.symbol === symbol
            ? {
                ...r,
                error: err instanceof Error ? err.message : "Failed to fetch quote",
                loading: false,
              }
            : r
        )
      );
    }
  }

  function addSymbol(e: React.FormEvent) {
    e.preventDefault();
    const symbol = input.trim().toUpperCase();
    if (!symbol) return;
    if (rows.some((r) => r.symbol === symbol)) {
      setInput("");
      return;
    }
    setRows((prev) => [...prev, { symbol, loading: false, qtyInput: "1" }]);
    setInput("");
  }

  function removeSymbol(symbol: string) {
    setRows((prev) => prev.filter((r) => r.symbol !== symbol));
  }

  function refreshAll() {
    rows.forEach((r) => fetchQuote(r.symbol));
  }

  function setQtyInput(symbol: string, qtyInput: string) {
    setRows((prev) => prev.map((r) => (r.symbol === symbol ? { ...r, qtyInput } : r)));
  }

  function trade(row: Row, side: "buy" | "sell") {
    if (!row.quote) return;
    const qty = Math.floor(Number(row.qtyInput));
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (side === "buy") onBuy(row.symbol, qty, row.quote.price);
    else onSell(row.symbol, qty, row.quote.price);
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Watchlist</h1>
        <button
          onClick={refreshAll}
          className="rounded-full border border-black/[.08] dark:border-white/[.145] px-4 py-2 text-sm font-medium hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors"
        >
          Refresh all
        </button>
      </div>

      <form onSubmit={addSymbol} className="flex gap-2">
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
        {rows.length === 0 && (
          <li className="p-4 text-sm text-black/50 dark:text-white/50">
            No symbols yet — add one above.
          </li>
        )}
        {rows.map((row) => (
          <li key={row.symbol} className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="font-mono text-sm font-medium">{row.symbol}</span>
                {row.error && (
                  <span className="text-xs text-red-500">{row.error}</span>
                )}
                {row.quote && (
                  <span
                    className={`text-xs ${
                      row.quote.change >= 0 ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {row.quote.price.toFixed(2)} ({row.quote.change >= 0 ? "+" : ""}
                    {row.quote.changePercent.toFixed(2)}%)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchQuote(row.symbol)}
                  disabled={row.loading}
                  className="text-xs rounded-full border border-black/[.08] dark:border-white/[.145] px-3 py-1.5 hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors disabled:opacity-50"
                >
                  {row.loading ? "Loading…" : "Fetch"}
                </button>
                <button
                  onClick={() => removeSymbol(row.symbol)}
                  className="text-xs text-black/50 dark:text-white/50 hover:text-red-500 transition-colors"
                  aria-label={`Remove ${row.symbol}`}
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
                onChange={(e) => setQtyInput(row.symbol, e.target.value)}
                className="w-20 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground"
                aria-label={`Quantity for ${row.symbol}`}
              />
              <button
                onClick={() => trade(row, "buy")}
                disabled={!row.quote}
                className="text-xs rounded-lg bg-green-600 text-white px-3 py-1.5 font-medium hover:bg-green-700 transition-colors disabled:opacity-40"
                title={row.quote ? undefined : "Fetch a quote first"}
              >
                Buy
              </button>
              <button
                onClick={() => trade(row, "sell")}
                disabled={!row.quote}
                className="text-xs rounded-lg bg-red-600 text-white px-3 py-1.5 font-medium hover:bg-red-700 transition-colors disabled:opacity-40"
                title={row.quote ? undefined : "Fetch a quote first"}
              >
                Sell
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-black/40 dark:text-white/40">
        Quotes via the free Yahoo Finance fallback provider — prototyping only, not licensed for
        redistribution. Buy/Sell are simulated paper trades, not real orders. See docs/plan.md §4.
      </p>
    </div>
  );
}
