"use client";

import { useEffect, useState } from "react";
import { safeJson, errorMessage } from "./fetch-json";
import { Collapsible } from "./collapsible";

interface ShareRow {
  _id: string;
  invitedEmail: string;
}

export function ShareWatchlist() {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    fetch("/api/shares")
      .then((res) => safeJson(res))
      .then((data) => setShares(Array.isArray(data) ? data : []))
      .catch(() => setShares([]));
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
      await safeJson(res);
      setEmail("");
      load();
    } catch (err) {
      setError(errorMessage(err, "Failed to share"));
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await safeJson(await fetch(`/api/shares/${id}`, { method: "DELETE" }));
      load();
    } catch (err) {
      setError(`Couldn't revoke access: ${errorMessage(err, "try again")}`);
    }
  }

  return (
    <div className="w-full max-w-2xl text-sm">
      <Collapsible variant="inline" title="Share this watchlist" hint={shares.length > 0 ? `${shares.length}` : undefined}>
        <div className="flex flex-col gap-2">
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
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
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
                    className="text-foreground-muted hover:text-danger transition-colors"
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
      </Collapsible>
    </div>
  );
}
