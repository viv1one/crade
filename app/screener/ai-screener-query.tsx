"use client";

import { useState } from "react";
import type { ScreenerRow } from "@/lib/screener/types";

interface Pick {
  symbol: string;
  reason: string;
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
    setPicks([]);
    setQuestion("");
    onClear();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] dark:border-white/[.145] p-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. 5 stocks with positive momentum and a reasonable P/E"
          className="flex-1 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <button
          type="submit"
          disabled={loading || rows.length === 0}
          className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:bg-[#383838] dark:hover:bg-[#ccc] transition-colors disabled:opacity-40"
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
        {picks.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-sm text-black/50 dark:text-white/50 hover:text-red-500 transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {criteria && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <span className="font-medium">Criteria used:</span> {criteria}
          </p>
          {picks.length === 0 ? (
            <p className="text-sm text-black/50 dark:text-white/50">
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

      <p className="text-xs text-black/40 dark:text-white/40">
        This matches stocks against criteria derived from your question and the data shown below —
        it is not a prediction of future returns and not investment advice. See docs/plan.md §7.
      </p>
    </div>
  );
}
