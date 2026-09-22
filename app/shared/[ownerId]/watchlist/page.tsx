"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Quote } from "@/lib/market-data";
import { AppShellNav } from "@/app/app-shell-nav";
import { Disclaimer } from "@/app/disclaimer";
import { FREE_DATA_SOURCE, NOT_INVESTMENT_ADVICE } from "@/lib/disclaimers";

interface RowState {
  quote?: Quote;
  loading: boolean;
  error?: string;
}

export default function SharedWatchlistPage() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  useEffect(() => {
    fetch(`/api/shared/${ownerId}/watchlist`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load shared watchlist");
        setOwnerEmail(data.ownerEmail);
        setSymbols(data.symbols);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [ownerId]);

  useEffect(() => {
    if (!symbols) return;
    symbols.forEach((symbol) => {
      setRowState((prev) => ({ ...prev, [symbol]: { loading: true } }));
      fetch(`/api/quote/${encodeURIComponent(symbol)}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Failed to fetch quote");
          setRowState((prev) => ({ ...prev, [symbol]: { quote: data, loading: false } }));
        })
        .catch((err) =>
          setRowState((prev) => ({
            ...prev,
            [symbol]: { loading: false, error: err instanceof Error ? err.message : "Failed" },
          }))
        );
    });
  }, [symbols]);

  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 pb-20 sm:p-20">
      <AppShellNav />
      <main className="w-full max-w-2xl flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">
          {ownerEmail ? `${ownerEmail}'s watchlist` : "Shared watchlist"}
        </h1>
        {ownerEmail && (
          <p className="text-xs text-foreground-muted">
            Shared by <span className="font-medium">{ownerEmail}</span> via Crade — read-only, you can
            view but not edit this.
          </p>
        )}
        {!ownerEmail && (
          <p className="text-xs text-foreground-muted">Read-only — you can view but not edit this.</p>
        )}

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        <ul className="card flex flex-col divide-y divide-border overflow-hidden">
          {symbols === null && !error && (
            <li className="p-4 text-sm text-foreground-muted">Loading…</li>
          )}
          {symbols?.length === 0 && (
            <li className="p-4 text-sm text-foreground-muted">This watchlist is empty.</li>
          )}
          {symbols?.map((symbol) => {
            const row = rowState[symbol];
            return (
              <li key={symbol} className="flex items-center justify-between p-4">
                <span className="font-mono text-sm font-medium">{symbol}</span>
                {row?.loading && (
                  <span className="text-xs text-foreground-muted">Loading…</span>
                )}
                {row?.error && <span className="text-xs text-danger">{row.error}</span>}
                {row?.quote && (
                  <span
                    className={`text-sm font-mono ${
                      row.quote.change >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    ₹{row.quote.price.toFixed(2)} ({row.quote.change >= 0 ? "+" : ""}
                    {row.quote.changePercent.toFixed(2)}%)
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <Disclaimer>
          {FREE_DATA_SOURCE} {NOT_INVESTMENT_ADVICE}
        </Disclaimer>
      </main>
    </div>
  );
}
