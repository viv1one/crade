"use client";

import { useEffect, useState } from "react";
import { STRATEGIES } from "@/lib/backtest/strategies";
import type {
  LeaderboardResult,
  PairsParams,
  StrategyDef,
  StrategyId,
  StrategyParams,
} from "@/lib/backtest/types";
import { DEFAULT_STARTING_CASH } from "@/lib/backtest/types";
import { EquityChart } from "./equity-chart";
import { useBacktest, type AiReview, type BacktestRun } from "../use-backtest";
import { usePortfolioBacktest, type PortfolioBacktestRun } from "../use-portfolio-backtest";
import { useCrossSectionalBacktest, type CrossSectionalBacktestRun } from "../use-cross-sectional-backtest";
import { usePairsBacktest, type PairsBacktestRun } from "../use-pairs-backtest";
import { useStrategyLeaderboard } from "../use-strategy-leaderboard";
import { useWatchlist } from "../use-watchlist";
import { MarkdownContent } from "../markdown-content";
import { Disclaimer } from "../disclaimer";
import { NOT_INVESTMENT_ADVICE, BACKTESTED_NOT_PREDICTIVE } from "@/lib/disclaimers";
import { SymbolDatalist, SYMBOL_SUGGESTIONS_ID } from "../symbol-datalist";

const INTERVALS = ["1d", "1wk", "1mo"];
const RANGES = ["3mo", "6mo", "1y", "2y", "5y"];
type Mode = "single" | "portfolio" | "cross_sectional" | "pairs" | "leaderboard";

const MODE_LABELS: Record<Mode, string> = {
  single: "Single symbol",
  portfolio: "Portfolio (basket)",
  cross_sectional: "Cross-sectional (NIFTY 50)",
  pairs: "Pairs",
  leaderboard: "Strategy leaderboard",
};

const MODE_BLURBS: Record<Mode, string> = {
  single: "Test one strategy against one stock's own price history.",
  portfolio: "Run the same strategy across a basket of stocks at once, with starting cash split equally.",
  cross_sectional: "Rank all NIFTY 50 stocks against each other and hold the top performers — a 'pick the best of the bunch' approach, not tied to any one stock.",
  pairs: "Bets on two related stocks' prices converging again — a market-neutral trade (one long, one short), not a directional bet on either stock alone.",
  leaderboard: "Backtests every stock-ranking strategy over the same period and shows which performed best historically, plus what each currently holds. Not a prediction of future returns.",
};

const DEFAULT_PAIRS_PARAMS: PairsParams = { lookback: 20, entryZ: 2, exitZ: 0.5 };

