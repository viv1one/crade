"use client";

import { useState } from "react";
import { MarkdownContent } from "../markdown-content";
import { Disclaimer } from "../disclaimer";
import { AGENT_DECISION_NOT_ADVICE, NOT_INVESTMENT_ADVICE, PAPER_TRADING_ONLY } from "@/lib/disclaimers";
import { SymbolDatalist, SYMBOL_SUGGESTIONS_ID } from "../symbol-datalist";
import { usePaperPortfolio } from "../use-paper-portfolio";
import type { AgentPipelineResult } from "@/lib/agents/types";

const ACTION_STYLES: Record<string, string> = {
  buy: "border-success/40 bg-success/10 text-success",
  sell: "border-danger/40 bg-danger/10 text-danger",
  hold: "border-border bg-background text-foreground-muted",
  // The model's decision couldn't be parsed into a real buy/sell/hold call
  // (see lib/agents/parse-decision.ts) — distinct styling so this never
  // looks like a considered "Hold" the pipeline actually reached.
  review: "border-warning/40 bg-warning/10 text-warning",
};

const ACTION_LABELS: Record<string, string> = {
  buy: "BUY",
  sell: "SELL",
  hold: "HOLD",
  review: "COULDN'T PARSE A DECISION",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="card p-3" open={false}>
      <summary className="text-sm font-semibold cursor-pointer">{title}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export function TradingAgentsPanel() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentPipelineResult | null>(null);
  const [tradeQty, setTradeQty] = useState(1);
  const [traded, setTraded] = useState(false);
  const [alertCreated, setAlertCreated] = useState(false);
  const { buy, sell } = usePaperPortfolio();

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const sym = symbol.trim().toUpperCase();
    if (!sym || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setTraded(false);
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setResult(data);
      setAlertCreated(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  function placeTrade() {
    if (!result) return;
    if (result.finalDecision.action !== "buy" && result.finalDecision.action !== "sell") return;
    // Simulated fill at the price this run's technical report was computed
    // from isn't threaded through separately — same as every other Buy/Sell
    // in this app, this places at the current live quote via the shared
    // paper-trading flow (app/use-paper-portfolio.ts), not a stale price
    // from this analysis.
    fetch(`/api/quote/${encodeURIComponent(result.symbol)}`)
      .then((res) => res.json())
      .then((quote) => {
        if (result.finalDecision.action === "buy") buy(result.symbol, tradeQty, quote.price);
        else sell(result.symbol, tradeQty, quote.price);
        setTraded(true);
      });
  }

  function createStopLossAlert() {
    if (!result?.traderPlan.stopLoss) return;
    fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: result.symbol,
        condition: { type: "price_below", value: result.traderPlan.stopLoss },
        channel: "push",
      }),
    }).then(() => setAlertCreated(true));
  }

  return (
    <div id="trading-agents" className="w-full max-w-2xl flex flex-col gap-4 scroll-mt-8">
      <SymbolDatalist />
      <h2 className="text-2xl font-semibold">Trading Agents</h2>
      <p className="text-sm text-foreground-muted">
        Runs a multi-agent research pipeline (technical, fundamentals, news, and sentiment analysts →
        bull/bear debate → risk debate) for one symbol, ending in a simulated buy/hold/sell call. This
        is ~12 chained AI calls, much slower than the regular chat — a real run has taken up to 5
        minutes. Leave this tab open until it finishes.
      </p>

      <form onSubmit={run} className="flex gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol, e.g. RELIANCE.NS"
          aria-label="Symbol to analyze"
          list={SYMBOL_SUGGESTIONS_ID}
          className="input flex-1"
        />
        <button type="submit" disabled={loading || !symbol.trim()} className="btn-primary disabled:opacity-40">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="spinner" aria-hidden="true" /> Running…
            </span>
          ) : (
            "Run analysis"
          )}
        </button>
      </form>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {result && (
        <div className="flex flex-col gap-3">
          <div className={`card p-4 border flex flex-col gap-2 ${ACTION_STYLES[result.finalDecision.action]}`}>
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{ACTION_LABELS[result.finalDecision.action]}</span>
              <span className="badge badge-neutral uppercase tracking-wide">{result.finalDecision.confidence} confidence</span>
            </div>
            <MarkdownContent content={result.finalDecision.rationale} />
            {result.finalDecision.action === "review" && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                The model&apos;s response couldn&apos;t be read as a clear buy/sell/hold call — this is not a
                real decision the pipeline reached, just a parsing failure. Read the rationale above and the
                stage reports below directly, or re-run the analysis.
              </p>
            )}
            <Disclaimer>{AGENT_DECISION_NOT_ADVICE}</Disclaimer>
            {(result.finalDecision.action === "buy" || result.finalDecision.action === "sell") && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number"
                  min={1}
                  value={tradeQty}
                  onChange={(e) => setTradeQty(Math.max(1, Number(e.target.value)))}
                  aria-label="Quantity"
                  className="input w-20"
                  disabled={traded}
                />
                <button onClick={placeTrade} disabled={traded} className="btn-secondary-sm">
                  {traded ? "Paper trade placed" : `Paper-trade this ${result.finalDecision.action}`}
                </button>
              </div>
            )}
          </div>

          <Section title="Analyst reports">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1">Technical</p>
                <MarkdownContent content={result.reports.technical} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1">Fundamentals</p>
                <MarkdownContent content={result.reports.fundamentals} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1">News</p>
                <MarkdownContent content={result.reports.news} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1">Sentiment</p>
                <MarkdownContent content={result.reports.sentiment} />
              </div>
            </div>
          </Section>

          <Section title={`Researcher debate — prevailing: ${result.debate.prevailing}`}>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1">Bull case</p>
                <MarkdownContent content={result.debate.bullCase} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1">Bear case</p>
                <MarkdownContent content={result.debate.bearCase} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1">Summary</p>
                <MarkdownContent content={result.debate.summary} />
              </div>
            </div>
          </Section>

          <Section title="Trader's plan">
            <div className="flex flex-col gap-2">
              <MarkdownContent
                content={`**${ACTION_LABELS[result.traderPlan.action]}** — ${result.traderPlan.reasoning}`}
              />
              {(result.traderPlan.entryPrice != null || result.traderPlan.stopLoss != null) && (
                <p className="text-xs text-foreground-muted">
                  {result.traderPlan.entryPrice != null && <>Suggested entry: ₹{result.traderPlan.entryPrice.toFixed(2)}. </>}
                  {result.traderPlan.stopLoss != null && <>Suggested stop-loss: ₹{result.traderPlan.stopLoss.toFixed(2)}.</>}
                </p>
              )}
              {result.traderPlan.stopLoss != null && (
                <button onClick={createStopLossAlert} disabled={alertCreated} className="btn-secondary-sm w-fit">
                  {alertCreated ? "Alert created" : `Create alert if price drops below ₹${result.traderPlan.stopLoss.toFixed(2)}`}
                </button>
              )}
            </div>
          </Section>

          <Section title="Risk management debate">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1">Risky</p>
                <MarkdownContent content={result.riskDebate.risky} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1">Safe</p>
                <MarkdownContent content={result.riskDebate.safe} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground-muted mb-1">Neutral</p>
                <MarkdownContent content={result.riskDebate.neutral} />
              </div>
            </div>
          </Section>

          <p className="text-xs text-foreground-muted">
            Generated {new Date(result.generatedAt).toLocaleString()}
          </p>
        </div>
      )}

      <Disclaimer>{NOT_INVESTMENT_ADVICE}</Disclaimer>
      <Disclaimer>{PAPER_TRADING_ONLY}</Disclaimer>
    </div>
  );
}
