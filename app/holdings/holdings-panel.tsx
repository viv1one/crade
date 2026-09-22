"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Disclaimer } from "../disclaimer";
import { NOT_INVESTMENT_ADVICE, FREE_DATA_SOURCE, MANUAL_HOLDINGS_ONLY } from "@/lib/disclaimers";
import { annualizedReturnPct } from "@/lib/holdings-cagr";
import { parseBulkHoldings } from "@/lib/holdings-bulk-parse";
import { NIFTY_50 } from "@/lib/screener/universe";
import { SymbolDatalist, SYMBOL_SUGGESTIONS_ID } from "../symbol-datalist";
import { PortfolioDiagnostics } from "../portfolio-diagnostics";
import { SectorPieChart } from "./sector-pie-chart";
import { RiskExposureChart } from "./risk-exposure-chart";
import { HoldingsDiversify } from "../holdings-diversify";
import { CONDITION_LABELS, type ConditionType } from "@/lib/alerts/labels";
import { useSwipeAction } from "../use-swipe-action";
import { useToast } from "../toast-provider";

interface RealHolding {
  _id: string;
  symbol: string;
  qty: number;
  avgCost: number;
  note?: string;
  purchasedAt?: string;
}

interface HoldingRowProps {
  h: RealHolding;
  price: number;
  removingId: string | null;
  alertFormFor: string | null;
  alertConditionType: ConditionType;
  alertValue: string;
  alertSubmitting: boolean;
  alertCreatedFor: string | null;
  onOpenAlertForm: (h: RealHolding) => void;
  onRemove: (id: string) => void;
  onAlertConditionTypeChange: (t: ConditionType) => void;
  onAlertValueChange: (v: string) => void;
  onCreateQuickAlert: (symbol: string) => void;
  onCancelAlertForm: () => void;
}

