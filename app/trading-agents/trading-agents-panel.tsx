"use client";

import { useEffect, useState } from "react";
import { Disclaimer } from "../disclaimer";
import { NOT_INVESTMENT_ADVICE } from "@/lib/disclaimers";
import { SymbolDatalist, SYMBOL_SUGGESTIONS_ID } from "../symbol-datalist";
import { VERDICT_BADGE_CLASS, type AgentPipelineResult } from "@/lib/agents/types";
import { TradingAgentsRun, ACTION_LABELS } from "./trading-agents-run";

interface AgentRunSummary {
  _id: string;
  symbol: string;
  result: AgentPipelineResult;
  createdAt: string;
}

interface TradingAgentsPanelProps {
  initialSymbol?: string;
}

export function TradingAgentsPanel({ initialSymbol }: TradingAgentsPanelProps = {}) {
  const [symbolInput, setSymbolInput] = useState(initialSymbol ?? "");
  // The symbol a run is actually committed to — separate from the input
  // field so editing the text box mid-run (or after) doesn't retarget an
  // in-flight <TradingAgentsRun>. `key={activeSymbol}` below resets that
  // component's own state on a genuinely new symbol.
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  // Set only when opening a "Past analyses" entry — passed as
  // TradingAgentsRun's initialResult so re-opening an old run redisplays it
  // instead of needlessly re-running the ~5-minute pipeline.
  const [activeResult, setActiveResult] = useState<AgentPipelineResult | undefined>(undefined);

  const [history, setHistory] = useState<AgentRunSummary[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  function loadHistory() {
    fetch("/api/agents/run")
      .then((res) => res.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .finally(() => setHistoryLoaded(true));
  }

  useEffect(loadHistory, []);

  function startRun(e: React.FormEvent) {
    e.preventDefault();
    const sym = symbolInput.trim().toUpperCase();
    if (!sym) return;
    setActiveResult(undefined);
    setActiveSymbol(sym);
  }

  return (
    <div id="trading-agents" className="w-full max-w-2xl flex flex-col gap-4 scroll-mt-8">
      <SymbolDatalist />
      <h2 className="text-2xl font-semibold">Trading Agents</h2>
      <p className="text-sm text-foreground-muted">
        Runs a multi-agent research pipeline (technical, fundamentals, news, and sentiment analysts →
        bull/bear debate → risk debate) for one symbol, ending in a simulated buy/hold/sell call. This
        is ~12 chained AI calls, much slower than the regular chat — a real run has taken up to 5
        minutes. Progress below updates live as each stage finishes.
      </p>

      <form onSubmit={startRun} className="flex gap-2">
        <input
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          placeholder="Symbol, e.g. RELIANCE.NS"
          aria-label="Symbol to analyze"
          list={SYMBOL_SUGGESTIONS_ID}
          className="input flex-1"
        />
        <button type="submit" disabled={!symbolInput.trim()} className="btn-primary disabled:opacity-40">
          {activeSymbol ? "Run again" : "Set symbol"}
        </button>
      </form>

      {activeSymbol && (
        <TradingAgentsRun
          key={activeSymbol + (activeResult ? "-history" : "-fresh")}
          symbol={activeSymbol}
          onComplete={loadHistory}
          initialResult={activeResult}
        />
      )}

      <div>
        <h3 className="text-sm font-medium mb-2">Past analyses</h3>
        <ul className="card flex flex-col divide-y divide-border max-h-64 overflow-y-auto">
          {!historyLoaded && (
            <li className="p-4 text-sm text-foreground-muted">Loading history…</li>
          )}
          {historyLoaded && history.length === 0 && (
            <li className="p-4 text-sm text-foreground-muted">No analyses run yet.</li>
          )}
          {history.map((run) => (
            <li key={run._id}>
              <button
                onClick={() => {
                  setSymbolInput(run.symbol);
                  setActiveResult(run.result);
                  setActiveSymbol(run.symbol);
                }}
                aria-label={`Re-open ${run.symbol}, ${ACTION_LABELS[run.result.finalDecision.action]}, ${new Date(run.createdAt).toLocaleDateString()}`}
                className="w-full flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3 text-xs text-left hover:bg-background transition-colors"
              >
                <span aria-hidden="true" className="font-mono">{run.symbol}</span>
                <span aria-hidden="true" className={`badge ${VERDICT_BADGE_CLASS[run.result.finalDecision.action]}`}>
                  {ACTION_LABELS[run.result.finalDecision.action]}
                </span>
                <span aria-hidden="true" className="text-foreground-muted">
                  {new Date(run.createdAt).toLocaleDateString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Disclaimer>{NOT_INVESTMENT_ADVICE}</Disclaimer>
    </div>
  );
}
