"use client";

import { useState } from "react";
import { Disclaimer } from "./disclaimer";

interface Pick {
  symbol: string;
  reason: string;
}

export function HoldingsDiversify({ hasHoldings }: { hasHoldings: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<string | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);

  async function suggest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/holdings/diversify", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to suggest diversifiers");
      setCriteria(data.criteria);
      setPicks(data.picks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to suggest diversifiers");
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setCriteria(null);
    setPicks([]);
  }

  if (!hasHoldings) return null;

  return (
    <div className="w-full flex flex-col gap-2">
      {criteria === null && (
        <button
          onClick={suggest}
          disabled={loading}
          className="text-xs rounded-full border border-border px-3 py-1.5 w-fit hover:bg-background transition-colors disabled:opacity-40"
        >
          {loading ? "Thinking…" : "Suggest diversifiers"}
        </button>
      )}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      {criteria !== null && (
        <div className="card p-3 flex flex-col gap-2">
          <p className="text-sm">
            <span className="font-medium">Approach:</span> {criteria}
          </p>
          {picks.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No diversification candidates found in the current screener data.
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
          <div className="flex items-center justify-end">
            <button
              onClick={clear}
              className="text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
          <Disclaimer>
            Matched against your portfolio&apos;s sector gaps and real current Nifty 50 data — not
            a prediction of future returns and not investment advice.
          </Disclaimer>
        </div>
      )}
    </div>
  );
}
