"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ScreenerRow } from "@/lib/screener/types";
import { AiScreenerQuery } from "./ai-screener-query";

const HIGH_PE_THRESHOLD = 60;

type SortKey = "changePercent" | "price" | "peRatio" | "marketCap";

function formatMarketCap(value?: number): string {
  if (value == null) return "—";
  if (value >= 1e12) return `₹${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `₹${(value / 1e9).toFixed(2)}B`;
  return `₹${(value / 1e6).toFixed(0)}M`;
}

export function ScreenerPanel() {
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sector, setSector] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [maxPE, setMaxPE] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("changePercent");
  const [highlighted, setHighlighted] = useState<Set<string> | null>(null);

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null);

  async function load(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/screener${refresh ? "?refresh=true" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load screener data");
      setRows(data.rows);
      setFetchedAt(data.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load screener data");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  async function loadWatchlist() {
    const res = await fetch("/api/watchlist");
    const data = await res.json();
    setWatchlist(data.isNew ? [] : data.symbols);
  }

  useEffect(() => {
    load();
    loadWatchlist();
  }, []);

  async function addToWatchlist(symbol: string) {
    if (watchlist.includes(symbol)) return;
    setAddingSymbol(symbol);
    try {
      const next = [...watchlist, symbol];
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: next }),
      });
      if (!res.ok) throw new Error("Failed to add to watchlist");
      setWatchlist(next);
    } catch {
      setError(`Failed to add ${symbol} to watchlist`);
    } finally {
      setAddingSymbol(null);
    }
  }

  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector))].sort(), [rows]);

  const filtered = useMemo(() => {
    const min = Number(minPrice) || -Infinity;
    const max = Number(maxPrice) || Infinity;
    const peMax = Number(maxPE) || Infinity;
    return rows
      .filter((r) => (sector ? r.sector === sector : true))
      .filter((r) => r.price >= min && r.price <= max)
      .filter((r) => (r.peRatio == null ? true : r.peRatio <= peMax))
      .sort((a, b) => (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity));
  }, [rows, sector, minPrice, maxPrice, maxPE, sortKey]);

  return (
    <div className="w-full max-w-4xl flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Screener — Nifty 50</h1>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="rounded-full border border-black/[.08] dark:border-white/[.145] px-4 py-2 text-sm font-medium hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors disabled:opacity-40"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <AiScreenerQuery
        rows={rows}
        onResult={(symbols) => setHighlighted(new Set(symbols))}
        onClear={() => setHighlighted(null)}
      />

      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          aria-label="Filter by sector"
          className="rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        >
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          type="number"
          placeholder="Min price"
          aria-label="Minimum price"
          className="w-28 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <input
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          type="number"
          placeholder="Max price"
          aria-label="Maximum price"
          className="w-28 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <input
          value={maxPE}
          onChange={(e) => setMaxPE(e.target.value)}
          type="number"
          placeholder="Max P/E"
          aria-label="Maximum P/E ratio"
          className="w-28 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="Sort by"
          className="rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        >
          <option value="changePercent">Sort: % change</option>
          <option value="price">Sort: price</option>
          <option value="peRatio">Sort: P/E</option>
          <option value="marketCap">Sort: market cap</option>
        </select>
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145] max-h-[32rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-black/[.08] dark:border-white/[.145] text-left text-xs text-black/50 dark:text-white/50">
              <th className="p-3">Symbol</th>
              <th className="p-3">Sector</th>
              <th className="p-3 text-right">Price</th>
              <th className="p-3 text-right">Change</th>
              <th className="p-3 text-right">P/E</th>
              <th className="p-3 text-right">Mkt cap</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {!loaded &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-black/[.05] dark:border-white/[.05]">
                  <td className="p-3" colSpan={7}>
                    <div className="h-4 w-full animate-pulse rounded bg-black/[.05] dark:bg-white/[.06]" />
                  </td>
                </tr>
              ))}
            {loaded && filtered.length === 0 && (
              <tr>
                <td className="p-4 text-sm text-black/50 dark:text-white/50" colSpan={7}>
                  No stocks match these filters.
                </td>
              </tr>
            )}
            {filtered.map((row, i) => (
              <tr
                key={row.symbol}
                className={`border-b border-black/[.05] dark:border-white/[.05] last:border-0 ${
                  highlighted?.has(row.symbol)
                    ? "bg-yellow-500/10"
                    : i % 2 === 1
                      ? "bg-black/[.02] dark:bg-white/[.02]"
                      : ""
                }`}
              >
                <td className="p-3">
                  <Link
                    href={`/?symbol=${encodeURIComponent(row.symbol)}#chat`}
                    className="font-mono font-medium underline-offset-4 hover:underline"
                    title={`Research ${row.symbol} in AI Chat`}
                  >
                    {row.symbol}
                  </Link>
                  <div className="text-xs text-black/50 dark:text-white/50">{row.name}</div>
                </td>
                <td className="p-3 text-xs text-black/60 dark:text-white/60">{row.sector}</td>
                <td className="p-3 text-right font-mono">₹{row.price.toFixed(2)}</td>
                <td
                  className={`p-3 text-right font-mono ${
                    row.changePercent >= 0 ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {row.changePercent >= 0 ? "+" : ""}
                  {row.changePercent.toFixed(2)}%
                </td>
                <td
                  className={`p-3 text-right font-mono ${
                    row.peRatio != null && row.peRatio > HIGH_PE_THRESHOLD
                      ? "text-amber-600 dark:text-amber-400"
                      : ""
                  }`}
                  title={
                    row.peRatio != null && row.peRatio > HIGH_PE_THRESHOLD
                      ? "Unusually high P/E"
                      : undefined
                  }
                >
                  {row.peRatio != null ? row.peRatio.toFixed(1) : "—"}
                </td>
                <td className="p-3 text-right font-mono">{formatMarketCap(row.marketCap)}</td>
                <td className="p-3 text-right">
                  {watchlist.includes(row.symbol) ? (
                    <span className="text-xs text-green-600">✓ Added</span>
                  ) : (
                    <button
                      onClick={() => addToWatchlist(row.symbol)}
                      disabled={addingSymbol === row.symbol}
                      className="text-xs rounded-full border border-black/[.08] dark:border-white/[.145] px-3 py-1.5 hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors disabled:opacity-40"
                    >
                      {addingSymbol === row.symbol ? "Adding…" : "+ Watchlist"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fetchedAt && (
        <p className="text-xs text-black/40 dark:text-white/40">
          Data as of {new Date(fetchedAt).toLocaleString()} — cached for up to 10 minutes.
        </p>
      )}
    </div>
  );
}
