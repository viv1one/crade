"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Disclaimer } from "../disclaimer";
import { NOT_INVESTMENT_ADVICE, FREE_DATA_SOURCE, MANUAL_HOLDINGS_ONLY } from "@/lib/disclaimers";
import { annualizedReturnPct } from "@/lib/holdings-cagr";

interface RealHolding {
  _id: string;
  symbol: string;
  qty: number;
  avgCost: number;
  note?: string;
  purchasedAt?: string;
}

export function HoldingsPanel() {
  const [holdings, setHoldings] = useState<RealHolding[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({});

  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [note, setNote] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function load() {
    fetch("/api/holdings")
      .then((res) => res.json())
      .then(setHoldings)
      .finally(() => setLoaded(true));
  }

  useEffect(load, []);

  const refreshPrices = useCallback(async () => {
    const symbols = holdings.map((h) => h.symbol);
    if (symbols.length === 0) return;
    const entries = await Promise.all(
      symbols.map(async (s) => {
        try {
          const res = await fetch(`/api/quote/${encodeURIComponent(s)}`);
          if (!res.ok) return null;
          const data = await res.json();
          return [s, data.price as number] as const;
        } catch {
          return null;
        }
      })
    );
    setPrices((prev) => {
      const next = { ...prev };
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.map((h) => h.symbol).join(",")]);

  useEffect(() => {
    refreshPrices();
  }, [refreshPrices]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      setError("Enter a symbol");
      return;
    }
    if (!normalizedSymbol.includes(".")) normalizedSymbol = `${normalizedSymbol}.NS`;

    const numericQty = Number(qty);
    const numericAvgCost = Number(avgCost);
    if (!Number.isFinite(numericQty) || numericQty <= 0) {
      setError("Enter a positive quantity");
      return;
    }
    if (!Number.isFinite(numericAvgCost) || numericAvgCost <= 0) {
      setError("Enter a positive average cost");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: normalizedSymbol,
          qty: numericQty,
          avgCost: numericAvgCost,
          note: note.trim() || undefined,
          purchasedAt: purchasedAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add holding");
      setSymbol("");
      setQty("");
      setAvgCost("");
      setNote("");
      setPurchasedAt("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add holding");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    setRemovingId(id);
    try {
      await fetch(`/api/holdings/${id}`, { method: "DELETE" });
      load();
    } finally {
      setRemovingId(null);
    }
  }

  const totalInvested = holdings.reduce((sum, h) => sum + h.qty * h.avgCost, 0);
  const totalValue = holdings.reduce((sum, h) => sum + h.qty * (prices[h.symbol] ?? h.avgCost), 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">My Holdings</h1>
        <p className="text-sm text-black/50 dark:text-white/50 mt-1">
          Investments you already own, bought elsewhere (e.g. via your broker) — tracked here for
          research only. Separate from the simulated Paper Portfolio on the home page: no fake cash,
          no trades placed through Crade.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol, e.g. RELIANCE.NS"
          aria-label="Symbol"
          className="flex-1 min-w-[10rem] rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          type="number"
          placeholder="Quantity"
          aria-label="Quantity"
          className="w-28 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <input
          value={avgCost}
          onChange={(e) => setAvgCost(e.target.value)}
          type="number"
          placeholder="Avg cost (₹)"
          aria-label="Average cost"
          className="w-28 rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional), e.g. via Groww"
          aria-label="Note"
          className="flex-1 min-w-[10rem] rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <input
          value={purchasedAt}
          onChange={(e) => setPurchasedAt(e.target.value)}
          type="date"
          max={new Date().toISOString().slice(0, 10)}
          aria-label="Purchase date (optional, for annualized return)"
          title="Purchase date (optional) — enables an annualized return alongside total P&L"
          className="rounded-lg border border-black/[.08] dark:border-white/[.145] bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

      {loaded && holdings.length > 0 && (
        <div className="grid grid-cols-3 gap-4 rounded-lg border border-black/[.08] dark:border-white/[.145] p-4">
          <div>
            <div className="text-xs text-black/50 dark:text-white/50">Invested</div>
            <div className="font-mono text-sm font-medium">₹{totalInvested.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-black/50 dark:text-white/50">Current value</div>
            <div className="font-mono text-sm font-medium">₹{totalValue.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-black/50 dark:text-white/50">Total P&amp;L</div>
            <div
              className={`font-mono text-sm font-medium ${totalPnl >= 0 ? "text-green-600" : "text-red-500"}`}
            >
              {totalPnl >= 0 ? "+" : ""}₹{totalPnl.toFixed(2)} ({totalPnl >= 0 ? "+" : ""}
              {totalPnlPct.toFixed(2)}%)
            </div>
          </div>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145] rounded-lg border border-black/[.08] dark:border-white/[.145]">
        {!loaded && <li className="p-4 text-sm text-black/50 dark:text-white/50">Loading holdings…</li>}
        {loaded && holdings.length === 0 && (
          <li className="p-4 text-sm text-black/50 dark:text-white/50">
            No holdings yet — add one above. Try: RELIANCE.NS, 10 shares @ ₹1300.
          </li>
        )}
        {holdings.map((h) => {
          const price = prices[h.symbol] ?? h.avgCost;
          const pnl = (price - h.avgCost) * h.qty;
          const pnlPct = ((price - h.avgCost) / h.avgCost) * 100;
          const invested = h.qty * h.avgCost;
          const currentValue = h.qty * price;
          const cagr = h.purchasedAt
            ? annualizedReturnPct(invested, currentValue, new Date(h.purchasedAt))
            : undefined;
          return (
            <li key={h._id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex flex-col">
                <Link
                  href={`/?symbol=${encodeURIComponent(h.symbol)}#chat`}
                  className="font-mono text-sm font-medium underline-offset-4 hover:underline"
                  title={`Research ${h.symbol} in AI Chat`}
                >
                  {h.symbol}
                </Link>
                <span className="text-xs text-black/50 dark:text-white/50">
                  {h.qty} @ avg ₹{h.avgCost.toFixed(2)}
                  {h.purchasedAt ? ` · bought ${new Date(h.purchasedAt).toLocaleDateString()}` : ""}
                  {h.note ? ` — ${h.note}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-xs text-right ${pnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                  <div>
                    {pnl >= 0 ? "+" : ""}₹{pnl.toFixed(2)}
                  </div>
                  <div>
                    ({pnl >= 0 ? "+" : ""}
                    {pnlPct.toFixed(2)}%)
                  </div>
                  {cagr !== undefined && (
                    <div className="text-black/40 dark:text-white/40" title="Annualized return since purchase date">
                      {cagr >= 0 ? "+" : ""}
                      {cagr.toFixed(2)}%/yr
                    </div>
                  )}
                </div>
                <button
                  onClick={() => remove(h._id)}
                  disabled={removingId === h._id}
                  className="text-xs text-black/50 dark:text-white/50 hover:text-red-500 transition-colors disabled:opacity-40"
                  aria-label={`Remove ${h.symbol} from My Holdings`}
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <Disclaimer>
        {MANUAL_HOLDINGS_ONLY} {FREE_DATA_SOURCE} {NOT_INVESTMENT_ADVICE}
      </Disclaimer>
    </div>
  );
}
