"use client";

import { useState } from "react";
import { MarkdownContent } from "./markdown-content";
import { Disclaimer } from "./disclaimer";
import { DIAGNOSTICS_NOT_PREDICTIVE } from "@/lib/disclaimers";

interface PortfolioDiagnosticsProps {
  // Which route to call — the paper-trading portfolio and the real-holdings
  // tracker each have their own endpoint (different data source, different
  // system prompt server-side), but the panel itself is generic.
  endpoint: string;
  hasHoldings: boolean;
  // Only the real-holdings diagnostics route understands { deep: true } —
  // paper-trading's endpoint doesn't, so its call site simply omits this
  // prop and the checkbox never renders there.
  allowDeepAnalysis?: boolean;
}

export function PortfolioDiagnostics({
  endpoint,
  hasHoldings,
  allowDeepAnalysis = false,
}: PortfolioDiagnosticsProps) {
  const [content, setContent] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deep, setDeep] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deep ? { deep: true } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate diagnostics");
      setContent(data.content);
      setFetchedAt(data.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate diagnostics");
    } finally {
      setLoading(false);
    }
  }

  if (!hasHoldings) return null;

  return (
    <div className="w-full flex flex-col gap-2">
      {!content && (
        <div className="flex flex-col gap-1.5">
          {allowDeepAnalysis && (
            <label className="flex items-center gap-1.5 text-xs text-foreground-muted w-fit">
              <input
                type="checkbox"
                checked={deep}
                onChange={(e) => setDeep(e.target.checked)}
                disabled={loading}
              />
              Include deep factor analysis vs. the full Nifty 50 (slower)
            </label>
          )}
          <button
            onClick={generate}
            disabled={loading}
            className="text-xs rounded-full border border-border px-3 py-1.5 w-fit hover:bg-background transition-colors disabled:opacity-40"
          >
            {loading
              ? deep
                ? "Analyzing (this can take a while)…"
                : "Analyzing…"
              : "Generate AI portfolio diagnostics"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
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
          <Disclaimer>{DIAGNOSTICS_NOT_PREDICTIVE}</Disclaimer>
        </div>
      )}
    </div>
  );
}
