// Regenerates lib/screener/nse-universe.ts from NSE's public bulk equity
// listing CSV. Run this periodically (npm run generate:nse-universe) to
// pick up new listings/delistings — same "hardcoded snapshot, re-verify
// periodically" convention lib/screener/universe.ts's hand-curated NIFTY_50
// already documents itself with, just with a repeatable generator instead
// of a one-time hand-curated list.
//
// Source: https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv —
// unofficial, not licensed for redistribution, same "prototyping only"
// footing as every other free NSE/Yahoo integration in this app (see
// CLAUDE.md's lib/market-data/ section). This endpoint may behave
// differently once run off a different egress IP than whatever generated
// the committed file — don't assume it works without checking.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CSV_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
const OUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "screener",
  "nse-universe.ts"
);

function toTitleCase(name) {
  return name
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

async function main() {
  const res = await fetch(CSV_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/csv",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch NSE equity list: HTTP ${res.status}`);
  }
  const csv = await res.text();
  const lines = csv.trim().split("\n").slice(1); // drop header row

  const stocks = [];
  const seen = new Set();
  for (const line of lines) {
    const fields = line.split(",");
    if (fields.length < 3) continue;
    const symbol = fields[0].trim();
    const name = fields[1].trim();
    const series = fields[2].trim();
    // EQ only — normal rolling-settlement equities, the same segment every
    // hand-curated NIFTY_50 entry is already in. Excludes BE/BZ
    // (trade-to-trade / surveillance series), which are thinner and less
    // likely to have reliable free-provider data anyway.
    if (series !== "EQ" || !symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    stocks.push({ symbol: `${symbol}.NS`, name: toTitleCase(name) });
  }
  stocks.sort((a, b) => a.symbol.localeCompare(b.symbol));

  const body = stocks
    .map((s) => `  { symbol: ${JSON.stringify(s.symbol)}, name: ${JSON.stringify(s.name)} },`)
    .join("\n");

  const fileContent = `// GENERATED FILE — do not hand-edit. Regenerate with:
//   npm run generate:nse-universe
// Source: NSE's public bulk equity listing CSV (see
// scripts/generate-nse-universe.mjs for the fetch/filter logic and the
// same "unofficial, prototyping only" caveat as every other free NSE/Yahoo
// integration documented in CLAUDE.md). EQ series only (normal rolling-
// settlement equities) — excludes BE/BZ trade-to-trade/surveillance series.
// Generated ${new Date().toISOString().slice(0, 10)}, ${stocks.length} symbols.
export interface NseStock {
  symbol: string;
  name: string;
}

export const ALL_NSE_STOCKS: NseStock[] = [
${body}
];
`;

  writeFileSync(OUT_PATH, fileContent);
  console.log(`Wrote ${stocks.length} symbols to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
