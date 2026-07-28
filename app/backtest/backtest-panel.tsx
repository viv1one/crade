"use client";

import { useEffect, useState } from "react";
import { STRATEGIES } from "@/lib/backtest/strategies";
import type { StrategyId, StrategyParams } from "@/lib/backtest/types";
import { DEFAULT_STARTING_CASH } from "@/lib/backtest/types";
import { EquityChart } from "./equity-chart";
import { useBacktest, type BacktestRun } from "../use-backtest";
import { usePortfolioBacktest, type PortfolioBacktestRun } from "../use-portfolio-backtest";
import { useWatchlist } from "../use-watchlist";
import { MarkdownContent } from "../markdown-content";

const INTERVALS = ["1d", "1wk", "1mo"];
const RANGES = ["3mo", "6mo", "1y", "2y", "5y"];
type Mode = "single" | "portfolio";

function defaultParams(strategyId: StrategyId): StrategyParams {
  const params: StrategyParams = {};
  for (const spec of STRATEGIES[strategyId].paramSchema) params[spec.key] = spec.default;
  return params;
}

function pct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function BacktestPanel() {
  const single = useBacktest();
  const portfolio = usePortfolioBacktest();
  const { symbols: watchlistSymbols } = useWatchlist();

  const [mode, setMode] = useState<Mode>("single");
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [symbolsInput, setSymbolsInput] = useState("");
  const [dataInterval, setDataInterval] = useState("1d");
  const [range, setRange] = useState("1y");
  const [strategyId, setStrategyId] = useState<StrategyId>("sma_crossover");
  const [params, setParams] = useState<StrategyParams>(defaultParams("sma_crossover"));

  // Pre-fill the basket from the user's watchlist the first time it loads.
  useEffect(() => {
    if (!symbolsInput && watchlistSymbols.length > 0) {
      setSymbolsInput(watchlistSymbols.join(", "));
    }
  }, [watchlistSymbols, symbolsInput]);

  function selectStrategy(id: StrategyId) {
    setStrategyId(id);
    setParams(defaultParams(id));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "single") {
      if (!symbol.trim()) return;
      single.run({
        symbol: symbol.trim().toUpperCase(),
        interval: dataInterval,
        range,
        strategyId,
        params,
        startingCash: DEFAULT_STARTING_CASH,
      });
    } else {
      const symbols = symbolsInput
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (symbols.length === 0) return;
      portfolio.run({
        symbols,
        interval: dataInterval,
        range,
        strategyId,
        params,
        startingCash: DEFAULT_STARTING_CASH,
      });
    }
  }

  const strategy = STRATEGIES[strategyId];
  const running = mode === "single" ? single.running : portfolio.running;
  const error = mode === "single" ? single.error : portfolio.error;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Backtest</h1>

      <div className="flex gap-2">
        {(["single", "portfolio"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`text-xs rounded-full border px-3 py-1.5 transition-colors ${
              mode === m
                ? "bg-foreground text-background border-foreground"
                : "border-black/[.08] dark:border-white/[.145] hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a]"
            }`}
          >
            {m === "single" ? "Single symbol" : "Portfolio (basket)"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-black/[.08] dark:border-white/[.145] p-4">
        <div className="flex gap-2">
          {mode === "single" ? (
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="Symbol, e.g. RELIANCE.NS"
              className="flex-1 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          ) : (
            <input
              value={symbolsInput}
              onChange={(e) => setSymbolsInput(e.target.value)}
              placeholder="Comma-separated symbols, e.g. RELIANCE.NS, TCS.NS"
              className="flex-1 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          )}
          <select
            value={dataInterval}
            onChange={(e) => setDataInterval(e.target.value)}
            className="rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-2 text-sm outline-none"
          >
            {INTERVALS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-2 text-sm outline-none"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {Object.values(STRATEGIES).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectStrategy(s.id)}
                className={`text-xs rounded-full border px-3 py-1.5 transition-colors ${
                  strategyId === s.id
                    ? "bg-foreground text-background border-foreground"
                    : "border-black/[.08] dark:border-white/[.145] hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a]"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-black/50 dark:text-white/50">{strategy.description}</p>

          <div className="flex flex-wrap gap-3">
            {strategy.paramSchema.map((spec) => (
              <label key={spec.key} className="flex flex-col gap-1 text-xs">
                {spec.label}
                <input
                  type="number"
                  min={spec.min}
                  max={spec.max}
                  value={params[spec.key] ?? spec.default}
                  onChange={(e) =>
                    setParams((prev) => ({ ...prev, [spec.key]: Number(e.target.value) }))
                  }
                  className="w-24 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground"
                />
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={running}
          className="self-start rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:bg-[#383838] dark:hover:bg-[#ccc] transition-colors disabled:opacity-40"
        >
          {running ? "Running…" : mode === "single" ? "Run Backtest" : "Run Portfolio Backtest"}
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {mode === "single" && single.current && (
        <BacktestResultView run={single.current} reviewLoading={single.reviewLoading} onReview={single.getReview} />
      )}
      {mode === "portfolio" && portfolio.current && <PortfolioResultView run={portfolio.current} />}

      <div>
        <h3 className="text-sm font-medium mb-2">Past runs</h3>
        <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145] rounded-lg border border-black/[.08] dark:border-white/[.145] max-h-64 overflow-y-auto">
          {mode === "single" ? (
            <>
              {!single.historyLoaded && (
                <li className="p-4 text-sm text-black/50 dark:text-white/50">Loading history…</li>
              )}
              {single.historyLoaded && single.history.length === 0 && (
                <li className="p-4 text-sm text-black/50 dark:text-white/50">No backtests run yet.</li>
              )}
              {single.history.map((run) => (
                <li key={run._id}>
                  <button
                    onClick={() => single.setCurrent(run)}
                    className="w-full flex items-center justify-between gap-4 p-3 text-xs text-left hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors"
                  >
                    <span className="font-mono">{run.config.symbol}</span>
                    <span className="text-black/50 dark:text-white/50">
                      {STRATEGIES[run.config.strategyId].name}
                    </span>
                    <span className={run.metrics.totalReturnPct >= 0 ? "text-green-600" : "text-red-500"}>
                      {pct(run.metrics.totalReturnPct)}
                    </span>
                    <span className="text-black/40 dark:text-white/40">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </>
          ) : (
            <>
              {!portfolio.historyLoaded && (
                <li className="p-4 text-sm text-black/50 dark:text-white/50">Loading history…</li>
              )}
              {portfolio.historyLoaded && portfolio.history.length === 0 && (
                <li className="p-4 text-sm text-black/50 dark:text-white/50">
                  No portfolio backtests run yet.
                </li>
              )}
              {portfolio.history.map((run) => (
                <li key={run._id}>
                  <button
                    onClick={() => portfolio.setCurrent(run)}
                    className="w-full flex items-center justify-between gap-4 p-3 text-xs text-left hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors"
                  >
                    <span className="font-mono truncate max-w-[10rem]">{run.config.symbols.join(", ")}</span>
                    <span className="text-black/50 dark:text-white/50">
                      {STRATEGIES[run.config.strategyId].name}
                    </span>
                    <span className={run.metrics.totalReturnPct >= 0 ? "text-green-600" : "text-red-500"}>
                      {pct(run.metrics.totalReturnPct)}
                    </span>
                    <span className="text-black/40 dark:text-white/40">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </>
          )}
        </ul>
      </div>

      <p className="text-xs text-black/40 dark:text-white/40">
        Backtests run against free Yahoo Finance historical data — prototyping only. Results are
        simulated, long-only, and do not account for slippage or brokerage charges. Portfolio mode
        splits starting cash equally across symbols and runs each independently. Not investment advice.
      </p>
    </div>
  );
}

function BacktestResultView({
  run,
  reviewLoading,
  onReview,
}: {
  run: BacktestRun;
  reviewLoading: boolean;
  onReview: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <MetricsGrid metrics={run.metrics} />
      <EquityChart equityCurve={run.equityCurve} startingCash={run.config.startingCash} />
      <TradeLog trades={run.trades} />

      <div className="flex flex-col gap-2">
        <button
          onClick={() => onReview(run._id)}
          disabled={reviewLoading}
          className="self-start rounded-lg border border-black/[.08] dark:border-white/[.145] px-4 py-2 text-sm font-medium hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors disabled:opacity-40"
        >
          {reviewLoading ? "Reviewing…" : run.aiReview ? "Refresh AI review" : "Get AI review"}
        </button>
        {run.aiReview && (
          <div className="rounded-lg border border-black/[.08] dark:border-white/[.145] p-4">
            <MarkdownContent content={run.aiReview.content} />
            <div className="mt-2 text-xs text-black/40 dark:text-white/40">
              {run.aiReview.provider}/{run.aiReview.model}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PortfolioResultView({ run }: { run: PortfolioBacktestRun }) {
  return (
    <div className="flex flex-col gap-4">
      <MetricsGrid metrics={run.metrics} />
      <EquityChart equityCurve={run.equityCurve} startingCash={run.config.startingCash} />

      <div>
        <h3 className="text-sm font-medium mb-2">Per-symbol contribution</h3>
        <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145] rounded-lg border border-black/[.08] dark:border-white/[.145]">
          {run.bySymbol.map((s) => (
            <li key={s.symbol} className="flex items-center justify-between gap-4 p-3 text-xs">
              <span className="font-mono font-medium">{s.symbol}</span>
              <span className="text-black/50 dark:text-white/50">
                ₹{s.startingCash.toFixed(0)} → ₹{s.finalEquity.toFixed(0)}
              </span>
              <span className={s.totalReturnPct >= 0 ? "text-green-600" : "text-red-500"}>
                {pct(s.totalReturnPct)}
              </span>
              <span className="text-black/40 dark:text-white/40">{s.tradeCount} trades</span>
            </li>
          ))}
        </ul>
      </div>

      <TradeLog trades={run.trades} showSymbol />
    </div>
  );
}

function MetricsGrid({ metrics }: { metrics: BacktestRun["metrics"] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg border border-black/[.08] dark:border-white/[.145] p-4">
      <Metric label="Total return" value={pct(metrics.totalReturnPct)} positive={metrics.totalReturnPct >= 0} />
      <Metric
        label="vs. buy & hold"
        value={pct(metrics.totalReturnPct - metrics.buyHoldReturnPct)}
        positive={metrics.totalReturnPct >= metrics.buyHoldReturnPct}
      />
      <Metric label="CAGR" value={pct(metrics.cagrPct)} positive={metrics.cagrPct >= 0} />
      <Metric label="Max drawdown" value={`-${metrics.maxDrawdownPct.toFixed(2)}%`} positive={false} />
      <Metric label="Sharpe" value={metrics.sharpe.toFixed(2)} positive={metrics.sharpe >= 0} />
      <Metric label="Win rate" value={`${metrics.winRatePct.toFixed(1)}%`} positive={metrics.winRatePct >= 50} />
      <Metric label="Trades" value={String(metrics.tradeCount)} />
      <Metric label="Final equity" value={`₹${metrics.finalEquity.toFixed(0)}`} />
    </div>
  );
}

function TradeLog({ trades, showSymbol }: { trades: BacktestRun["trades"]; showSymbol?: boolean }) {
  return (
    <div>
      <h3 className="text-sm font-medium mb-2">Trade log</h3>
      <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145] rounded-lg border border-black/[.08] dark:border-white/[.145] max-h-56 overflow-y-auto">
        {trades.length === 0 && (
          <li className="p-4 text-sm text-black/50 dark:text-white/50">No trades were made.</li>
        )}
        {trades.map((trade) => (
          <li key={trade.id} className="flex items-center justify-between gap-4 p-3 text-xs">
            <span className={`font-medium ${trade.side === "buy" ? "text-green-600" : "text-red-500"}`}>
              {trade.side.toUpperCase()}
            </span>
            {showSymbol && <span className="font-mono">{trade.symbol}</span>}
            <span>
              {trade.qty} @ ₹{trade.price.toFixed(2)}
            </span>
            {trade.realizedPnl !== undefined && (
              <span className={trade.realizedPnl >= 0 ? "text-green-600" : "text-red-500"}>
                {trade.realizedPnl >= 0 ? "+" : ""}₹{trade.realizedPnl.toFixed(2)}
              </span>
            )}
            <span className="text-black/40 dark:text-white/40">
              {new Date(trade.timestamp).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div>
      <div className="text-xs text-black/50 dark:text-white/50">{label}</div>
      <div
        className={`font-mono text-sm font-medium ${
          positive === undefined ? "" : positive ? "text-green-600" : "text-red-500"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
