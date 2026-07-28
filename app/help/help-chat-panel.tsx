"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/ai";

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

      <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] dark:border-white/[.145] p-4 min-h-32 max-h-96 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            e.g. &ldquo;how do I get notified when a stock hits a price?&rdquo; or &ldquo;how does
            paper trading work?&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${
              m.role === "user"
                ? "self-end bg-foreground text-background"
                : "self-start bg-black/[.05] dark:bg-white/[.06]"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="self-start text-sm text-black/50 dark:text-white/50">Thinking…</div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <form onSubmit={send} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about using the app…"
          aria-label="Ask a question about using the app"
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
    </div>
  );
}
