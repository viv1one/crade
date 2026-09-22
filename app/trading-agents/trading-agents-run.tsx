"use client";

import { useEffect, useRef, useState } from "react";
import { MarkdownContent } from "../markdown-content";
import { Disclaimer } from "../disclaimer";
import { AGENT_DECISION_NOT_ADVICE, PAPER_TRADING_ONLY } from "@/lib/disclaimers";
import { usePaperPortfolio } from "../use-paper-portfolio";
import type { AgentPipelineResult } from "@/lib/agents/types";

export const ACTION_STYLES: Record<string, string> = {
  buy: "border-success/40 bg-success/10 text-success",
  sell: "border-danger/40 bg-danger/10 text-danger",
  hold: "border-border bg-background text-foreground-muted",
  // The model's decision couldn't be parsed into a real buy/sell/hold call
  // (see lib/agents/parse-decision.ts) — distinct styling so this never
  // looks like a considered "Hold" the pipeline actually reached.
  review: "border-warning/40 bg-warning/10 text-warning",
};

export const ACTION_LABELS: Record<string, string> = {
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

// Live checklist shown while a run is in progress — each item flips
// pending -> done as the polled partial result gains that field. Order
// matches lib/agents/pipeline.ts's actual stage sequence.
const STAGES: { key: keyof AgentPipelineResult; label: string }[] = [
  { key: "reports", label: "Analyst team (Technical, Fundamentals, News, Sentiment)" },
  { key: "debate", label: "Bull vs. Bear debate" },
  { key: "traderPlan", label: "Trader's plan" },
  { key: "finalDecision", label: "Risk debate & Fund Manager decision" },
];

const POLL_INTERVAL_MS = 3000;

interface TradingAgentsRunProps {
  symbol: string;
  // Fires once when a run completes — e.g. the /trading-agents page uses
  // this to refresh its "Past analyses" list.
  onComplete?: (result: AgentPipelineResult) => void;
  // Seeds the component straight into "complete" with an already-known
  // result (e.g. clicking a "Past analyses" entry) — skips the run/poll
  // flow entirely rather than needlessly re-running a ~5-minute pipeline
  // just to redisplay something already computed.
  initialResult?: AgentPipelineResult;
}

// Extracted from what used to be inline in trading-agents-panel.tsx so it
// can be reused both there (full page) and inside a <BottomSheet> from the
// Screener's "⚡ Agents" button — the spec's literal "Decide" interaction.
// Shows live per-stage progress instead of one blank wait for the whole
// ~5-minute run: POST /api/agents/run creates the run and returns its id
// fast, then this polls GET /api/agents/run/[id] on an interval WHILE
// separately calling POST /api/agents/run/[id] to actually execute the
// pipeline (that call's own promise isn't awaited for UI purposes, only to
// know when to stop polling and to catch a hard failure) — see those
// routes' comments for why creation and execution are split.
export function TradingAgentsRun({ symbol, onComplete, initialResult }: TradingAgentsRunProps) {
  const [status, setStatus] = useState<"idle" | "running" | "complete" | "failed">(
    initialResult ? "complete" : "idle"
  );
  const [partial, setPartial] = useState<Partial<AgentPipelineResult>>(initialResult ?? {});
  const [error, setError] = useState<string | null>(null);
  const [tradeQty, setTradeQty] = useState(1);
  const [traded, setTraded] = useState(false);
  const [alertCreated, setAlertCreated] = useState(false);
  const { buy, sell } = usePaperPortfolio();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function run() {
    setStatus("running");
    setError(null);
    setPartial({});
    setTraded(false);
    setAlertCreated(false);
    settledRef.current = false;

    try {
      const createRes = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error ?? "Failed to start analysis");
      const runId: string = created.runId;

      pollRef.current = setInterval(async () => {
        if (settledRef.current) return;
        try {
          const res = await fetch(`/api/agents/run/${runId}`);
          if (!res.ok) return;
          const doc = await res.json();
          setPartial(doc.result ?? {});
          if (doc.status === "complete" && !settledRef.current) {
            settledRef.current = true;
            stopPolling();
            setStatus("complete");
            onComplete?.(doc.result);
          } else if (doc.status === "failed" && !settledRef.current) {
            settledRef.current = true;
            stopPolling();
            setStatus("failed");
            setError(doc.error ?? "Analysis failed");
          }
        } catch {
          // Transient poll failure — try again on the next tick.
        }
      }, POLL_INTERVAL_MS);

      const execRes = await fetch(`/api/agents/run/${runId}`, { method: "POST" });
      if (settledRef.current) return; // polling already resolved this run
      const execData = await execRes.json();
      settledRef.current = true;
      stopPolling();
      if (!execRes.ok) {
        setStatus("failed");
        setError(execData.error ?? "Analysis failed");
        return;
      }
      setPartial(execData);
      setStatus("complete");
      onComplete?.(execData);
    } catch (err) {
      settledRef.current = true;
      stopPolling();
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
  }

  function placeTrade() {
    const result = partial as AgentPipelineResult;
    if (!result.finalDecision) return;
    if (result.finalDecision.action !== "buy" && result.finalDecision.action !== "sell") return;
    fetch(`/api/quote/${encodeURIComponent(symbol)}`)
      .then((res) => res.json())
      .then((quote) => {
        if (result.finalDecision.action === "buy") buy(symbol, tradeQty, quote.price);
        else sell(symbol, tradeQty, quote.price);
        setTraded(true);
      });
  }

  function createStopLossAlert() {
    const stopLoss = partial.traderPlan?.stopLoss;
    if (!stopLoss) return;
    fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        condition: { type: "price_below", value: stopLoss },
        channel: "push",
      }),
    }).then(() => setAlertCreated(true));
  }

  const result = status === "complete" ? (partial as AgentPipelineResult) : null;

  return (
    <div className="flex flex-col gap-3">
      {status === "idle" && (
        <button onClick={run} className="btn-primary self-start">
          Run analysis for {symbol}
        </button>
      )}

      {status !== "idle" && (
        <div className="card p-3 flex flex-col gap-1.5 ai-panel">
          {STAGES.map((stage) => {
            const done = partial[stage.key] != null;
            return (
              <div key={stage.key} className="flex items-center gap-2 text-sm">
                {done ? (
                  <span className="text-success" aria-hidden="true">✓</span>
                ) : status === "running" ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <span className="text-foreground-muted" aria-hidden="true">○</span>
                )}
                <span className={done ? "" : "text-foreground-muted"}>{stage.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {result && (
        <div className="flex flex-col gap-3">
          <div className={`card p-4 border flex flex-col gap-2 ${ACTION_STYLES[result.finalDecision.action]}`}>
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{ACTION_LABELS[result.finalDecision.action]}</span>
              <span className="badge badge-neutral uppercase tracking-wide">{result.finalDecision.confidence} confidence</span>
            </div>
            <MarkdownContent content={result.finalDecision.rationale} />
            {result.finalDecision.action === "review" && (
              <p className="text-xs text-warning">
                The model&apos;s response couldn&apos;t be read as a clear buy/sell/hold call — this is not a
                real decision the pipeline reached, just a parsing failure. Read the rationale above and the
                stage reports below directly, or re-run the analysis.
              </p>
            )}
            <div className="hazard-frame">
              <Disclaimer>{AGENT_DECISION_NOT_ADVICE}</Disclaimer>
            </div>
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
              {/* 2-column Pros/Cons layout per the spec — Bull and Bear
                  side by side on wide viewports, stacked on mobile. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`rounded-[7px] border p-2.5 ${result.debate.prevailing === "bull" ? "border-success/40 bg-success/5" : "border-border"}`}>
                  <p className="text-xs font-semibold text-success mb-1">▲ Bull case</p>
                  <MarkdownContent content={result.debate.bullCase} />
                </div>
                <div className={`rounded-[7px] border p-2.5 ${result.debate.prevailing === "bear" ? "border-danger/40 bg-danger/5" : "border-border"}`}>
                  <p className="text-xs font-semibold text-danger mb-1">▼ Bear case</p>
                  <MarkdownContent content={result.debate.bearCase} />
                </div>
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

      <Disclaimer>{PAPER_TRADING_ONLY}</Disclaimer>
    </div>
  );
}
