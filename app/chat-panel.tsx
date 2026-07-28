"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, ChatTask } from "@/lib/ai";
import { MarkdownContent } from "./markdown-content";

const TASK_OPTIONS: { value: ChatTask; label: string }[] = [
  { value: "chat", label: "Chat" },
  { value: "explain_move", label: "Explain a move" },
  { value: "summarize", label: "Summarize" },
  { value: "digest", label: "Digest" },
];

export function ChatPanel() {
  const [symbol, setSymbol] = useState("");
  const [task, setTask] = useState<ChatTask>("chat");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ provider: string; model: string } | null>(null);

  const loadHistory = useCallback(async (forSymbol: string) => {
    setHistoryLoaded(false);
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

  // Load once on mount for the default (no-symbol) context. Re-loads again
  // whenever the symbol field is committed (blur), since history is scoped
  // per symbol server-side.
  useEffect(() => {
    loadHistory("");
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
      setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
      setMeta({ provider: data.provider, model: data.model });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">AI Chat</h2>

      <div className="flex gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onBlur={(e) => loadHistory(e.target.value.trim().toUpperCase())}
          placeholder="Symbol (optional), e.g. RELIANCE.NS"
          className="flex-1 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <select
          value={task}
          onChange={(e) => setTask(e.target.value as ChatTask)}
          className="rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        >
          {TASK_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] dark:border-white/[.145] p-4 min-h-40 max-h-96 overflow-y-auto">
        {!historyLoaded && (
          <p className="text-sm text-black/50 dark:text-white/50">Loading history…</p>
        )}
        {historyLoaded && messages.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            Ask about a stock, e.g. &ldquo;why did this move today?&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 max-w-[85%] ${
              m.role === "user"
                ? "self-end bg-foreground text-background text-sm"
                : "self-start bg-black/[.05] dark:bg-white/[.06]"
            }`}
          >
            {m.role === "assistant" ? <MarkdownContent content={m.content} /> : m.content}
          </div>
        ))}
        {loading && (
          <div className="self-start text-sm text-black/50 dark:text-white/50">Thinking…</div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {meta && (
        <p className="text-xs text-black/40 dark:text-white/40">
          via {meta.provider} ({meta.model})
        </p>
      )}

      <form onSubmit={send} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something…"
          className="flex-1 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:bg-[#383838] dark:hover:bg-[#ccc] transition-colors disabled:opacity-40"
        >
          Send
        </button>
      </form>

      <p className="text-xs text-black/40 dark:text-white/40">
        Not investment advice — for personal research only. See docs/plan.md §7.
      </p>
    </div>
  );
}
