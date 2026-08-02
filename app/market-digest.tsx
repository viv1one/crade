"use client";

import { useState } from "react";
import { MarkdownContent } from "./markdown-content";
import { Disclaimer } from "./disclaimer";
import { NOT_INVESTMENT_ADVICE } from "@/lib/disclaimers";

export function MarketDigest() {
  const [content, setContent] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/digest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate digest");
      setContent(data.content);
      setFetchedAt(data.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate digest");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-2">
      {!content && (
        <button
          onClick={generate}
          disabled={loading}
          className="text-xs rounded-full border border-border px-3 py-1.5 w-fit hover:bg-background transition-colors disabled:opacity-40"
        >
          {loading ? "Generating…" : "Generate AI market digest"}
        </button>
      )}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      {content && (
        <div className="card p-3 flex flex-col gap-2">
          <MarkdownContent content={content} />
          <div className="flex items-center justify-between">
            {fetchedAt && (
              <span className="text-xs text-foreground-muted">
                Based on screener data as of {new Date(fetchedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => setContent(null)}
              className="text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
          <Disclaimer>{NOT_INVESTMENT_ADVICE}</Disclaimer>
        </div>
      )}
    </div>
  );
}
