"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Disclaimer } from "../disclaimer";
import { NOT_INVESTMENT_ADVICE, FREE_DATA_SOURCE, MANUAL_HOLDINGS_ONLY } from "@/lib/disclaimers";
import { annualizedReturnPct } from "@/lib/holdings-cagr";
import { parseBulkHoldings } from "@/lib/holdings-bulk-parse";
import { NIFTY_50 } from "@/lib/screener/universe";

const SYMBOL_SUGGESTIONS_ID = "nifty50-symbol-suggestions";

// Shared by both the single-add symbol input and the bulk "find & insert"
// helper below — one <datalist>, referenced by list="..." from either
// input. Native browser autocomplete matches against both the option's
// value (the ticker) and its visible text (the company name), so typing
// "ad" surfaces ADANIENT.NS/ADANIPORTS.NS whether the user thinks in
// tickers or names.
function SymbolDatalist() {
  return (
    <datalist id={SYMBOL_SUGGESTIONS_ID}>
      {NIFTY_50.map((s) => (
        <option key={s.symbol} value={s.symbol}>
          {s.name}
        </option>
      ))}
    </datalist>
  );
}

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

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ added: number; errors: string[] } | null>(null);
  const [symbolPicker, setSymbolPicker] = useState("");
  const bulkTextareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Submits parsed rows one at a time (not Promise.all) — if the same
  // symbol appears on two lines, each POST needs to see the previous one's
  // merge already applied, or a parallel race would silently drop one.
  async function handleBulkAdd(e: React.FormEvent) {
    e.preventDefault();
    setBulkResult(null);
    const { rows, errors: parseErrors } = parseBulkHoldings(bulkText);
    const lineErrors = parseErrors.map((err) => `Line ${err.line}: ${err.raw || "(blank)"} — ${err.message}`);

    if (rows.length === 0) {
      setBulkResult({ added: 0, errors: lineErrors.length > 0 ? lineErrors : ["Nothing to add — enter at least one line"] });
      return;
    }

    setBulkSubmitting(true);
    let added = 0;
    const submitErrors = [...lineErrors];
    for (const row of rows) {
      try {
        const res = await fetch("/api/holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: row.symbol, qty: row.qty, avgCost: row.avgCost }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to add");
        added++;
      } catch (err) {
        submitErrors.push(
          `Line ${row.line}: ${row.symbol} — ${err instanceof Error ? err.message : "failed to add"}`
        );
      }
    }
    setBulkSubmitting(false);
    setBulkResult({ added, errors: submitErrors });
    if (added > 0) {
      setBulkText("");
      load();
    }
  }

  // Fires as the user types/selects in the bulk "find a symbol" helper.
  // Datalist selection sets the input's value to the chosen option's
  // value (the ticker) — treat an exact match against the known universe
  // as "they picked a suggestion," append a line for it, and clear the
  // picker so it's ready for the next one.
  function handleSymbolPick(value: string) {
    setSymbolPicker(value);
    const match = NIFTY_50.find((s) => s.symbol === value.trim().toUpperCase());
    if (!match) return;
    setBulkText((prev) => (prev && !prev.endsWith("\n") ? `${prev}\n${match.symbol} ` : `${prev}${match.symbol} `));
    setSymbolPicker("");
    bulkTextareaRef.current?.focus();
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
      <SymbolDatalist />
      <div>
        <h1 className="text-2xl font-semibold">My Holdings</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Investments you already own, bought elsewhere (e.g. via your broker) — tracked here for
          research only. Separate from the simulated Paper Portfolio on the home page: no fake cash,
          no trades placed through Crade.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol, e.g. RELIANCE.NS or Adani"
          aria-label="Symbol"
          list={SYMBOL_SUGGESTIONS_ID}
          className="input flex-1 min-w-[10rem]"
        />
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          type="number"
          placeholder="Quantity"
          aria-label="Quantity"
          className="input w-28"
        />
        <input
          value={avgCost}
          onChange={(e) => setAvgCost(e.target.value)}
          type="number"
          placeholder="Avg cost (₹)"
          aria-label="Average cost"
          className="input w-28"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional), e.g. via Groww"
          aria-label="Note"
          className="input flex-1 min-w-[10rem]"
        />
        <input
          value={purchasedAt}
          onChange={(e) => setPurchasedAt(e.target.value)}
          type="date"
          max={new Date().toISOString().slice(0, 10)}
          aria-label="Purchase date (optional, for annualized return)"
          title="Purchase date (optional) — enables an annualized return alongside total P&L"
          className="input"
        />
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-40">
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => setBulkMode((v) => !v)}
        className="self-start text-xs underline underline-offset-4 text-foreground-muted hover:text-foreground"
      >
        {bulkMode ? "Hide bulk add" : "Have several? Add multiple at once →"}
      </button>

      {bulkMode && (
        <form onSubmit={handleBulkAdd} className="flex flex-col gap-2">
          <label className="text-xs text-foreground-muted" htmlFor="bulk-holdings">
            One holding per line: symbol, quantity, avg cost — e.g.
          </label>
          <input
            value={symbolPicker}
            onChange={(e) => handleSymbolPick(e.target.value)}
            list={SYMBOL_SUGGESTIONS_ID}
            placeholder="Find & insert a symbol, e.g. Adani"
            aria-label="Find and insert a symbol into the list below"
            className="input w-64"
          />
          <textarea
            id="bulk-holdings"
            ref={bulkTextareaRef}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"TCS 10 3800\nRELIANCE.NS, 5, 1300\nINFY 20 1450.50"}
            rows={5}
            aria-label="Multiple holdings, one per line"
            className="input font-mono"
          />
          <button
            type="submit"
            disabled={bulkSubmitting || !bulkText.trim()}
            className="btn-primary self-start disabled:opacity-40"
          >
            {bulkSubmitting ? "Adding…" : "Add all"}
          </button>
          {bulkResult && (
            <div role="status" className="text-sm">
              {bulkResult.added > 0 && (
                <p className="text-green-600">
                  Added {bulkResult.added} holding{bulkResult.added === 1 ? "" : "s"}.
                </p>
              )}
              {bulkResult.errors.length > 0 && (
                <ul className="text-red-500 text-xs list-disc list-inside">
                  {bulkResult.errors.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      )}

      {loaded && holdings.length > 0 && (
        <div className="card grid grid-cols-3 gap-4 p-4">
          <div>
            <div className="text-xs text-foreground-muted">Invested</div>
            <div className="font-mono text-sm font-medium">₹{totalInvested.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-foreground-muted">Current value</div>
            <div className="font-mono text-sm font-medium">₹{totalValue.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-foreground-muted">Total P&amp;L</div>
            <div
              className={`font-mono text-sm font-medium ${totalPnl >= 0 ? "text-green-600" : "text-red-500"}`}
            >
              {totalPnl >= 0 ? "+" : ""}₹{totalPnl.toFixed(2)} ({totalPnl >= 0 ? "+" : ""}
              {totalPnlPct.toFixed(2)}%)
            </div>
          </div>
        </div>
      )}

      <ul className="card flex flex-col divide-y divide-border overflow-hidden">
        {!loaded && <li className="p-4 text-sm text-foreground-muted">Loading holdings…</li>}
        {loaded && holdings.length === 0 && (
          <li className="p-4 text-sm text-foreground-muted">
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
                <span className="text-xs text-foreground-muted">
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
                    <div className="text-foreground-muted" title="Annualized return since purchase date">
                      {cagr >= 0 ? "+" : ""}
                      {cagr.toFixed(2)}%/yr
                    </div>
                  )}
                </div>
                <button
                  onClick={() => remove(h._id)}
                  disabled={removingId === h._id}
                  className="text-xs text-foreground-muted hover:text-red-500 transition-colors disabled:opacity-40"
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
