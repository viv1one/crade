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

type Universe = "nifty50" | "all_nse";

export function ScreenerPanel() {
  const [universe, setUniverse] = useState<Universe>("nifty50");
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

  async function load(currentUniverse: Universe, refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (currentUniverse === "all_nse") params.set("universe", "all_nse");
      if (refresh) params.set("refresh", "true");
      const qs = params.toString();
      const res = await fetch(`/api/screener${qs ? `?${qs}` : ""}`);
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
    load(universe);
  }, [universe]);

  useEffect(() => {
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
        <h1 className="text-2xl font-semibold">
          Screener — {universe === "nifty50" ? "Nifty 50" : "All NSE stocks"}
        </h1>
        {universe === "nifty50" ? (
          <button
            onClick={() => load(universe, true)}
            disabled={loading}
            className="btn-secondary rounded-full disabled:opacity-40"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        ) : (
          <button
            onClick={() => load(universe)}
            disabled={loading}
            className="btn-secondary rounded-full disabled:opacity-40"
          >
            {loading ? "Loading…" : "Reload cached data"}
          </button>
        )}
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Screener universe">
        {(["nifty50", "all_nse"] as const).map((u) => (
          <button
            key={u}
            role="tab"
            aria-selected={universe === u}
            onClick={() => setUniverse(u)}
            className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
              universe === u
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:bg-background"
            }`}
          >
            {u === "nifty50" ? "Nifty 50" : "All NSE stocks (~2,000)"}
          </button>
        ))}
      </div>
      {universe === "all_nse" && (
        <p className="text-xs text-foreground-muted">
          Refreshed automatically in the background, roughly once an hour, in batches — rows may
          have slightly different freshnesses rather than one single snapshot moment.
        </p>
      )}

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
          className="input"
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
          className="input w-28"
        />
        <input
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          type="number"
          placeholder="Max price"
          aria-label="Maximum price"
          className="input w-28"
        />
        <input
          value={maxPE}
          onChange={(e) => setMaxPE(e.target.value)}
          type="number"
          placeholder="Max P/E"
          aria-label="Maximum P/E ratio"
          className="input w-28"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="Sort by"
          className="input"
        >
          <option value="changePercent">Sort: % change</option>
          <option value="price">Sort: price</option>
          <option value="peRatio">Sort: P/E</option>
          <option value="marketCap">Sort: market cap</option>
        </select>
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      <div className="card overflow-x-auto max-h-[32rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border text-left text-xs text-foreground-muted">
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
                <tr key={i} className="border-b border-border">
                  <td className="p-3" colSpan={7}>
                    <div className="h-4 w-full animate-pulse rounded bg-background" />
                  </td>
                </tr>
              ))}
            {loaded && filtered.length === 0 && (
              <tr>
                <td className="p-4 text-sm text-foreground-muted" colSpan={7}>
                  No stocks match these filters.
                </td>
              </tr>
            )}
            {filtered.map((row, i) => (
              <tr
                key={row.symbol}
                className={`border-b border-border last:border-0 ${
                  highlighted?.has(row.symbol)
                    ? "bg-yellow-500/10"
                    : i % 2 === 1
                      ? "bg-background/60"
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
                  <div className="text-xs text-foreground-muted">{row.name}</div>
                </td>
                <td className="p-3 text-xs text-foreground-muted">{row.sector}</td>
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
                      className="text-xs rounded-full border border-border px-3 py-1.5 hover:bg-background transition-colors disabled:opacity-40"
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
        <p className="text-xs text-foreground-muted">
          {universe === "nifty50"
            ? `Data as of ${new Date(fetchedAt).toLocaleString()} — cached for up to 10 minutes.`
            : `Most recent row in this batch as of ${new Date(fetchedAt).toLocaleString()}.`}
        </p>
      )}
    </div>
  );
}
