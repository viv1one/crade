"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, ChatTask } from "@/lib/ai";
import { MarkdownContent } from "./markdown-content";
import { Disclaimer } from "./disclaimer";
import { NOT_INVESTMENT_ADVICE } from "@/lib/disclaimers";
import { SYMBOL_SUGGESTIONS_ID } from "./symbol-datalist";

const TASK_OPTIONS: { value: ChatTask; label: string }[] = [
  { value: "chat", label: "Chat" },
  { value: "explain_move", label: "Explain a move" },
  { value: "summarize", label: "Summarize" },
  { value: "digest", label: "Digest" },
];

interface ChatPanelProps {
  initialSymbol?: string;
}

export function ChatPanel({ initialSymbol }: ChatPanelProps = {}) {
  const [symbol, setSymbol] = useState(initialSymbol ?? "");
  const [task, setTask] = useState<ChatTask>("chat");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ provider: string; model: string } | null>(null);
  // Citation pills for the assistant message just received — live-session
  // only, not persisted to ai_sessions/reloaded from history (see the plan's
  // scope decision): most useful on the response you just got, and this
  // avoids a Mongo schema change for the older, unpinned history.
  const [lastSources, setLastSources] = useState<{ index: number; items: { label: string; detail: string }[] } | null>(null);
  // Index of the assistant message that came back with the server's
  // deterministic noDataAvailable flag (see app/api/chat/route.ts) — the
  // spec's "Failsafe UI": rendered as a distinct pre-styled gray block
  // instead of a normal reply bubble, so "the AI has nothing" reads
  // differently at a glance than a real answer, rather than blending in as
  // plain prose. Same live-session-only scope as lastSources above.
  const [noDataIndex, setNoDataIndex] = useState<number | null>(null);

  const loadHistory = useCallback(async (forSymbol: string) => {
    setHistoryLoaded(false);
    setLastSources(null);
    setNoDataIndex(null);
    try {
      const res = await fetch(`/api/chat/history?symbol=${encodeURIComponent(forSymbol)}`);
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setMessages([]);
    } finally {
      setHistoryLoaded(true);
    }
  }, []);

  // Load once on mount for the default (no-symbol) context, or for
  // initialSymbol when a symbol was passed in (e.g. from clicking a symbol
  // elsewhere in the app). Re-loads again whenever the symbol field is
  // committed (blur), since history is scoped per symbol server-side.
  useEffect(() => {
    loadHistory(initialSymbol?.trim().toUpperCase() ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadHistory]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const prefixed = symbol.trim()
      ? `[${symbol.trim().toUpperCase()}] ${text}`
      : text;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: prefixed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, task, symbol: symbol.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat request failed");
      setMessages((prev) => {
        const next = [...prev, { role: "assistant" as const, content: data.content }];
        const index = next.length - 1;
        if (Array.isArray(data.sources) && data.sources.length > 0) {
          setLastSources({ index, items: data.sources });
        } else {
          setLastSources(null);
        }
        setNoDataIndex(data.noDataAvailable ? index : null);
        return next;
      });
      setMeta({ provider: data.provider, model: data.model });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="chat" className="w-full max-w-2xl flex flex-col gap-4 scroll-mt-8">
      <h2 className="text-2xl font-semibold">AI Chat</h2>

      <div className="flex gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onBlur={(e) => loadHistory(e.target.value.trim().toUpperCase())}
          placeholder="Symbol (optional), e.g. RELIANCE.NS or Adani"
          aria-label="Symbol to ground chat in (optional)"
          list={SYMBOL_SUGGESTIONS_ID}
          className="input flex-1"
        />
        <select
          value={task}
          onChange={(e) => setTask(e.target.value as ChatTask)}
          aria-label="Chat task"
          className="input"
        >
          {TASK_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card flex flex-col gap-2 p-4 min-h-40 max-h-96 overflow-y-auto">
        {!historyLoaded && (
          <p className="text-sm text-foreground-muted">Loading history…</p>
        )}
        {historyLoaded && messages.length === 0 && (
          <p className="text-sm text-foreground-muted">
            Ask about a stock, e.g. &ldquo;why did this move today?&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col gap-1 max-w-[85%] ${m.role === "user" ? "self-end" : "self-start"}`}>
            <div
              className={`rounded-lg px-3 py-2 ${
                m.role === "user"
                  ? "bg-foreground text-background text-sm"
                  : noDataIndex === i
                    ? "bg-background border border-dashed border-border text-foreground-muted"
                    : "bg-surface-sunken ai-panel"
              }`}
            >
              <span className="sr-only">{m.role === "user" ? "You: " : "Assistant: "}</span>
              {m.role === "assistant" && noDataIndex === i && (
                <p className="text-xs font-semibold uppercase tracking-wide mb-1">⚠ No live data available</p>
              )}
              {m.role === "assistant" ? <MarkdownContent content={m.content} /> : m.content}
            </div>
            {m.role === "assistant" && lastSources?.index === i && (
              <div className="flex flex-wrap gap-1.5" aria-label="Sources used for this answer">
                {lastSources.items.map((s, j) => (
                  <span key={j} className="badge badge-ai" title={s.detail}>
                    Source: {s.label} {s.detail}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="self-start flex items-center gap-2 text-sm text-foreground-muted">
            <span className="spinner" aria-hidden="true" /> Thinking…
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {meta && (
        <p className="text-xs text-foreground-muted">
          via {meta.provider} ({meta.model})
        </p>
      )}

      <form onSubmit={send} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something…"
          aria-label="Message"
          className="input flex-1"
        />
        <button type="submit" disabled={loading} className="btn-primary disabled:opacity-40">
          Send
        </button>
      </form>

      <Disclaimer>{NOT_INVESTMENT_ADVICE}</Disclaimer>
    </div>
  );
}
