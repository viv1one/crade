"use client";

import { useEffect, useState } from "react";

interface ShareRow {
  _id: string;
  invitedEmail: string;
}

export function ShareWatchlist() {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function load() {
    fetch("/api/shares")
      .then((res) => res.json())
      .then((data) => setShares(Array.isArray(data) ? data : []));
  }

  useEffect(load, []);

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitedEmail: email, resourceType: "watchlist" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to share");
      setEmail("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share");
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/shares/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="w-full max-w-2xl text-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="text-xs text-foreground-muted underline underline-offset-4 hover:no-underline"
      >
        {expanded ? "Hide sharing" : `Share this watchlist${shares.length > 0 ? ` (${shares.length})` : ""}`}
      </button>

      {expanded && (
        <div className="card mt-2 flex flex-col gap-2 p-3">
          <form onSubmit={handleShare} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Invite by email"
              aria-label="Email to invite"
              className="input flex-1 py-1.5 text-xs"
            />
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary text-xs py-1.5 disabled:opacity-40"
            >
              Invite
            </button>
          </form>
          {error && <p className="text-xs text-red-500">{error}</p>}
          {shares.length === 0 ? (
            <p className="text-xs text-foreground-muted">Not shared with anyone yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {shares.map((s) => (
                <li key={s._id} className="flex items-center justify-between text-xs">
                  <span>{s.invitedEmail}</span>
                  <button
                    onClick={() => revoke(s._id)}
                    aria-label={`Revoke access for ${s.invitedEmail}`}
                    className="text-foreground-muted hover:text-red-500 transition-colors"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-foreground-muted">
            They&apos;ll see this watchlist read-only if they sign in with that email.
          </p>
        </div>
      )}
    </div>
  );
}
