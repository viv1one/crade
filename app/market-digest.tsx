"use client";

import { useState } from "react";
import { MarkdownContent } from "./markdown-content";

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
          className="text-xs rounded-full border border-black/[.08] dark:border-white/[.145] px-3 py-1.5 w-fit hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors disabled:opacity-40"
        >
          {loading ? "Generating…" : "Generate AI market digest"}
        </button>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {content && (
        <div className="rounded-lg border border-black/[.08] dark:border-white/[.145] p-3 flex flex-col gap-2">
          <MarkdownContent content={content} />
          <div className="flex items-center justify-between">
            {fetchedAt && (
              <span className="text-xs text-black/40 dark:text-white/40">
                Based on screener data as of {new Date(fetchedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => setContent(null)}
              className="text-xs text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