function groupByFamily(strategies: StrategyDef[]): [string, StrategyDef[]][] {
  const groups = new Map<string, StrategyDef[]>();
  for (const s of strategies) {
    const key = s.family ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return Array.from(groups.entries());
}

function defaultParams(strategyId: StrategyId): StrategyParams {
  const params: StrategyParams = {};
  for (const spec of STRATEGIES[strategyId].paramSchema) params[spec.key] = spec.default;
  return params;
}

function firstStrategyOfKind(kind: "single_symbol" | "cross_sectional"): StrategyId | null {
  const match = Object.values(STRATEGIES).find((s) => s.kind === kind);
  return match?.id ?? null;
}

function pct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function BacktestPanel() {
  const single = useBacktest();
  const portfolio = usePortfolioBacktest();
  const crossSectional = useCrossSectionalBacktest();
  const pairs = usePairsBacktest();
  const leaderboard = useStrategyLeaderboard();
  const { symbols: watchlistSymbols } = useWatchlist();

  const [mode, setMode] = useState<Mode>("single");
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [symbolsInput, setSymbolsInput] = useState("");
  const [symbolA, setSymbolA] = useState("HDFCBANK.NS");
  const [symbolB, setSymbolB] = useState("ICICIBANK.NS");
  const [pairsParams, setPairsParams] = useState<PairsParams>(DEFAULT_PAIRS_PARAMS);
  const [dataInterval, setDataInterval] = useState("1d");
  const [range, setRange] = useState("1y");
  const [strategyId, setStrategyId] = useState<StrategyId | null>("sma_crossover");
  const [params, setParams] = useState<StrategyParams>(defaultParams("sma_crossover"));

  // Pre-fill the basket from the user's watchlist the first time it loads.
  useEffect(() => {
    if (!symbolsInput && watchlistSymbols.length > 0) {
      setSymbolsInput(watchlistSymbols.join(", "));
    }
  }, [watchlistSymbols, symbolsInput]);

  const visibleStrategies = Object.values(STRATEGIES).filter((s) =>
    mode === "cross_sectional" ? s.kind === "cross_sectional" : s.kind === "single_symbol"
  );

  function switchMode(m: Mode) {
    setMode(m);
    if (m === "cross_sectional" && (!strategyId || STRATEGIES[strategyId]?.kind !== "cross_sectional")) {
      const id = firstStrategyOfKind("cross_sectional");
      setStrategyId(id);
      if (id) setParams(defaultParams(id));
    } else if ((m === "single" || m === "portfolio") && (!strategyId || STRATEGIES[strategyId]?.kind !== "single_symbol")) {
      const id = firstStrategyOfKind("single_symbol");
      setStrategyId(id);
      if (id) setParams(defaultParams(id));
    }
  }

  function selectStrategy(id: StrategyId) {
    setStrategyId(id);
    setParams(defaultParams(id));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "single") {
      if (!symbol.trim() || !strategyId) return;
      single.run({
        symbol: symbol.trim().toUpperCase(),
        interval: dataInterval,
        range,
        strategyId,
        params,
        startingCash: DEFAULT_STARTING_CASH,
      });
    } else if (mode === "portfolio") {
      const symbols = symbolsInput
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (symbols.length === 0 || !strategyId) return;
      portfolio.run({
        symbols,
        interval: dataInterval,
        range,
        strategyId,
        params,
        startingCash: DEFAULT_STARTING_CASH,
      });
    } else if (mode === "cross_sectional") {
      if (!strategyId) return;
      crossSectional.run({
        strategyId,
        interval: dataInterval,
        range,
        params,
        startingCash: DEFAULT_STARTING_CASH,
      });
    } else if (mode === "pairs") {
      if (!symbolA.trim() || !symbolB.trim()) return;
      pairs.run({
        symbolA: symbolA.trim().toUpperCase(),
        symbolB: symbolB.trim().toUpperCase(),
        interval: dataInterval,
        range,
        params: pairsParams,
        startingCash: DEFAULT_STARTING_CASH,
      });
    } else {
      leaderboard.run(dataInterval, range);
    }
  }

  const strategy = strategyId ? STRATEGIES[strategyId] : null;
  const running =
    mode === "single" ? single.running
    : mode === "portfolio" ? portfolio.running
    : mode === "cross_sectional" ? crossSectional.running
    : mode === "pairs" ? pairs.running
    : leaderboard.running;
  const error =
    mode === "single" ? single.error
    : mode === "portfolio" ? portfolio.error
    : mode === "cross_sectional" ? crossSectional.error
    : mode === "pairs" ? pairs.error
    : leaderboard.error;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">
      <SymbolDatalist />
      <h1 className="text-2xl font-semibold">Backtest</h1>

      <div className="flex gap-2 flex-wrap">
        {(["single", "portfolio", "cross_sectional", "pairs", "leaderboard"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            aria-pressed={mode === m}
            className={`text-xs rounded-full border px-3 py-1.5 transition-colors ${
              mode === m
                ? "bg-foreground text-background border-foreground"
                : "border-border hover:bg-background"
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <p className="text-xs text-foreground-muted -mt-4">{MODE_BLURBS[mode]}</p>

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-4">
        <div className="flex gap-2">
          {mode === "single" && (
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="Symbol, e.g. RELIANCE.NS or Adani"
              aria-label="Symbol"
              list={SYMBOL_SUGGESTIONS_ID}
              className="flex-1 input"
            />
          )}
          {mode === "portfolio" && (
            <input
              value={symbolsInput}
              onChange={(e) => setSymbolsInput(e.target.value)}
              placeholder="Comma-separated symbols, e.g. RELIANCE.NS, TCS.NS"
              aria-label="Comma-separated symbols"
              className="flex-1 input"
            />
          )}
          {mode === "cross_sectional" && (
            <p className="flex-1 text-xs text-foreground-muted self-center">
              Ranks and rebalances across the full NIFTY 50 universe — no symbol to pick.
            </p>
          )}
          {mode === "leaderboard" && (
            <p className="flex-1 text-xs text-foreground-muted self-center">
              Runs every cross-sectional strategy across the full NIFTY 50 universe — no symbol or
              strategy to pick.
            </p>
          )}
          {mode === "pairs" && (
            <div className="flex-1 flex gap-2">
              <input
                value={symbolA}
                onChange={(e) => setSymbolA(e.target.value)}
                placeholder="Symbol A, e.g. HDFCBANK.NS or Adani"
                aria-label="Symbol A"
                list={SYMBOL_SUGGESTIONS_ID}
                className="flex-1 input"
              />
              <input
                value={symbolB}
                onChange={(e) => setSymbolB(e.target.value)}
                placeholder="Symbol B, e.g. ICICIBANK.NS or Adani"
                aria-label="Symbol B"
                list={SYMBOL_SUGGESTIONS_ID}
                className="flex-1 input"
              />
            </div>
          )}
          <select
            value={dataInterval}
            onChange={(e) => setDataInterval(e.target.value)}
            className="input px-2 py-2"
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
            className="input px-2 py-2"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {mode !== "pairs" && mode !== "leaderboard" && (
          <div className="flex flex-col gap-3">
            {visibleStrategies.length === 0 && (
              <p className="text-xs text-foreground-muted">
                No cross-sectional strategies are wired up yet.
              </p>
            )}
            {groupByFamily(visibleStrategies).map(([family, strategiesInFamily]) => (
              <div key={family} className="flex flex-col gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-foreground-muted">
                  {family}
                </span>
                <div className="flex flex-wrap gap-2">
                  {strategiesInFamily.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectStrategy(s.id)}
                      aria-pressed={strategyId === s.id}
                      className={`text-xs rounded-full border px-3 py-1.5 transition-colors ${
                        strategyId === s.id
                          ? "bg-foreground text-background border-foreground"
                          : "border-border hover:bg-background"
                      }`}
                    >
                      {s.name}
                      {s.approximation && (
                        <span
                          title="Proxy: approximates data no current provider actually returns — see the note below once selected"
                          className="ml-1.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium"
                        >
                          Proxy
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {strategy && <p className="text-xs text-foreground-muted">{strategy.description}</p>}
            {strategy?.approximation && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{strategy.approximation}</p>
            )}

            {strategy && (
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
                      className="input w-24 px-2 py-1 text-xs"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === "pairs" && (
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs">
              Lookback bars
              <input
                type="number"
                min={2}
                max={200}
                value={pairsParams.lookback}
                onChange={(e) => setPairsParams((prev) => ({ ...prev, lookback: Number(e.target.value) }))}
                className="input w-24 px-2 py-1 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Entry z-score
              <input
                type="number"
                min={0.5}
                max={5}
                step={0.1}
                value={pairsParams.entryZ}
                onChange={(e) => setPairsParams((prev) => ({ ...prev, entryZ: Number(e.target.value) }))}
                className="input w-24 px-2 py-1 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Exit z-score
              <input
                type="number"
                min={0}
                max={3}
                step={0.1}
                value={pairsParams.exitZ}
                onChange={(e) => setPairsParams((prev) => ({ ...prev, exitZ: Number(e.target.value) }))}
                className="input w-24 px-2 py-1 text-xs"
              />
            </label>
          </div>
        )}

        <button
          type="submit"
          disabled={running || (mode !== "pairs" && mode !== "leaderboard" && !strategy)}
          className="btn-primary self-start disabled:opacity-40"
        >
          {running ? "Running…" : mode === "leaderboard" ? "Run Leaderboard" : "Run Backtest"}
        </button>
      </form>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {mode === "single" && single.current && (
        <BacktestResultView run={single.current} reviewLoading={single.reviewLoading} onReview={single.getReview} />
      )}
      {mode === "portfolio" && portfolio.current && (
        <PortfolioResultView
          run={portfolio.current}
          reviewLoading={portfolio.reviewLoading}
          onReview={portfolio.getReview}
        />
      )}
      {mode === "cross_sectional" && crossSectional.current && (
        <SimpleResultView
          run={crossSectional.current}
          reviewLoading={crossSectional.reviewLoading}
          onReview={crossSectional.getReview}
        />
      )}
      {mode === "pairs" && pairs.current && (
        <SimpleResultView run={pairs.current} showSymbol reviewLoading={pairs.reviewLoading} onReview={pairs.getReview} />
      )}
      {mode === "leaderboard" && leaderboard.result && (
        <LeaderboardResultView result={leaderboard.result} />
      )}

      {mode !== "leaderboard" && (
      <div>
        <h3 className="text-sm font-medium mb-2">Past runs</h3>
        <ul className="card flex flex-col divide-y divide-border max-h-64 overflow-y-auto">
          {mode === "single" && (
            <>
              {!single.historyLoaded && (
                <li className="p-4 text-sm text-foreground-muted">Loading history…</li>
              )}
              {single.historyLoaded && single.history.length === 0 && (
                <li className="p-4 text-sm text-foreground-muted">No backtests run yet.</li>
              )}
              {single.history.map((run) => (
                <li key={run._id}>
                  <button
                    onClick={() => single.setCurrent(run)}
                    className="w-full flex items-center justify-between gap-4 p-3 text-xs text-left hover:bg-background transition-colors"
                  >
                    <span className="font-mono">{run.config.symbol}</span>
                    <span className="text-foreground-muted">
                      {STRATEGIES[run.config.strategyId].name}
                    </span>
                    <span className={run.metrics.totalReturnPct >= 0 ? "text-green-600" : "text-red-500"}>
                      {pct(run.metrics.totalReturnPct)}
                    </span>
                    <span className="text-foreground-muted">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </>
          )}
          {mode === "portfolio" && (
            <>
              {!portfolio.historyLoaded && (
                <li className="p-4 text-sm text-foreground-muted">Loading history…</li>
              )}
              {portfolio.historyLoaded && portfolio.history.length === 0 && (
                <li className="p-4 text-sm text-foreground-muted">
                  No portfolio backtests run yet.
                </li>
              )}
              {portfolio.history.map((run) => (
                <li key={run._id}>
                  <button
                    onClick={() => portfolio.setCurrent(run)}
                    className="w-full flex items-center justify-between gap-4 p-3 text-xs text-left hover:bg-background transition-colors"
                  >
                    <span className="font-mono truncate max-w-[10rem]">{run.config.symbols.join(", ")}</span>
                    <span className="text-foreground-muted">
                      {STRATEGIES[run.config.strategyId].name}
                    </span>
                    <span className={run.metrics.totalReturnPct >= 0 ? "text-green-600" : "text-red-500"}>
                      {pct(run.metrics.totalReturnPct)}
                    </span>
                    <span className="text-foreground-muted">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </>
          )}
          {mode === "cross_sectional" && (
            <>
              {!crossSectional.historyLoaded && (
                <li className="p-4 text-sm text-foreground-muted">Loading history…</li>
              )}
              {crossSectional.historyLoaded && crossSectional.history.length === 0 && (
                <li className="p-4 text-sm text-foreground-muted">
                  No cross-sectional backtests run yet.
                </li>
              )}
              {crossSectional.history.map((run) => (
                <li key={run._id}>
                  <button
                    onClick={() => crossSectional.setCurrent(run)}
                    className="w-full flex items-center justify-between gap-4 p-3 text-xs text-left hover:bg-background transition-colors"
                  >
                    <span className="text-foreground-muted">
                      {STRATEGIES[run.config.strategyId]?.name ?? run.config.strategyId}
                    </span>
                    <span className={run.metrics.totalReturnPct >= 0 ? "text-green-600" : "text-red-500"}>
                      {pct(run.metrics.totalReturnPct)}
                    </span>
                    <span className="text-foreground-muted">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </>
          )}
          {mode === "pairs" && (
            <>
              {!pairs.historyLoaded && (
                <li className="p-4 text-sm text-foreground-muted">Loading history…</li>
              )}
              {pairs.historyLoaded && pairs.history.length === 0 && (
                <li className="p-4 text-sm text-foreground-muted">No pairs backtests run yet.</li>
              )}
              {pairs.history.map((run) => (
                <li key={run._id}>
                  <button
                    onClick={() => pairs.setCurrent(run)}
                    className="w-full flex items-center justify-between gap-4 p-3 text-xs text-left hover:bg-background transition-colors"
                  >
                    <span className="font-mono">
                      {run.config.symbolA} / {run.config.symbolB}
                    </span>
                    <span className={run.metrics.totalReturnPct >= 0 ? "text-green-600" : "text-red-500"}>
                      {pct(run.metrics.totalReturnPct)}
                    </span>
                    <span className="text-foreground-muted">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </>
          )}
        </ul>
      </div>
      )}

      <Disclaimer>
        Backtests run against free Yahoo Finance historical data — prototyping only. Results are
        simulated, long-only (pairs mode is the one exception — it simulates a market-neutral
        spread), and do not account for slippage or brokerage charges. Portfolio mode splits
        starting cash equally across symbols and runs each independently. Cross-sectional mode ranks
        and rebalances the full NIFTY 50 universe. Leaderboard mode runs every cross-sectional
        strategy over the same period and is cached for 30 minutes — not recomputed per click.{" "}
        {BACKTESTED_NOT_PREDICTIVE} {NOT_INVESTMENT_ADVICE}
      </Disclaimer>
    </div>
  );
}

function AiReviewSection({
  id,
  aiReview,
  reviewLoading,
  onReview,
}: {
  id: string;
  aiReview?: AiReview;
  reviewLoading: boolean;
  onReview: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => onReview(id)}
        disabled={reviewLoading}
        className="btn-secondary self-start disabled:opacity-40"
      >
        {reviewLoading ? "Reviewing…" : aiReview ? "Refresh AI review" : "Get AI review"}
      </button>
      {aiReview && (
        <div className="card p-4">
          <MarkdownContent content={aiReview.content} />
          <div className="mt-2 text-xs text-foreground-muted">
            {aiReview.provider}/{aiReview.model}
          </div>
        </div>
      )}
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
      <AiReviewSection id={run._id} aiReview={run.aiReview} reviewLoading={reviewLoading} onReview={onReview} />
    </div>
  );
}

function PortfolioResultView({
  run,
  reviewLoading,
  onReview,
}: {
  run: PortfolioBacktestRun;
  reviewLoading: boolean;
  onReview: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <MetricsGrid metrics={run.metrics} />
      <EquityChart equityCurve={run.equityCurve} startingCash={run.config.startingCash} />

      <div>
        <h3 className="text-sm font-medium mb-2">Per-symbol contribution</h3>
        <ul className="card flex flex-col divide-y divide-border">
          {run.bySymbol.map((s) => (
            <li key={s.symbol} className="flex items-center justify-between gap-4 p-3 text-xs">
              <span className="font-mono font-medium">{s.symbol}</span>
              <span className="text-foreground-muted">
                ₹{s.startingCash.toFixed(0)} → ₹{s.finalEquity.toFixed(0)}
              </span>
              <span className={s.totalReturnPct >= 0 ? "text-green-600" : "text-red-500"}>
                {pct(s.totalReturnPct)}
              </span>
              <span className="text-foreground-muted">{s.tradeCount} trades</span>
            </li>
          ))}
        </ul>
      </div>

      <TradeLog trades={run.trades} showSymbol />
      <AiReviewSection id={run._id} aiReview={run.aiReview} reviewLoading={reviewLoading} onReview={onReview} />
    </div>
  );
}

// Shared by cross-sectional and pairs mode — both are just an equity
// curve, metrics, a trade log, and an AI review.
function SimpleResultView({
  run,
  showSymbol,
  reviewLoading,
  onReview,
}: {
  run: CrossSectionalBacktestRun | PairsBacktestRun;
  showSymbol?: boolean;
  reviewLoading: boolean;
  onReview: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <MetricsGrid metrics={run.metrics} />
      <EquityChart equityCurve={run.equityCurve} startingCash={run.config.startingCash} />
      <TradeLog trades={run.trades} showSymbol={showSymbol} />
      <AiReviewSection id={run._id} aiReview={run.aiReview} reviewLoading={reviewLoading} onReview={onReview} />
    </div>
  );
}

function LeaderboardResultView({ result }: { result: LeaderboardResult }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-foreground-muted border-b border-border">
              <th className="p-3 font-medium">Strategy</th>
              <th className="p-3 font-medium">CAGR</th>
              <th className="p-3 font-medium">Total return</th>
              <th className="p-3 font-medium">Max drawdown</th>
              <th className="p-3 font-medium">Sharpe</th>
              <th className="p-3 font-medium">Current picks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.entries.map((entry) => (
              <tr key={entry.strategyId}>
                <td className="p-3">
                  {entry.name}
                  {entry.approximation && (
                    <span
                      title="Proxy: approximates data no current provider actually returns"
                      className="ml-1.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium"
                    >
                      Proxy
                    </span>
                  )}
                </td>
                <td className={`p-3 ${entry.metrics.cagrPct >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {pct(entry.metrics.cagrPct)}
                </td>
                <td
                  className={`p-3 ${entry.metrics.totalReturnPct >= 0 ? "text-green-600" : "text-red-500"}`}
                >
                  {pct(entry.metrics.totalReturnPct)}
                </td>
                <td className="p-3">-{entry.metrics.maxDrawdownPct.toFixed(2)}%</td>
                <td className="p-3">{entry.metrics.sharpe.toFixed(2)}</td>
                <td className="p-3 font-mono">
                  {entry.currentPicks.length > 0 ? entry.currentPicks.join(", ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-foreground-muted">
        As of {new Date(result.fetchedAt).toLocaleString()}. Ranked by backtested CAGR, highest
        first.
      </p>
    </div>
  );
}

function MetricsGrid({ metrics }: { metrics: BacktestRun["metrics"] }) {
  return (
    <div className="card grid grid-cols-2 sm:grid-cols-4 gap-4 p-4">
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
      <ul className="card flex flex-col divide-y divide-border max-h-56 overflow-y-auto">
        {trades.length === 0 && (
          <li className="p-4 text-sm text-foreground-muted">No trades were made.</li>
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
            <span className="text-foreground-muted">
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
      <div className="text-xs text-foreground-muted">{label}</div>
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
