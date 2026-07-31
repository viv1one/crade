"use client";

import { useEffect, useState } from "react";

interface Subscription {
  id: string;
  host: string;
  createdAt: string;
}

interface PushSubscriptionsListProps {
  refreshSignal?: number;
}

export function PushSubscriptionsList({ refreshSignal }: PushSubscriptionsListProps = {}) {
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function load() {
    fetch("/api/push/subscriptions")
      .then((res) => res.json())
      .then((data) => setSubs(Array.isArray(data) ? data : []))
      .catch(() => setSubs([]));
  }

  useEffect(load, [refreshSignal]);

  async function remove(id: string) {
    setRemovingId(id);
    try {
      await fetch(`/api/push/subscriptions/${id}`, { method: "DELETE" });
      load();
    } finally {
      setRemovingId(null);
    }
  }

  if (subs === null || subs.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-black/50 dark:text-white/50">
        Devices with push enabled ({subs.length}):
      </span>
      <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145] rounded-lg border border-black/[.08] dark:border-white/[.145]">
        {subs.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 p-2 text-xs">
            <span>
              {s.host} — added {new Date(s.createdAt).toLocaleDateString()}
            </span>
            <button
              onClick={() => remove(s.id)}
              disabled={removingId === s.id}
              className="text-black/50 dark:text-white/50 hover:text-red-500 transition-colors disabled:opacity-40"
              aria-label={`Remove push subscription for ${s.host}`}
            >
              {removingId === s.id ? "Removing…" : "Remove"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
