"use client";

import { fetchWithProgress } from "@/lib/progress/client";
import type { ProgressUpdate } from "@/lib/progress/types";
import { Collapsible } from "../collapsible";
import { ProgressNote } from "../progress-note";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ScreenerRow } from "@/lib/screener/types";
import { AiScreenerQuery } from "./ai-screener-query";
import { BottomSheet } from "../bottom-sheet";
import { TradingAgentsRun } from "../trading-agents/trading-agents-run";
import { useToast } from "../toast-provider";
import { safeJson, errorMessage } from "../fetch-json";

const HIGH_PE_THRESHOLD = 60;

type SortKey = "changePercent" | "price" | "peRatio" | "marketCap";

function formatMarketCap(value?: number): string {
  if (value == null) return "—";
  if (value >= 1e12) return `₹${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `₹${(value / 1e9).toFixed(2)}B`;
  return `₹${(value / 1e6).toFixed(0)}M`;
}

type Universe = "nifty50" | "all_nse";

interface ScreenerPanelProps {
  // Set when arriving from a triggered-alert push notification's deep link
  // (see app/api/cron/evaluate-alerts/route.ts's formatMessage) — unlike
  // the AI query's `highlighted` (a non-destructive visual tint over the
  // full list), this actually FILTERS the row list down to just these
  // symbols, matching the spec's "a filtered Screener view showing only
  // the triggered stocks."
  initialHighlighted?: string[];
}

export function ScreenerPanel({ initialHighlighted }: ScreenerPanelProps = {}) {
  const { showToast } = useToast();
  const [universe, setUniverse] = useState<Universe>("nifty50");
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sector, setSector] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [maxPE, setMaxPE] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("changePercent");
  const [highlighted, setHighlighted] = useState<Set<string> | null>(
    initialHighlighted ? new Set(initialHighlighted) : null
  );
  const [onlyTriggered, setOnlyTriggered] = useState(!!initialHighlighted?.length);

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null);
  const [sheetSymbol, setSheetSymbol] = useState<string | null>(null);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  async function load(currentUniverse: Universe, refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (currentUniverse === "all_nse") params.set("universe", "all_nse");
      if (refresh) params.set("refresh", "true");
      const qs = params.toString();
      const data = await fetchWithProgress<{ rows: ScreenerRow[]; fetchedAt: string | null }>(
        `/api/screener${qs ? `?${qs}` : ""}`,
        {},
        setProgress
      );
      setRows(data.rows);
      setFetchedAt(data.fetchedAt);
    } catch (err) {
      setError(errorMessage(err, "Failed to load screener data"));
    } finally {
      setLoading(false);
      setProgress(null);
      setLoaded(true);
    }
  }

  async function loadWatchlist() {
    const res = await fetch("/api/watchlist");
    const data = await safeJson<{ isNew: boolean; symbols: string[] }>(res);
    setWatchlist(data.isNew ? [] : data.symbols);
  }

  useEffect(() => {
    load(universe);
  }, [universe]);

  useEffect(() => {
    loadWatchlist().catch(() => {});
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
      await safeJson(res);
      setWatchlist(next);
      showToast(`Added ${symbol} to your watchlist`, "success");
    } catch (err) {
      const message = `Couldn't add ${symbol} to your watchlist: ${errorMessage(err, "try again")}`;
      setError(message);
      showToast(message, "danger");
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
      .filter((r) => (onlyTriggered && highlighted ? highlighted.has(r.symbol) : true))
      .filter((r) => (sector ? r.sector === sector : true))
      .filter((r) => r.price >= min && r.price <= max)
      .filter((r) => (r.peRatio == null ? true : r.peRatio <= peMax))
      .sort((a, b) => (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity));
  }, [rows, sector, minPrice, maxPrice, maxPE, sortKey, onlyTriggered, highlighted]);

  const activeFilters = [sector, minPrice, maxPrice, maxPE].filter(Boolean).length;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Screener</h1>
          <p className="text-sm text-foreground-muted">Find stocks worth a closer look.</p>
        </div>
        <button
          onClick={() => (universe === "nifty50" ? load(universe, true) : load(universe))}
          disabled={loading}
          className="btn-secondary-sm shrink-0"
        >
          {loading ? "Loading…" : universe === "nifty50" ? "Refresh" : "Reload"}
        </button>
      </div>
      {loading && <ProgressNote progress={progress} fallback="Loading stock data…" />}

      {onlyTriggered && (
        <div className="alert-banner alert-banner-warning flex-row items-center justify-between">
          <p className="text-sm text-warning">
            Showing only the {highlighted?.size ?? 0} stock{highlighted?.size === 1 ? "" : "s"} from a
            triggered alert.
          </p>
          <button
            onClick={() => setOnlyTriggered(false)}
            className="text-xs text-foreground-muted hover:text-foreground transition-colors"
          >
            Clear filter
          </button>
        </div>
      )}

      <div className="segmented" role="tablist" aria-label="Screener universe">
        {(["nifty50", "all_nse"] as const).map((u) => (
          <button
            key={u}
            role="tab"
            aria-selected={universe === u}
            onClick={() => setUniverse(u)}
            className={`segmented-tab ${universe === u ? "is-active" : ""}`}
          >
            {u === "nifty50" ? "Nifty 50" : "All NSE (~2,000)"}
          </button>
        ))}
      </div>
      {universe === "all_nse" && (
        <p className="text-xs text-foreground-muted">Refreshed in the background, so rows can be a little different in age.</p>
      )}

      <Collapsible title="Ask in plain English" hint="AI picks">
        <AiScreenerQuery
          rows={rows}
          onResult={(symbols) => setHighlighted(new Set(symbols))}
          onClear={() => setHighlighted(null)}
        />
      </Collapsible>

      <Collapsible title="Filters" hint={activeFilters > 0 ? `${activeFilters} on` : "sector, price, P/E, sort"}>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Filter by sector" className="input">
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} type="number" placeholder="Min price" aria-label="Minimum price" className="input w-28" />
          <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} type="number" placeholder="Max price" aria-label="Maximum price" className="input w-28" />
          <input value={maxPE} onChange={(e) => setMaxPE(e.target.value)} type="number" placeholder="Max P/E" aria-label="Maximum P/E ratio" className="input w-28" />
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Sort by" className="input">
            <option value="changePercent">Sort: % change</option>
            <option value="price">Sort: price</option>
            <option value="peRatio">Sort: P/E</option>
            <option value="marketCap">Sort: market cap</option>
          </select>
        </div>
      </Collapsible>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {/* One tidy line per stock; tap a row for the details and actions. */}
      <ul className="card flex max-h-[34rem] flex-col divide-y divide-border overflow-y-auto">
        {!loaded &&
          Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="p-3">
              <div className="h-4 w-full animate-pulse rounded bg-background" />
            </li>
          ))}
        {loaded && filtered.length === 0 && (
          <li className="p-4 text-sm text-foreground-muted">No stocks match these filters.</li>
        )}
        {filtered.map((row) => {
          const open = expandedSymbol === row.symbol;
          return (
            <li key={row.symbol} className={highlighted?.has(row.symbol) ? "bg-yellow-500/10" : ""}>
              <button
                onClick={() => setExpandedSymbol(open ? null : row.symbol)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-background"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-sm font-medium">{row.symbol}</span>
                  <span className="block truncate text-xs text-foreground-muted">{row.name}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm">₹{row.price.toFixed(2)}</span>
                  <span className={`block font-mono text-xs ${row.changePercent >= 0 ? "text-success" : "text-danger"}`}>
                    {row.changePercent >= 0 ? "+" : ""}
                    {row.changePercent.toFixed(2)}%
                  </span>
                </span>
              </button>
              {open && (
                <div className="flex flex-col gap-2 px-3 pb-3">
                  <p className="text-xs text-foreground-muted">
                    {row.sector} · P/E {row.peRatio != null ? row.peRatio.toFixed(1) : "—"}
                    {row.peRatio != null && row.peRatio > HIGH_PE_THRESHOLD && (
                      <span className="badge badge-warning ml-1.5">High</span>
                    )}{" "}
                    · Mkt cap {formatMarketCap(row.marketCap)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {watchlist.includes(row.symbol) ? (
                      <span className="text-xs text-success">✓ On your watchlist</span>
                    ) : (
                      <button onClick={() => addToWatchlist(row.symbol)} disabled={addingSymbol === row.symbol} className="btn-secondary-sm">
                        {addingSymbol === row.symbol ? "Adding…" : "+ Watchlist"}
                      </button>
                    )}
                    <Link href={`/?symbol=${encodeURIComponent(row.symbol)}#chat`} className="btn-secondary-sm" title={`Research ${row.symbol} in AI Chat`}>
                      Ask AI
                    </Link>
                    <button
                      onClick={() => setSheetSymbol(row.symbol)}
                      className="btn-secondary-sm"
                      title={`Run the Trading Agents pipeline on ${row.symbol}`}
                    >
                      ⚡ Deep analysis
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {fetchedAt && (
        <p className="text-xs text-foreground-muted">
          {universe === "nifty50"
            ? `Data as of ${new Date(fetchedAt).toLocaleString()} — cached for up to 10 minutes.`
            : `Most recent row in this batch as of ${new Date(fetchedAt).toLocaleString()}.`}
        </p>
      )}

      <BottomSheet open={sheetSymbol != null} onClose={() => setSheetSymbol(null)} title={sheetSymbol ?? undefined}>
        {sheetSymbol && <TradingAgentsRun key={sheetSymbol} symbol={sheetSymbol} />}
      </BottomSheet>
    </div>
  );
}
