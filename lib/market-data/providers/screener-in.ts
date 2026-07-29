import type { Fundamentals, HistoricalBar, MarketDataProvider, Quote } from "../types";
import { fetchWithRetry } from "../fetch-with-retry";

// screener.in's public company page (not an official API). Same
// "prototyping only, not licensed for redistribution" caveat as
// yahoo-free.ts/nse-free.ts. Added specifically because Yahoo's
// quoteSummary endpoint (the source for getFundamentals) has been the
// least reliable data source in this app all session — this has been
// observed reachable when Yahoo/NSE were not, for exactly the fields
// Yahoo keeps failing on (P/E, market cap, dividend yield). Scraped HTML,
// not a stable contract — screener.in can change the page structure
// without notice.
//
// Only getFundamentals is implemented. getQuote/getHistorical reject
// immediately (no network call) so withFallback moves on to the next
// provider at essentially zero cost.
const BASE_URL = "https://www.screener.in/company";

function stripSuffix(symbol: string): string {
  return symbol.replace(/\.(NS|BO)$/i, "");
}

// The ratios list on screener.in is a series of
// <span class="name">LABEL</span> ... <span class="number">VALUE</span>
// blocks with irregular internal whitespace, so this matches on the plain
// label text and then looks for the next numeric span within a bounded
// window rather than an exact tag pattern.
export function extractRatio(html: string, label: string): number | undefined {
  const labelIdx = html.indexOf(label);
  if (labelIdx === -1) return undefined;
  const window = html.slice(labelIdx, labelIdx + 600);
  const match = window.match(/<span class="number">([\d,.-]+)<\/span>/);
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

export const screenerInProvider: MarketDataProvider = {
  name: "screener-in",

  getQuote(): Promise<Quote> {
    return Promise.reject(new Error("screener-in: getQuote not supported"));
  },

  getHistorical(): Promise<HistoricalBar[]> {
    return Promise.reject(new Error("screener-in: getHistorical not supported"));
  },

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const sym = stripSuffix(symbol);
    const res = await fetchWithRetry(`${BASE_URL}/${sym}/`);
    if (!res.ok) {
      throw new Error(`screener-in getFundamentals failed for ${symbol}: ${res.status}`);
    }
    const html = await res.text();

    const peRatio = extractRatio(html, "Stock P/E");
    const marketCapCr = extractRatio(html, "Market Cap");
    const dividendYieldPct = extractRatio(html, "Dividend Yield");

    if (peRatio == null && marketCapCr == null && dividendYieldPct == null) {
      throw new Error(`screener-in getFundamentals: no data for ${symbol}`);
    }

    return {
      symbol,
      peRatio,
      marketCap: marketCapCr != null ? marketCapCr * 1e7 : undefined, // Cr -> rupees
      dividendYield: dividendYieldPct != null ? dividendYieldPct / 100 : undefined, // % -> fraction
    };
  },
};
