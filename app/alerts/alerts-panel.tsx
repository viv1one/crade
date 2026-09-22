"use client";

import { useEffect, useState } from "react";
import { Disclaimer } from "../disclaimer";
import { NOT_INVESTMENT_ADVICE } from "@/lib/disclaimers";
import { SymbolDatalist, SYMBOL_SUGGESTIONS_ID } from "../symbol-datalist";
import { CONDITION_LABELS, type ConditionType } from "@/lib/alerts/labels";
import { nextEvaluationTime } from "@/lib/alerts/next-evaluation";
import { useToast } from "../toast-provider";

interface Alert {
  _id: string;
  symbol: string;
  condition: { type: ConditionType; value: number };
  channel: "push" | "email";
  status: "active" | "paused" | "triggered";
  lastTriggeredAt?: string;
}

export function AlertsPanel() {
  const { showToast } = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [conditionType, setConditionType] = useState<ConditionType>("price_above");
  const [value, setValue] = useState("");
  const [channel, setChannel] = useState<"push" | "email">("push");
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
          channel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create alert");
      setSymbol("");
      setValue("");
      load();
      showToast(`Alert created for ${data.symbol}`, "success");
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
    showToast(`${alert.symbol} alert ${nextStatus}`, "neutral");
  }

  async function remove(id: string, symbol: string) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    load();
    showToast(`Removed alert for ${symbol}`, "neutral");
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">
      <SymbolDatalist />
      <h1 className="text-2xl font-semibold">Alerts</h1>

      {!pushGranted && (
        <div className="alert-banner alert-banner-warning">
          <p className="text-sm text-warning">
            Push notifications aren&apos;t enabled on this device yet — enable them above, or an
            alert firing won&apos;t actually notify you.
          </p>
        </div>
      )}

      <form onSubmit={handleCreate} className="card p-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wide">When</span>
            <div className="flex flex-col sm:flex-row gap-2">
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
            </div>
          </div>

          <span className="hidden sm:block text-foreground-muted text-lg self-center" aria-hidden="true">➔</span>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wide">Then</span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as "push" | "email")}
              aria-label="Delivery channel"
              className="input"
            >
              <option value="push">Push notification</option>
              <option value="email">Email</option>
            </select>
          </div>
        </div>

        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-40 self-start">
          Add alert
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-foreground-muted -mt-4">
        {/* Forced to IST rather than the viewer's browser locale — NSE/BSE
            only ever trade in IST, so this app's whole domain is IST
            regardless of who's looking, unlike lastTriggeredAt elsewhere
            (a plain timestamp of a real event) where local time is the
            right call. */}
        Evaluated every 4 hours. Next check: {nextEvaluationTime().toLocaleString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        })}{" "}
        IST.
      </p>

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
          <li key={alert._id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex flex-col">
              <span className="font-mono text-sm font-medium">{alert.symbol}</span>
              <span className="text-xs text-foreground-muted">
                {CONDITION_LABELS[alert.condition.type]} {alert.condition.value}
                {" · "}
                <span className="badge badge-neutral">{alert.channel}</span>
              </span>
              {alert.lastTriggeredAt && (
                <span className="text-xs text-foreground-muted">
                  Last triggered {new Date(alert.lastTriggeredAt).toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`badge ${
                  alert.status === "active"
                    ? "badge-success"
                    : alert.status === "triggered"
                      ? "badge-warning"
                      : "badge-neutral"
                }`}
              >
                {alert.status}
              </span>
              <button onClick={() => toggleStatus(alert)} className="btn-secondary-sm">
                {alert.status === "active" ? "Pause" : "Activate"}
              </button>
              <button
                onClick={() => remove(alert._id, alert.symbol)}
                className="p-1 text-sm text-foreground-muted hover:text-danger transition-colors"
                aria-label={`Remove alert for ${alert.symbol}`}
                title={`Remove alert for ${alert.symbol}`}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Disclaimer>
        Alerts are checked periodically in the background and delivered as a push notification or
        an email, depending on the channel chosen when the alert was created. Push requires
        notification permission — see the browser prompt on first visit. {NOT_INVESTMENT_ADVICE}
      </Disclaimer>
    </div>
  );
}
