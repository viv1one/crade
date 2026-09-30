"use client";

import { useEffect, useState } from "react";
import { Disclaimer } from "../disclaimer";
import { NOT_INVESTMENT_ADVICE } from "@/lib/disclaimers";
import { SymbolDatalist, SYMBOL_SUGGESTIONS_ID } from "../symbol-datalist";
import { VERDICT_BADGE_CLASS, type AgentPipelineResult } from "@/lib/agents/types";
import { TradingAgentsRun, ACTION_LABELS } from "./trading-agents-run";
import { safeJson } from "../fetch-json";
import { Collapsible } from "../collapsible";

interface AgentRunSummary {
  _id: string;
  symbol: string;
  result: AgentPipelineResult;
  createdAt: string;
}

interface UnfinishedRun {
  _id: string;
  symbol: string;
  createdAt: string;
  stagesDone: number;
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
  const [unfinished, setUnfinished] = useState<UnfinishedRun[]>([]);
  const [resumeRun, setResumeRun] = useState<UnfinishedRun | null>(null);

  function loadHistory() {
    fetch("/api/agents/run")
      .then((res) => safeJson(res))
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }

  useEffect(loadHistory, []);

  // Analyses that started but never finished (the host cut them off, or the page
  // was closed) — offered for resuming rather than silently lost.
  function loadUnfinished() {
    fetch("/api/agents/run?unfinished=1")
      .then((res) => safeJson(res))
      .then((data) => setUnfinished(Array.isArray(data) ? (data as UnfinishedRun[]) : []))
      .catch(() => {});
  }
  useEffect(loadUnfinished, []);

  function startRun(e: React.FormEvent) {
    e.preventDefault();
    setResumeRun(null);
    const sym = symbolInput.trim().toUpperCase();
    if (!sym) return;
    setActiveResult(undefined);
    setActiveSymbol(sym);
  }

  return (
    <div id="trading-agents" className="w-full max-w-2xl flex flex-col gap-4 scroll-mt-8">
      <SymbolDatalist />
      <div>
        <h1 className="text-2xl font-semibold">Trading Agents</h1>
        <p className="text-sm text-foreground-muted">A team of AI analysts debates one stock and gives a verdict.</p>
      </div>
      <Collapsible variant="inline" title="How it works">
        <p className="text-xs text-foreground-muted">
          Technical, fundamentals, news and sentiment analysts report; a bull and a bear argue; a trader proposes a
          plan; a risk team reviews it and a fund manager makes the call. It&apos;s about 12 chained AI calls, so a
          run takes up to ~5 minutes — it keeps going on the server, and you can leave the page.
        </p>
      </Collapsible>

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
      {!symbolInput.trim() && (
        <p className="text-xs text-foreground-muted -mt-2">Enter a symbol above to enable the button.</p>
      )}

      {resumeRun ? (
        <TradingAgentsRun
          key={`resume-${resumeRun._id}`}
          symbol={resumeRun.symbol}
          resumeRunId={resumeRun._id}
          onComplete={() => {
            loadHistory();
            loadUnfinished();
          }}
        />
      ) : (
        activeSymbol && (
          <TradingAgentsRun
            key={activeSymbol + (activeResult ? "-history" : "-fresh")}
            symbol={activeSymbol}
            onComplete={loadHistory}
            initialResult={activeResult}
          />
        )
      )}

      {unfinished.filter((u) => u._id !== resumeRun?._id).length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-1">Unfinished analyses</h3>
          <p className="text-xs text-foreground-muted mb-2">
            These started but never completed. Resuming picks up from the last step that finished.
          </p>
          <ul className="card flex flex-col divide-y divide-border">
            {unfinished
              .filter((u) => u._id !== resumeRun?._id)
              .map((u) => (
                <li key={u._id} className="flex items-center justify-between gap-3 p-3 text-xs">
                  <span className="font-mono">{u.symbol}</span>
                  <span className="text-foreground-muted">
                    {u.stagesDone}/4 steps · started {new Date(u.createdAt).toLocaleString()}
                  </span>
                  <button
                    onClick={() => {
                      setActiveSymbol(null);
                      setActiveResult(undefined);
                      setResumeRun(u);
                    }}
                    className="btn-secondary-sm"
                    aria-label={`Resume the ${u.symbol} analysis`}
                  >
                    Resume
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      <Collapsible title="Past analyses" hint={history.length > 0 ? `${history.length}` : undefined}>
        <ul className="flex flex-col divide-y divide-border max-h-64 overflow-y-auto">
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
      </Collapsible>

      <Disclaimer collapsible>{NOT_INVESTMENT_ADVICE}</Disclaimer>
    </div>
  );
}
