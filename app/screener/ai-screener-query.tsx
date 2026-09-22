"use client";

import { useState } from "react";
import type { ScreenerRow } from "@/lib/screener/types";
import { Disclaimer } from "../disclaimer";

interface Pick {
  symbol: string;
  reason: string;
}

interface Filter {
  label: string;
  value: string;
}

interface AiScreenerQueryProps {
  rows: ScreenerRow[];
  onResult: (symbols: string[]) => void;
  onClear: () => void;
}

export function AiScreenerQuery({ rows, onResult, onClear }: AiScreenerQueryProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/screener/ai-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI query failed");
      setCriteria(data.criteria);
      setFilters(Array.isArray(data.filters) ? data.filters : []);
      setPicks(data.picks);
      onResult(data.picks.map((p: Pick) => p.symbol));
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI query failed");
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setCriteria(null);
    setFilters([]);
    setPicks([]);
    setQuestion("");
    onClear();
  }

  return (
    <div className="card flex flex-col gap-3 p-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. 5 stocks with positive momentum and a reasonable P/E"
          aria-label="Ask the AI to filter stocks"
          className="input flex-1"
        />
        <button type="submit" disabled={loading || rows.length === 0} className="btn-primary disabled:opacity-40">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="spinner" aria-hidden="true" /> Thinking…
            </span>
          ) : (
            "Ask"
          )}
        </button>
        {picks.length > 0 && (
          <button type="button" onClick={clear} className="btn-secondary-sm">
            Clear
          </button>
        )}
      </form>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {criteria && (
        <div className="flex flex-col gap-2">
          {filters.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Parsed filters">
              {filters.map((f, i) => (
                <span key={i} className="badge badge-ai">
                  {f.label}: {f.value}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm">
            <span className="font-medium">Criteria used:</span> {criteria}
          </p>
          {picks.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No stocks in the current data matched.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {picks.map((p) => (
                <li key={p.symbol} className="text-sm">
                  <span className="font-mono font-medium">{p.symbol}</span> — {p.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Disclaimer>
        This matches stocks against criteria derived from your question and the data shown below —
        it is not a prediction of future returns and not investment advice.
      </Disclaimer>
    </div>
  );
}
