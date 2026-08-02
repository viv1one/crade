export interface ParsedHoldingRow {
  line: number; // 1-based, for error reporting
  symbol: string;
  qty: number;
  avgCost: number;
}

export interface BulkParseError {
  line: number;
  raw: string;
  message: string;
}

export interface BulkParseResult {
  rows: ParsedHoldingRow[];
  errors: BulkParseError[];
}

// One holding per line: "SYMBOL QTY AVGCOST", comma- or whitespace-
// separated ("TCS 10 3800" and "RELIANCE.NS, 5, 1300" both work). Blank
// lines are skipped silently; a malformed line is collected as an error
// without blocking the rest of the paste from parsing — someone pasting a
// dozen lines from memory shouldn't lose all of them over one typo.
export function parseBulkHoldings(text: string): BulkParseResult {
  const rows: ParsedHoldingRow[] = [];
  const errors: BulkParseError[] = [];

  text.split("\n").forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;

    const tokens = trimmed
      .replace(/,/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length !== 3) {
      errors.push({ line, raw: trimmed, message: 'expected "symbol qty price"' });
      return;
    }

    const [symbolRaw, qtyRaw, avgCostRaw] = tokens;
    let symbol = symbolRaw.toUpperCase();
    if (!symbol.includes(".")) symbol = `${symbol}.NS`;

    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push({ line, raw: trimmed, message: "quantity must be a positive number" });
      return;
    }

    const avgCost = Number(avgCostRaw);
    if (!Number.isFinite(avgCost) || avgCost <= 0) {
      errors.push({ line, raw: trimmed, message: "avg cost must be a positive number" });
      return;
    }

    rows.push({ line, symbol, qty, avgCost });
  });

  return { rows, errors };
}
