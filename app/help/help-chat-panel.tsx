"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/ai";
import { MarkdownContent } from "../markdown-content";

export function HelpChatPanel() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/help-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat request failed");
      setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Ask how to use Crade</h2>

      <div className="card flex flex-col gap-2 p-4 min-h-32 max-h-96 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-foreground-muted">
            e.g. &ldquo;how do I get notified when a stock hits a price?&rdquo; or &ldquo;how does
            paper trading work?&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 max-w-[85%] ${
              m.role === "user"
                ? "self-end bg-foreground text-background text-sm"
                : "self-start bg-surface-sunken"
            }`}
          >
            <span className="sr-only">{m.role === "user" ? "You: " : "Assistant: "}</span>
            {m.role === "assistant" ? <MarkdownContent content={m.content} /> : m.content}
          </div>
        ))}
        {loading && (
          <div className="self-start flex items-center gap-2 text-sm text-foreground-muted">
            <span className="spinner" aria-hidden="true" /> Thinking…
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <form onSubmit={send} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about using the app…"
          aria-label="Ask a question about using the app"
          className="input flex-1"
        />
        <button type="submit" disabled={loading} className="btn-primary disabled:opacity-40">
          Send
        </button>
      </form>
    </div>
  );
}
