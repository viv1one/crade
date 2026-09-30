"use client";

import { fetchWithProgress } from "@/lib/progress/client";
import type { ProgressUpdate } from "@/lib/progress/types";
import { ProgressNote } from "./progress-note";
import { useState } from "react";
import { MarkdownContent } from "./markdown-content";
import { Disclaimer } from "./disclaimer";
import { NOT_INVESTMENT_ADVICE } from "@/lib/disclaimers";
import { errorMessage } from "./fetch-json";

export function MarketDigest() {
  const [content, setContent] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWithProgress<{ content: string; fetchedAt: string }>(
        "/api/digest",
        { method: "POST" },
        setProgress
      );
      setContent(data.content);
      setFetchedAt(data.fetchedAt);
    } catch (err) {
      setError(errorMessage(err, "Failed to generate digest"));
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-2">
      {!content && (
        <button onClick={generate} disabled={loading} className="btn-secondary-sm w-fit">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="spinner" aria-hidden="true" /> Generating…
            </span>
          ) : (
            "Generate AI market digest"
          )}
        </button>
      )}
      {loading && <ProgressNote progress={progress} fallback="Starting…" />}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
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