// Extracted so useSwipeAction (a hook) can be called once per row — hooks
// can't be called inside the parent's .map() callback. Swipe left opens
// the same quick-alert form the 🔔 button already does (progressive
// enhancement, same reasoning as app/watchlist.tsx's swipe rows — the tap
// button stays as the verified fallback). Swipe right is a no-op here
// (there's no equally obvious second action the way Watchlist has Buy AND
// Sell) rather than reusing it for something unrelated.
function HoldingRow({
  h,
  price,
  removingId,
  alertFormFor,
  alertConditionType,
  alertValue,
  alertSubmitting,
  alertCreatedFor,
  onOpenAlertForm,
  onRemove,
  onAlertConditionTypeChange,
  onAlertValueChange,
  onCreateQuickAlert,
  onCancelAlertForm,
}: HoldingRowProps) {
  const pnl = (price - h.avgCost) * h.qty;
  const pnlPct = ((price - h.avgCost) / h.avgCost) * 100;
  const invested = h.qty * h.avgCost;
  const currentValue = h.qty * price;
  const cagr = h.purchasedAt ? annualizedReturnPct(invested, currentValue, new Date(h.purchasedAt)) : undefined;

  const swipe = useSwipeAction({ onSwipeLeft: () => onOpenAlertForm(h) });
  const revealOpacity = Math.min(Math.abs(Math.min(swipe.translateX, 0)) / 80, 1);

  return (
    <li className="relative overflow-hidden">
      <div
        className="absolute inset-0 flex items-center justify-end px-4 text-sm font-semibold text-background bg-vault-accent"
        style={{ opacity: revealOpacity }}
        aria-hidden="true"
      >
        🔔 Create alert
      </div>
      <div
        className="relative bg-surface flex flex-col gap-2 p-4 touch-pan-y"
        style={{
          transform: `translateX(${Math.min(swipe.translateX, 0)}px)`,
          transition: swipe.dragging ? "none" : "transform 0.2s ease",
        }}
        onPointerDown={swipe.handlers.onPointerDown}
        onPointerMove={swipe.handlers.onPointerMove}
        onPointerUp={swipe.handlers.onPointerUp}
        onPointerCancel={swipe.handlers.onPointerCancel}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
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
            <div className={`text-sm font-semibold text-right ${pnl >= 0 ? "text-success" : "text-danger"}`}>
              <div>
                {pnl >= 0 ? "+" : ""}₹{pnl.toFixed(2)}
              </div>
              <div className="text-xs font-normal">
                ({pnl >= 0 ? "+" : ""}
                {pnlPct.toFixed(2)}%)
              </div>
              {cagr !== undefined && (
                <div className="text-xs font-normal text-foreground-muted" title="Annualized return since purchase date">
                  {cagr >= 0 ? "+" : ""}
                  {cagr.toFixed(2)}%/yr
                </div>
              )}
            </div>
            <button
              onClick={() => onOpenAlertForm(h)}
              className="p-1 text-sm text-foreground-muted hover:text-foreground transition-colors"
              aria-label={`Create an alert for ${h.symbol}`}
              title="Create an alert for this holding (or swipe left)"
            >
              🔔
            </button>
            <button
              onClick={() => onRemove(h._id)}
              disabled={removingId === h._id}
              className="p-1 text-sm text-foreground-muted hover:text-danger transition-colors disabled:opacity-40"
              aria-label={`Remove ${h.symbol} from My Holdings`}
              title={`Remove ${h.symbol} from My Holdings`}
            >
              ✕
            </button>
          </div>
        </div>

        {alertFormFor === h.symbol && (
          <div className="flex flex-wrap items-center gap-2 rounded-[7px] bg-surface-sunken p-3">
            <select
              value={alertConditionType}
              onChange={(e) => onAlertConditionTypeChange(e.target.value as ConditionType)}
              aria-label="Alert condition"
              className="input text-xs"
            >
              {Object.entries(CONDITION_LABELS).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
            <input
              value={alertValue}
              onChange={(e) => onAlertValueChange(e.target.value)}
              type="number"
              aria-label="Condition value"
              className="input w-24 text-xs"
            />
            <button
              onClick={() => onCreateQuickAlert(h.symbol)}
              disabled={alertSubmitting}
              className="btn-primary text-xs disabled:opacity-40"
            >
              {alertSubmitting ? "Creating…" : "Create"}
            </button>
            <button onClick={onCancelAlertForm} className="text-xs text-foreground-muted hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        )}
        {alertCreatedFor === h.symbol && (
          <p className="text-xs text-success">
            ✓ Alert created —{" "}
            <Link href="/alerts" className="underline underline-offset-4">
              view on the Alerts page
            </Link>
            .
          </p>
        )}
      </div>
    </li>
  );
}

export function HoldingsPanel() {
  const { showToast } = useToast();
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

  // Quick "create an alert from this holding" — a convenience shortcut over
  // the existing POST /api/alerts (no backend changes needed), pre-filled
  // with a sensible default rather than requiring a trip to the Alerts page.
  const [alertFormFor, setAlertFormFor] = useState<string | null>(null);
  const [alertConditionType, setAlertConditionType] = useState<ConditionType>("price_below");
  const [alertValue, setAlertValue] = useState("");
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertCreatedFor, setAlertCreatedFor] = useState<string | null>(null);

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

  // Sector allocation (and concentration) is computed for free — see that
  // route's own comment on why it's a separate, non-AI endpoint from the
  // "Generate AI portfolio diagnostics" button below. Re-fetched whenever
  // the holding list itself changes (add/remove), same dependency as
  // refreshPrices above.
  const [sectorData, setSectorData] = useState<{
    sectorAllocations: { sector: string; allocationPct: number }[];
    topHoldingPct: number;
    top3ConcentrationPct: number;
    riskExposure: { symbol: string; allocationPct: number; volatilityPct: number }[];
  } | null>(null);
  useEffect(() => {
    if (holdings.length === 0) {
      setSectorData(null);
      return;
    }
    fetch("/api/holdings/sector-allocation")
      .then((res) => res.json())
      .then(setSectorData)
      .catch(() => setSectorData(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.map((h) => h.symbol).join(",")]);

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

  function openAlertForm(h: RealHolding) {
    setAlertFormFor(h.symbol);
    setAlertConditionType("price_below");
    // Pre-fill 10% under the live price if we have one, else 10% under
    // avgCost — a reasonable default, not a recommendation to trade at it.
    const basePrice = prices[h.symbol] ?? h.avgCost;
    setAlertValue((basePrice * 0.9).toFixed(2));
    setAlertCreatedFor(null);
  }

  async function createQuickAlert(symbol: string) {
    const numericValue = Number(alertValue);
    if (!Number.isFinite(numericValue)) return;
    setAlertSubmitting(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          condition: { type: alertConditionType, value: numericValue },
        }),
      });
      if (res.ok) {
        setAlertFormFor(null);
        setAlertCreatedFor(symbol);
        showToast(`Alert created for ${symbol}`, "success");
      } else {
        showToast(`Failed to create alert for ${symbol}`, "danger");
      }
    } finally {
      setAlertSubmitting(false);
    }
  }

  const totalInvested = holdings.reduce((sum, h) => sum + h.qty * h.avgCost, 0);
  const totalValue = holdings.reduce((sum, h) => sum + h.qty * (prices[h.symbol] ?? h.avgCost), 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">
      <SymbolDatalist />
      <div className="border-l-[3px] border-vault-accent pl-3">
        <h1 className="text-2xl font-semibold vault-heading">My Holdings — Vault</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Investments you already own, bought elsewhere (e.g. via your broker) — tracked here for
          research only. Separate from the simulated Paper Portfolio on the home page: no fake cash,
          no trades placed through Crade.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-foreground-muted flex-1 min-w-[10rem]">
          Symbol
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="e.g. RELIANCE.NS or Adani"
            list={SYMBOL_SUGGESTIONS_ID}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted w-28">
          Quantity
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            type="number"
            placeholder="Qty"
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted w-28">
          Avg cost (₹)
          <input
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            type="number"
            placeholder="Avg cost"
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted flex-1 min-w-[10rem]">
          Note (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. via Groww"
            className="input"
          />
        </label>
        <label
          className="flex flex-col gap-1 text-xs text-foreground-muted"
          title="Purchase date (optional) — enables an annualized return alongside total P&L"
        >
          Purchase date (optional)
          <input
            value={purchasedAt}
            onChange={(e) => setPurchasedAt(e.target.value)}
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            className="input"
          />
        </label>
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-40">
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
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
                <p className="text-success">
                  Added {bulkResult.added} holding{bulkResult.added === 1 ? "" : "s"}.
                </p>
              )}
              {bulkResult.errors.length > 0 && (
                <ul className="text-danger text-xs list-disc list-inside">
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
        <div className="card grid grid-cols-1 sm:grid-cols-3 gap-4 p-4">
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
              className={`font-mono text-base font-semibold ${totalPnl >= 0 ? "text-success" : "text-danger"}`}
            >
              {totalPnl >= 0 ? "+" : ""}₹{totalPnl.toFixed(2)} ({totalPnl >= 0 ? "+" : ""}
              {totalPnlPct.toFixed(2)}%)
            </div>
          </div>
        </div>
      )}

      {sectorData && sectorData.sectorAllocations.length > 0 && (
        <div className="card p-4 flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Sector allocation</h3>
          <SectorPieChart
            sectorAllocations={sectorData.sectorAllocations}
            topHoldingPct={sectorData.topHoldingPct}
            top3ConcentrationPct={sectorData.top3ConcentrationPct}
          />
        </div>
      )}

      {sectorData && sectorData.riskExposure.length > 0 && (
        <div className="card p-4 flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Risk exposure</h3>
          <RiskExposureChart entries={sectorData.riskExposure} />
        </div>
      )}

      <PortfolioDiagnostics
        endpoint="/api/holdings/diagnostics"
        hasHoldings={holdings.length > 0}
        allowDeepAnalysis
      />
      <HoldingsDiversify hasHoldings={holdings.length > 0} />

      <ul className="card flex flex-col divide-y divide-border overflow-hidden">
        {!loaded && <li className="p-4 text-sm text-foreground-muted">Loading holdings…</li>}
        {loaded && holdings.length === 0 && (
          <li className="p-4 text-sm text-foreground-muted">
            No holdings yet — add one above. Try: RELIANCE.NS, 10 shares @ ₹1300.
          </li>
        )}
        {holdings.map((h) => (
          <HoldingRow
            key={h._id}
            h={h}
            price={prices[h.symbol] ?? h.avgCost}
            removingId={removingId}
            alertFormFor={alertFormFor}
            alertConditionType={alertConditionType}
            alertValue={alertValue}
            alertSubmitting={alertSubmitting}
            alertCreatedFor={alertCreatedFor}
            onOpenAlertForm={openAlertForm}
            onRemove={remove}
            onAlertConditionTypeChange={setAlertConditionType}
            onAlertValueChange={setAlertValue}
            onCreateQuickAlert={createQuickAlert}
            onCancelAlertForm={() => setAlertFormFor(null)}
          />
        ))}
      </ul>

      <Disclaimer>
        {MANUAL_HOLDINGS_ONLY} {FREE_DATA_SOURCE} {NOT_INVESTMENT_ADVICE}
      </Disclaimer>
    </div>
  );
}
