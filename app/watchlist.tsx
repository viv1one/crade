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
import { VERDICT_BADGE_CLASS, type AgentPipelineResult } from "@/lib/agents/types";
import { isVerdictStale } from "@/lib/agents/verdict-staleness";
import { useSwipeAction } from "./use-swipe-action";
import { useToast } from "./toast-provider";
import { NIFTY_50 } from "@/lib/screener/universe";
import { safeJson, errorMessage } from "./fetch-json";

interface AgentRunSummary {
  symbol: string;
  result: AgentPipelineResult;
  createdAt: string;
}

const VERDICT_LABEL: Record<string, string> = {
  buy: "BUY",
  sell: "SELL",
  hold: "HOLD",
  review: "?",
};

function friendlyFetchError(raw: string): string {
  if (/request failed|providers failed|status \d{3}|fetch/i.test(raw)) {
    return "Couldn't fetch a quote — the data source may be busy. Retry, or check the symbol.";
  }
  return raw;
}

const SUGGESTED = NIFTY_50.slice(0, 8);

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
  onBuy: (symbol: string, qty: number, price: number) => Promise<boolean>;
  onSell: (symbol: string, qty: number, price: number) => Promise<boolean>;
  // Why the last trade failed, read right after onBuy/onSell resolves false.
  getTradeError?: () => string | null;
}

interface WatchlistRowProps {
  symbol: string;
  row: RowUiState;
  verdict: AgentRunSummary | undefined;
  showIndicators: boolean;
  indicator: IndicatorState | undefined;
  executing: boolean;
  onFetchQuote: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onQtyChange: (symbol: string, qtyInput: string) => void;
  onTrade: (symbol: string, side: "buy" | "sell") => void;
}

