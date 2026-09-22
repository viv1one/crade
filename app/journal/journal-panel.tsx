"use client";

import { useEffect, useState } from "react";
import { MarkdownContent } from "../markdown-content";
import { Disclaimer } from "../disclaimer";
import { JOURNAL_REVIEW_NOT_ADVICE, NOT_INVESTMENT_ADVICE } from "@/lib/disclaimers";
import { SymbolDatalist, SYMBOL_SUGGESTIONS_ID } from "../symbol-datalist";
import { JournalReviewChart } from "./journal-review-chart";
import { VERDICT_BADGE_CLASS, type AgentPipelineResult } from "@/lib/agents/types";
import { useToast } from "../toast-provider";

interface JournalEntry {
  _id: string;
  symbol: string;
  action: "buy" | "sell" | "watch";
  reasoning: string;
  price?: number;
  outcome?: string;
  outcomeAt?: string;
  createdAt: string;
}

const ACTION_BADGE: Record<JournalEntry["action"], string> = {
  buy: "badge-success",
  sell: "badge-danger",
  watch: "badge-neutral",
};

function JournalReview() {
  const [content, setContent] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/journal/review", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate review");
      setContent(data.content);
      setFetchedAt(data.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate review");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full flex flex-col gap-2">
      {!content && (
        <button onClick={generate} disabled={loading} className="btn-secondary-sm w-fit">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="spinner" aria-hidden="true" /> Thinking…
            </span>
          ) : (
            "Get AI review of my journal"
          )}
        </button>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {content && (
        <div className="card p-3 flex flex-col gap-2">
          <MarkdownContent content={content} />
          <div className="flex items-center justify-between">
            {fetchedAt && (
              <span className="text-xs text-foreground-muted">
                Generated {new Date(fetchedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => setContent(null)}
              className="text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
          <Disclaimer>{JOURNAL_REVIEW_NOT_ADVICE}</Disclaimer>
        </div>
      )}
    </div>
  );
}

interface JournalPrefill {
  symbol?: string;
  action?: string;
  price?: string;
}

interface AgentRunSummary {
  result: AgentPipelineResult;
  createdAt: string;
}

// Frozen data snapshot shown alongside the reasoning editor when arriving
// here from a just-placed trade (?symbol=&action=&price=) — "what did the
// data actually look like right when you traded," not live-updating, so it
// reflects the moment being journaled rather than drifting while typing.
function TradeSnapshot({ symbol }: { symbol: string }) {
  const [quote, setQuote] = useState<{ price: number; changePercent: number } | null>(null);
  const [verdict, setVerdict] = useState<AgentRunSummary | null>(null);

  useEffect(() => {
    fetch(`/api/quote/${encodeURIComponent(symbol)}`)
      .then((res) => res.json())
      .then((data) => setQuote({ price: data.price, changePercent: data.changePercent }))
      .catch(() => {});
    fetch("/api/agents/run")
      .then((res) => res.json())
      .then((data: AgentRunSummary[]) => {
        const match = Array.isArray(data) ? data.find((r) => r.result?.symbol === symbol) : undefined;
        if (match) setVerdict(match);
      })
      .catch(() => {});
  }, [symbol]);

  return (
    <div className="card p-3 flex flex-col gap-1.5 text-xs">
      <p className="font-semibold text-foreground-muted uppercase tracking-wide">Snapshot at trade time</p>
      <p className="font-mono text-sm">{symbol}</p>
      {quote ? (
        <p className={quote.changePercent >= 0 ? "text-success" : "text-danger"}>
          ₹{quote.price.toFixed(2)} ({quote.changePercent >= 0 ? "+" : ""}
          {quote.changePercent.toFixed(2)}%)
        </p>
      ) : (
        <p className="text-foreground-muted">Loading price…</p>
      )}
      {verdict && (
        <p>
          Trading Agents:{" "}
          <span className={`badge ${VERDICT_BADGE_CLASS[verdict.result.finalDecision.action]}`}>
            {verdict.result.finalDecision.action.toUpperCase()}
          </span>{" "}
          <span className="text-foreground-muted">
            ({new Date(verdict.createdAt).toLocaleDateString()})
          </span>
        </p>
      )}
    </div>
  );
}

const VALID_PREFILL_ACTIONS = new Set<JournalEntry["action"]>(["buy", "sell", "watch"]);

export function JournalPanel({ prefill }: { prefill?: JournalPrefill } = {}) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [chartOpenFor, setChartOpenFor] = useState<string | null>(null);

  const [symbol, setSymbol] = useState(prefill?.symbol ?? "");
  const [action, setAction] = useState<JournalEntry["action"]>(
    prefill?.action && VALID_PREFILL_ACTIONS.has(prefill.action as JournalEntry["action"])
      ? (prefill.action as JournalEntry["action"])
      : "buy"
  );
  const [reasoning, setReasoning] = useState("");
  const [price, setPrice] = useState(prefill?.price ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [outcomeFormFor, setOutcomeFormFor] = useState<string | null>(null);
  const [outcomeText, setOutcomeText] = useState("");
  const [outcomeSubmitting, setOutcomeSubmitting] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);

  function load() {
    fetch("/api/journal")
      .then((res) => res.json())
      .then(setEntries)
      .finally(() => setLoaded(true));
  }

  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      setError("Enter a symbol");
      return;
    }
    if (!normalizedSymbol.includes(".")) normalizedSymbol = `${normalizedSymbol}.NS`;
    if (!reasoning.trim()) {
      setError("Enter your reasoning");
      return;
    }
    const numericPrice = price.trim() ? Number(price) : undefined;
    if (numericPrice !== undefined && !Number.isFinite(numericPrice)) {
      setError("Price must be a number");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: normalizedSymbol,
          action,
          reasoning: reasoning.trim(),
          ...(numericPrice !== undefined ? { price: numericPrice } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add entry");
      setSymbol("");
      setReasoning("");
      setPrice("");
      load();
      showToast(`Journal entry logged for ${normalizedSymbol}`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add entry");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitOutcome(id: string) {
    if (!outcomeText.trim()) return;
    setOutcomeSubmitting(true);
    try {
      const res = await fetch(`/api/journal/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: outcomeText.trim() }),
      });
      if (res.ok) {
        setOutcomeFormFor(null);
        setOutcomeText("");
        load();
      }
    } finally {
      setOutcomeSubmitting(false);
    }
  }

  async function remove(id: string) {
    setRemovingId(id);
    try {
      await fetch(`/api/journal/${id}`, { method: "DELETE" });
      load();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">
      <SymbolDatalist />
      <div>
        <h1 className="text-2xl font-semibold">Journal</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Log your own reasoning for a real or considered trade, then come back later and record
          what actually happened. A shadow record of your thinking, not a trade log — see
          Portfolio/Holdings for actual positions.
        </p>
      </div>

      <div className={prefill?.symbol ? "grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start" : undefined}>
        <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-foreground-muted w-40">
            Symbol
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. RELIANCE.NS or Adani"
              list={SYMBOL_SUGGESTIONS_ID}
              className="input"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-foreground-muted w-28">
            Action
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as JournalEntry["action"])}
              className="input"
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="watch">Watch</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-foreground-muted flex-1 min-w-[14rem]">
            Reasoning
            <input
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              placeholder="Why are you making this call?"
              className="input"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-foreground-muted w-28">
            Price (optional)
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              type="number"
              placeholder="₹"
              className="input"
            />
          </label>
          <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-40">
            Add
          </button>
        </form>
        {prefill?.symbol && (
          <div className="sm:w-56">
            <TradeSnapshot symbol={prefill.symbol} />
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {loaded && entries.length > 0 && <JournalReview />}

      <ul className="card flex flex-col divide-y divide-border overflow-hidden">
        {!loaded && <li className="p-4 text-sm text-foreground-muted">Loading journal…</li>}
        {loaded && entries.length === 0 && (
          <li className="p-4 text-sm text-foreground-muted">
            No entries yet — log your first trade idea above.
          </li>
        )}
        {entries.map((entry) => (
          <li key={entry._id} className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{entry.symbol}</span>
                  <span className={`badge ${ACTION_BADGE[entry.action]}`}>{entry.action}</span>
                  {entry.price != null && (
                    <span className="text-xs text-foreground-muted">@ ₹{entry.price.toFixed(2)}</span>
                  )}
                </div>
                <p className="text-sm">{entry.reasoning}</p>
                {entry.outcome && (
                  <p className="text-sm text-foreground-muted">
                    <span className="font-medium text-foreground">Outcome:</span> {entry.outcome}
                  </p>
                )}
                <span className="text-xs text-foreground-muted">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setChartOpenFor(chartOpenFor === entry._id ? null : entry._id)}
                  className="btn-secondary-sm"
                >
                  {chartOpenFor === entry._id ? "Hide chart" : "View outcome chart"}
                </button>
                {!entry.outcome && (
                  <button
                    onClick={() => {
                      setOutcomeFormFor(entry._id);
                      setOutcomeText("");
                    }}
                    className="btn-secondary-sm"
                  >
                    Add outcome
                  </button>
                )}
                <button
                  onClick={() => remove(entry._id)}
                  disabled={removingId === entry._id}
                  className="p-1 text-sm text-foreground-muted hover:text-danger transition-colors disabled:opacity-40"
                  aria-label={`Remove journal entry for ${entry.symbol}`}
                  title={`Remove journal entry for ${entry.symbol}`}
                >
                  ✕
                </button>
              </div>
            </div>

            {outcomeFormFor === entry._id && (
              <div className="flex flex-wrap items-center gap-2 rounded-[7px] bg-surface-sunken p-3">
                <input
                  value={outcomeText}
                  onChange={(e) => setOutcomeText(e.target.value)}
                  placeholder="What happened? e.g. closed at ₹1350, up 5%"
                  aria-label="Outcome"
                  className="input flex-1 min-w-[12rem] text-xs"
                />
                <button
                  onClick={() => submitOutcome(entry._id)}
                  disabled={outcomeSubmitting}
                  className="btn-primary text-xs disabled:opacity-40"
                >
                  {outcomeSubmitting ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setOutcomeFormFor(null)}
                  className="text-xs text-foreground-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {chartOpenFor === entry._id && (
              <div className="rounded-[7px] bg-surface-sunken p-3">
                <JournalReviewChart symbol={entry.symbol} entryAt={entry.createdAt} entryPrice={entry.price} />
              </div>
            )}
          </li>
        ))}
      </ul>

      <Disclaimer>
        A personal record of your own reasoning — Crade doesn&apos;t verify outcomes or connect to
        your broker. {NOT_INVESTMENT_ADVICE}
      </Disclaimer>
    </div>
  );
}
