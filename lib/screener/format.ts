import type { ScreenerRow } from "./types";

// CSV data block fed to AI prompts that reason over real screener data —
// shared by app/api/screener/ai-query/route.ts and
// app/api/holdings/diversify/route.ts so both features see the exact same
// table shape/contract, not two independently-drifting copies.
export function formatScreenerRowsForPrompt(rows: ScreenerRow[]): string {
  const header = "symbol,sector,price,changePercent,peRatio,marketCap,dividendYieldPercent";
  const lines = rows.map((r) =>
    [
      r.symbol,
      r.sector,
      r.price.toFixed(2),
      r.changePercent.toFixed(2),
      r.peRatio?.toFixed(1) ?? "",
      r.marketCap ?? "",
      // ScreenerRow.dividendYield is stored as a raw fraction (0.05 = 5%),
      // same convention as everywhere else this field is used
      // (lib/portfolio/diagnostics.ts, lib/ai/context.ts) — ×100 here so
      // the model sees (and echoes back) an actual percentage instead of
      // a near-zero-looking fraction.
      r.dividendYield != null ? (r.dividendYield * 100).toFixed(2) : "",
    ].join(",")
  );
  return [header, ...lines].join("\n");
}
