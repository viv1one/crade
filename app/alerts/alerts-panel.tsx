"use client";

import { useEffect, useState } from "react";

type ConditionType = "price_above" | "price_below" | "rsi_below" | "volume_spike";

interface Alert {
  _id: string;
  symbol: string;
  condition: { type: ConditionType; value: number };
  channel: "push" | "email";
  status: "active" | "paused" | "triggered";
  lastTriggeredAt?: string;
}

const CONDITION_LABELS: Record<ConditionType, string> = {
  price_above: "Price above (₹)",
  price_below: "Price below (₹)",
  rsi_below: "RSI(14) below",
  volume_spike: "Volume ≥ N× avg",
};

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [conditionType, setConditionType] = useState<ConditionType>("price_above");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    fetch("/api/alerts")
      .then((res) => res.json())
      .then(setAlerts)
      .finally(() => setLoaded(true));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const numericValue = Number(value);
    if (!symbol.trim() || !Number.isFinite(numericValue)) {
      setError("Enter a symbol and a numeric value");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          condition: { type: conditionType, value: numericValue },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create alert");
      setSymbol("");
      setValue("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create alert");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(alert: Alert) {
    const nextStatus = alert.status === "active" ? "paused" : "active";
    await fetch(`/api/alerts/${alert._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Alerts</h1>

      <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol, e.g. RELIANCE.NS"
          className="flex-1 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <select
          value={conditionType}
          onChange={(e) => setConditionType(e.target.value as ConditionType)}
          className="rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        >
          {Object.entries(CONDITION_LABELS).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="number"
          placeholder="Value"
          className="w-28 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:bg-[#383838] dark:hover:bg-[#ccc] transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-500">{error}</p>}

      <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145] rounded-lg border border-black/[.08] dark:border-white/[.145]">
        {!loaded && (
          <li className="p-4 text-sm text-black/50 dark:text-white/50">Loading alerts…</li>
        )}
        {loaded && alerts.length === 0 && (
          <li className="p-4 text-sm text-black/50 dark:text-white/50">
            No alerts yet — add one above.
          </li>
        )}
        {alerts.map((alert) => (
          <li key={alert._id} className="flex items-center justify-between gap-4 p-4">
            <div className="flex flex-col">
              <span className="font-mono text-sm font-medium">{alert.symbol}</span>
              <span className="text-xs text-black/50 dark:text-white/50">
                {CONDITION_LABELS[alert.condition.type]} {alert.condition.value}
              </span>
              {alert.lastTriggeredAt && (
                <span className="text-xs text-black/40 dark:text-white/40">
                  Last triggered {new Date(alert.lastTriggeredAt).toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs rounded-full px-2 py-1 ${
                  alert.status === "active"
                    ? "bg-green-600/10 text-green-600"
                    : alert.status === "triggered"
                      ? "bg-yellow-600/10 text-yellow-600"
                      : "bg-black/[.05] text-black/50 dark:bg-white/[.06] dark:text-white/50"
                }`}
              >
                {alert.status}
              </span>
              <button
                onClick={() => toggleStatus(alert)}
                className="text-xs rounded-full border border-black/[.08] dark:border-white/[.145] px-3 py-1.5 hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] transition-colors"
              >
                {alert.status === "active" ? "Pause" : "Activate"}
              </button>
              <button
                onClick={() => remove(alert._id)}
                className="text-xs text-black/50 dark:text-white/50 hover:text-red-500 transition-colors"
                aria-label={`Remove alert for ${alert.symbol}`}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-black/40 dark:text-white/40">
        Alerts are checked periodically in the background and delivered as a push notification.
        Push requires notification permission — see the browser prompt on first visit.
      </p>
    </div>
  );
}
