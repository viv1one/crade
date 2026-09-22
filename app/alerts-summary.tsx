"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AlertRow {
  _id: string;
  symbol: string;
  condition: { type: string; value: number };
  status: "active" | "paused" | "triggered";
}

const CONDITION_LABELS: Record<string, string> = {
  price_above: "price above",
  price_below: "price below",
  rsi_below: "RSI below",
  volume_spike: "volume spike",
};

export function AlertsSummary() {
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);

  useEffect(() => {
    fetch("/api/alerts")
      .then((res) => res.json())
      .then((data) => setAlerts(Array.isArray(data) ? data : []))
      .catch(() => setAlerts([]));
  }, []);

  if (alerts === null) return null;

  const triggered = alerts.filter((a) => a.status === "triggered");
  const activeCount = alerts.filter((a) => a.status === "active").length;

  if (triggered.length === 0 && activeCount === 0) {
    return null;
  }

  if (triggered.length > 0) {
    return (
      <div className="w-full max-w-2xl alert-banner alert-banner-warning">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-warning">
            {triggered.length} alert{triggered.length > 1 ? "s" : ""} triggered
          </span>
          <Link href="/alerts" className="text-xs underline underline-offset-4 hover:no-underline">
            Manage alerts →
          </Link>
        </div>
        <ul className="flex flex-col gap-1">
          {triggered.map((a) => (
            <li key={a._id} className="text-sm font-mono">
              {a.symbol}{" "}
              <span className="font-sans text-foreground-muted">
                — {CONDITION_LABELS[a.condition.type] ?? a.condition.type} {a.condition.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl flex items-center justify-between text-sm text-foreground-muted">
      <span>{activeCount} active alert{activeCount > 1 ? "s" : ""}</span>
      <Link href="/alerts" className="text-xs underline underline-offset-4 hover:no-underline">
        Manage alerts →
      </Link>
    </div>
  );
}