// Extracted to its own component specifically so useSwipeAction (a hook)
// can be called once per row — hooks can't be called inside the parent's
// .map() callback. Swipe right = Buy, swipe left = Sell, layered as a
// progressive enhancement UNDER the existing tap Buy/Sell buttons below
// (never replacing them — see use-swipe-action.ts's own comment on why:
// swipe gestures can't be verified without real touch hardware here).
function WatchlistRow({
  symbol,
  row,
  verdict,
  showIndicators,
  indicator,
  executing,
  onFetchQuote,
  onRemove,
  onQtyChange,
  onTrade,
}: WatchlistRowProps) {
  const [open, setOpen] = useState(false);
  const canTrade = !!row.quote && !row.quote.stale && !executing;
  const qty = Math.floor(Number(row.qtyInput));
  const qtyValid = Number.isFinite(qty) && qty > 0;
  // Say WHY Buy/Sell is disabled in visible text (a title tooltip never
  // shows on touch), in priority order.
  const disabledReason = executing
    ? null
    : row.loading && !row.quote
      ? "Fetching a quote…"
      : row.error && !row.quote
        ? "No quote available — tap Refresh to retry."
        : !row.quote
          ? "Waiting for a quote…"
          : row.quote.stale
            ? "Live price unavailable — trading is paused until it's back (tap Refresh)."
            : !qtyValid
              ? "Enter a quantity of 1 or more."
              : null;
  const swipe = useSwipeAction({
    onSwipeRight: () => canTrade && qtyValid && onTrade(symbol, "buy"),
    onSwipeLeft: () => canTrade && qtyValid && onTrade(symbol, "sell"),
  });
  const revealOpacity = Math.min(Math.abs(swipe.translateX) / 80, 1);

  return (
    <li className="relative overflow-hidden">
      <div
        className={`absolute inset-0 flex items-center px-4 text-sm font-semibold text-white ${
          swipe.translateX > 0 ? "justify-start bg-success" : "justify-end bg-danger"
        }`}
        style={{ opacity: canTrade ? revealOpacity : 0 }}
        aria-hidden="true"
      >
        {swipe.translateX > 0 ? "Buy" : "Sell"}
      </div>
      <div
        className="relative bg-surface flex flex-col gap-2 p-4 touch-pan-y"
        style={{
          transform: `translateX(${swipe.translateX}px)`,
          transition: swipe.dragging ? "none" : "transform 0.2s ease",
        }}
        {...swipe.handlers}
      >
        {/* The row itself is just: what it is, its price, and the two actions.
            Everything else (quantity, refresh, remove, indicators) is behind the
            "more" toggle so a list of stocks reads as a list of stocks. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5">
              <Link
                href={`/?symbol=${encodeURIComponent(symbol)}#chat`}
                className="font-mono text-sm font-medium underline-offset-4 hover:underline"
                title={`Ask the AI about ${symbol}`}
              >
                {symbol}
              </Link>
              {verdict &&
                (() => {
                  const stale = isVerdictStale(verdict.createdAt);
                  const action = verdict.result.finalDecision.action;
                  return (
                    <Link
                      href={`/trading-agents?symbol=${encodeURIComponent(symbol)}`}
                      className={`badge ${stale ? "badge-neutral" : VERDICT_BADGE_CLASS[action]}`}
                      title={
                        stale
                          ? `Trading Agents called ${VERDICT_LABEL[action]} on ${new Date(verdict.createdAt).toLocaleDateString()} — over 48h old, re-run for a fresh read`
                          : `Trading Agents verdict from ${new Date(verdict.createdAt).toLocaleString()} — click to re-run`
                      }
                    >
                      {stale ? "Stale" : VERDICT_LABEL[action]}
                    </Link>
                  );
                })()}
            </span>
            {row.quote ? (
              <span className="flex items-center gap-1.5">
                <span className={`text-sm font-semibold ${row.quote.change >= 0 ? "text-success" : "text-danger"}`}>
                  {row.quote.price.toFixed(2)} ({row.quote.change >= 0 ? "+" : ""}
                  {row.quote.changePercent.toFixed(2)}%)
                </span>
                {row.quote.stale && (
                  <span className="badge badge-warning" title="Live data unavailable — showing the last known price">
                    Stale
                  </span>
                )}
              </span>
            ) : row.loading ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-foreground-muted">
                <span className="spinner" aria-hidden="true" /> Fetching…
              </span>
            ) : null}
            {row.error && (
              <span role="alert" className="text-xs text-danger">
                {row.error}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {executing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-foreground-muted">
                <span className="spinner" aria-hidden="true" /> Trading…
              </span>
            ) : (
              <>
                <button onClick={() => onTrade(symbol, "buy")} disabled={!canTrade || !qtyValid} className="btn-success-sm">
                  Buy
                </button>
                <button onClick={() => onTrade(symbol, "sell")} disabled={!canTrade || !qtyValid} className="btn-danger-sm">
                  Sell
                </button>
              </>
            )}
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} options for ${symbol}`}
              className="touch-target text-foreground-muted hover:text-foreground"
            >
              {open ? "▴" : "⋯"}
            </button>
          </div>
        </div>

        {/* Why the buttons are off, in words — only when they are. */}
        {disabledReason && <p className="text-xs text-foreground-muted">{disabledReason}</p>}

        {showIndicators &&
          (() => {
            if (!indicator || indicator.loading) {
              return <span className="text-xs text-foreground-muted">Loading indicators…</span>;
            }
            if (indicator.error) {
              return <span className="text-xs text-foreground-muted">Indicators unavailable</span>;
            }
            const rsiValue = indicator.rsi14;
            const rsiFlag =
              rsiValue !== undefined && rsiValue < 30 ? " (oversold)" : rsiValue !== undefined && rsiValue > 70 ? " (overbought)" : "";
            return (
              <span className="text-xs text-foreground-muted">
                RSI(14): {rsiValue !== undefined ? rsiValue.toFixed(0) : "—"}
                {rsiFlag} · SMA20: {indicator.sma20 !== undefined ? indicator.sma20.toFixed(2) : "—"} · SMA50:{" "}
                {indicator.sma50 !== undefined ? indicator.sma50.toFixed(2) : "—"}
              </span>
            );
          })()}

        {open && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <label className="flex items-center gap-2 text-xs text-foreground-muted">
              Quantity
              <input
                type="number"
                min={1}
                step={1}
                value={row.qtyInput}
                onChange={(e) => onQtyChange(symbol, e.target.value)}
                className="input w-20 px-2 py-1 text-xs"
                aria-label={`Quantity for ${symbol}`}
                disabled={executing}
              />
            </label>
            <button onClick={() => onFetchQuote(symbol)} disabled={row.loading} className="btn-secondary-sm">
              {row.loading ? "Fetching…" : "Refresh price"}
            </button>
            <button
              onClick={() => onRemove(symbol)}
              className="btn-secondary-sm text-danger"
              aria-label={`Remove ${symbol}`}
              title={`Remove ${symbol} from your watchlist`}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function Watchlist({ onBuy, onSell, getTradeError }: WatchlistProps) {
  const { symbols, addSymbol, removeSymbol, loaded } = useWatchlist();
  const { showToast } = useToast();
  const [input, setInput] = useState("");
  const [rowState, setRowState] = useState<Record<string, RowUiState>>({});
  const [showIndicators, setShowIndicators] = useState(false);
  const [indicatorState, setIndicatorState] = useState<Record<string, IndicatorState>>({});
  const indicatorFetchedRef = useRef<Set<string>>(new Set());
  const [latestVerdicts, setLatestVerdicts] = useState<Record<string, AgentRunSummary>>({});
  const [executingSymbol, setExecutingSymbol] = useState<string | null>(null);

  // Trading Agents verdicts for whichever symbols are watchlisted, from the
  // existing run-history endpoint (up to the 20 most recent runs for this
  // user, across all symbols — no new backend needed). Fetched once on
  // mount rather than re-fetched per row.
  useEffect(() => {
    fetch("/api/agents/run")
      .then((res) => safeJson<AgentRunSummary[]>(res))
      .then((data) => {
        if (!Array.isArray(data)) return;
        const bySymbol: Record<string, AgentRunSummary> = {};
        for (const run of data) {
          // API returns newest-first; keep only the first (most recent) run
          // seen per symbol.
          if (!bySymbol[run.symbol]) bySymbol[run.symbol] = run;
        }
        setLatestVerdicts(bySymbol);
      })
      .catch(() => {
        // Best-effort — a watchlist row with no verdict badge is a
        // reasonable degrade, not worth surfacing as an error.
      });
  }, []);

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
      const data = await safeJson<Quote>(res);
      patchRow(symbol, { quote: data, loading: false });
    } catch (err) {
      const raw = errorMessage(err, "Failed to fetch quote");
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
      const data = await safeJson<{ bars: HistoricalBar[] }>(res);
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
    showToast(`Added ${symbol} to your watchlist`, "success");
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

  // "Fetching live quote & executing…" — the row's Buy/Sell buttons swap
  // for a loader (see WatchlistRow's `executing` prop below) while this
  // awaits the server-authoritative fill, rather than the click looking
  // instant when the actual trade is genuinely still in flight.
  async function trade(symbol: string, side: "buy" | "sell") {
    const row = getRow(symbol);
    if (!row.quote || row.quote.stale || executingSymbol) return;
    const qty = Math.floor(Number(row.qtyInput));
    if (!Number.isFinite(qty) || qty <= 0) return;
    setExecutingSymbol(symbol);
    const ok = side === "buy" ? await onBuy(symbol, qty, row.quote.price) : await onSell(symbol, qty, row.quote.price);
    setExecutingSymbol(null);
    if (ok) {
      // The one toast for a successful trade doubles as the spec's "Trade
      // logged. What's your thesis?" prompt — tapping it opens the Journal
      // prefilled with this exact trade, rather than a second, separate
      // always-on card duplicating the same confirmation (that's what this
      // replaced — see app/page.tsx's history).
      showToast(`${side === "buy" ? "Bought" : "Sold"} ${qty} ${symbol} @ ₹${row.quote.price.toFixed(2)}. What's your thesis?`, {
        variant: "success",
        href: `/journal?symbol=${encodeURIComponent(symbol)}&action=${side}&price=${row.quote.price}`,
        linkLabel: "Log it",
      });
    } else {
      showToast(`Trade failed for ${symbol}: ${getTradeError?.() ?? "please try again"}`, "danger");
    }
  }

  return (
    <div id="watchlist" className="w-full max-w-2xl flex flex-col gap-4 scroll-mt-8">
      <form onSubmit={handleAddSymbol} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add symbol, e.g. ITC.NS"
          aria-label="Add a stock symbol"
          list={SYMBOL_SUGGESTIONS_ID}
          className="input flex-1"
        />
        <button type="submit" className="btn-primary">
          Add
        </button>
      </form>

      <ul className="card flex flex-col divide-y divide-border overflow-hidden">
        {!loaded && (
          <li className="p-4 text-sm text-foreground-muted">Loading watchlist…</li>
        )}
        {loaded && symbols.length === 0 && (
          <li className="p-4 flex flex-col gap-3">
            <span className="text-sm text-foreground-muted">
              Your watchlist is empty. Add your first stock above, or tap a popular one:
            </span>
            <span className="flex flex-wrap gap-2">
              {SUGGESTED.filter((s) => !symbols.includes(s.symbol)).map((s) => (
                <button
                  key={s.symbol}
                  type="button"
                  onClick={() => {
                    addSymbol(s.symbol);
                    showToast(`Added ${s.symbol} to your watchlist`, "success");
                  }}
                  className="btn-secondary-sm"
                  title={s.name}
                >
                  + {s.symbol.replace(".NS", "")}
                </button>
              ))}
            </span>
          </li>
        )}
        {symbols.map((symbol) => (
          <WatchlistRow
            key={symbol}
            symbol={symbol}
            row={getRow(symbol)}
            verdict={latestVerdicts[symbol]}
            showIndicators={showIndicators}
            indicator={indicatorState[symbol]}
            executing={executingSymbol === symbol}
            onFetchQuote={fetchQuote}
            onRemove={removeSymbol}
            onQtyChange={(sym, qtyInput) => patchRow(sym, { qtyInput })}
            onTrade={trade}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIndicators((v) => !v)}
            aria-pressed={showIndicators}
            className={`btn-secondary-sm ${showIndicators ? "is-active" : ""}`}
          >
            RSI / SMA
          </button>
          <button onClick={refreshAll} disabled={!loaded} className="btn-secondary-sm">
            Refresh all
          </button>
        </div>
      </div>

      <Disclaimer collapsible>
        {FREE_DATA_SOURCE} {PAPER_TRADING_ONLY}
      </Disclaimer>
    </div>
  );
}
