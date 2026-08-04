"use client";

import { useEffect, useState } from "react";
import { Disclaimer } from "../disclaimer";
import { NOT_INVESTMENT_ADVICE } from "@/lib/disclaimers";
import { SymbolDatalist, SYMBOL_SUGGESTIONS_ID } from "../symbol-datalist";
import { CONDITION_LABELS, type ConditionType } from "@/lib/alerts/labels";

interface Alert {
  _id: string;
  symbol: string;
  condition: { type: ConditionType; value: number };
  channel: "push" | "email";
  status: "active" | "paused" | "triggered";
  lastTriggeredAt?: string;
}

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [conditionType, setConditionType] = useState<ConditionType>("price_above");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pushGranted, setPushGranted] = useState(true);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setPushGranted(Notification.permission === "granted");
    }
  }, []);

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
      <SymbolDatalist />
      <h1 className="text-2xl font-semibold">Alerts</h1>

      {!pushGranted && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Push notifications aren&apos;t enabled on this device yet — enable them above, or an alert
          firing won&apos;t actually notify you.
        </p>
      )}

      <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol, e.g. RELIANCE.NS or Adani"
          aria-label="Symbol"
          list={SYMBOL_SUGGESTIONS_ID}
          className="input flex-1"
        />
        <select
          value={conditionType}
          onChange={(e) => setConditionType(e.target.value as ConditionType)}
          aria-label="Alert condition"
          className="input"
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
          aria-label="Condition value"
          className="input w-28"
        />
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-40">
          Add
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      <ul className="card flex flex-col divide-y divide-border overflow-hidden">
        {!loaded && (
          <li className="p-4 text-sm text-foreground-muted">Loading alerts…</li>
        )}
        {loaded && alerts.length === 0 && (
          <li className="p-4 text-sm text-foreground-muted">
            No alerts yet — add one above. Try: RELIANCE.NS, price above ₹1300.
          </li>
        )}
        {alerts.map((alert) => (
          <li key={alert._id} className="flex items-center justify-between gap-4 p-4">
            <div className="flex flex-col">
              <span className="font-mono text-sm font-medium">{alert.symbol}</span>
              <span className="text-xs text-foreground-muted">
                {CONDITION_LABELS[alert.condition.type]} {alert.condition.value}
              </span>
              {alert.lastTriggeredAt && (
                <span className="text-xs text-foreground-muted">
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
                      : "bg-background text-foreground-muted"
                }`}
              >
                {alert.status}
              </span>
              <button
                onClick={() => toggleStatus(alert)}
                className="text-xs rounded-full border border-border px-3 py-1.5 hover:bg-background transition-colors"
              >
                {alert.status === "active" ? "Pause" : "Activate"}
              </button>
              <button
                onClick={() => remove(alert._id)}
                className="text-xs text-foreground-muted hover:text-red-500 transition-colors"
                aria-label={`Remove alert for ${alert.symbol}`}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Disclaimer>
        Alerts are checked periodically in the background and delivered as a push notification.
        Push requires notification permission — see the browser prompt on first visit.{" "}
        {NOT_INVESTMENT_ADVICE}
      </Disclaimer>
    </div>
  );
}
