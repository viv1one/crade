import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { Fundamentals, HistoricalBar, MarketDataProvider, Quote } from "../types";

// Wraps the jugaad-data Python library (scripts/jugaad_bridge.py) — NSE's
// own current site, via a client that (unlike lib/market-data/providers/
// nse-free.ts's own hand-rolled session-cookie handling) was verified live
// from this dev environment to actually get through: quotes, historical
// bars, and real P/E + market cap (straight from NSE's own secInfo/
// tradeInfo fields — no screener.in scrape needed) all worked in ~1-2s.
//
// Dev-environment-only by construction, not by a feature flag: this shells
// out to a local `python3` with jugaad-data installed (see
// requirements.txt), which Vercel's Node serverless functions don't have.
// In production the very first execFile call fails with ENOENT, which
// lib/market-data/fallback-provider.ts's withFallback() already treats
// like any other provider failure — it just falls through to the next
// provider in the chain (see lib/market-data/index.ts). Nothing here needs
// to know it's "not available in prod"; the fallback chain handles that
// for free.
const execFileAsync = promisify(execFile);
const BRIDGE_SCRIPT = path.join(process.cwd(), "scripts", "jugaad_bridge.py");
const TIMEOUT_MS = 20_000;

async function runBridge(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync("python3", [BRIDGE_SCRIPT, ...args], {
    timeout: TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function stripSuffix(symbol: string): string {
  return symbol.replace(/\.(NS|BO)$/i, "");
}

function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeToDays(range: string): number {
  const match = range.match(/^(\d+)(d|mo|y)$/);
  if (!match) return 365;
  const n = Number(match[1]);
  if (match[2] === "d") return n;
  if (match[2] === "mo") return n * 30;
  return n * 365;
}

// Shape of NSELive().stock_quote() — reverse-engineered live against
// RELIANCE (see the module comment above); price/change/previousClose live
// under metaData (not priceInfo, which only has year-high/low and price-
// band info despite what jugaad-data's own README example shows — NSE has
// since restructured this response).
interface JugaadQuoteResponse {
  metaData?: {
    previousClose?: number;
    closePrice?: number;
    change?: number;
    pChange?: number;
  };
  tradeInfo?: {
    lastPrice?: number;
    totalTradedVolume?: number;
    totalMarketCap?: number;
  };
  secInfo?: {
    pdSymbolPe?: string | number;
  };
}

interface JugaadHistoricalRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const jugaadDataProvider: MarketDataProvider = {
  name: "jugaad-data",

  async getQuote(symbol: string): Promise<Quote> {
    const sym = stripSuffix(symbol);
    const data = (await runBridge(["quote", sym])) as JugaadQuoteResponse;
    const price = data.tradeInfo?.lastPrice ?? data.metaData?.closePrice;
    const prevClose = data.metaData?.previousClose;
    if (price === undefined || prevClose === undefined) {
      throw new Error(`jugaad-data getQuote: no data for ${symbol}`);
    }
    return {
      symbol,
      price,
      change: data.metaData?.change ?? price - prevClose,
      changePercent: data.metaData?.pChange ?? ((price - prevClose) / prevClose) * 100,
      volume: data.tradeInfo?.totalTradedVolume ?? 0,
      asOf: new Date(),
    };
  },

  // NSE's historical endpoint (same one jugaad-data itself scrapes) only
  // has end-of-day rows — `interval` is ignored, same as nse-free.ts.
  async getHistorical(symbol: string, _interval: string, range: string): Promise<HistoricalBar[]> {
    const sym = stripSuffix(symbol);
    const to = new Date();
    const from = new Date(to.getTime() - rangeToDays(range) * 24 * 60 * 60 * 1000);
    const rows = (await runBridge([
      "historical",
      sym,
      formatIsoDate(from),
      formatIsoDate(to),
    ])) as JugaadHistoricalRow[];

    return rows
      .map((row) => ({
        time: Math.floor(new Date(row.date).getTime() / 1000),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      }))
      .sort((a, b) => a.time - b.time);
  },

  // Same underlying quote call as getQuote (NSE bundles P/E and market cap
  // into the same response) — a second, independent subprocess call, same
  // duplication nse-free.ts already has between its own getQuote/
  // getFundamentals hitting the same endpoint twice.
  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const sym = stripSuffix(symbol);
    const data = (await runBridge(["quote", sym])) as JugaadQuoteResponse;
    const peRaw = data.secInfo?.pdSymbolPe;
    const peRatio = peRaw !== undefined ? Number(peRaw) : undefined;
    return {
      symbol,
      peRatio: peRatio !== undefined && Number.isFinite(peRatio) ? peRatio : undefined,
      marketCap: data.tradeInfo?.totalMarketCap,
      // No EPS or dividend yield in this endpoint — left undefined, same
      // "degrade gracefully" convention every other provider follows.
    };
  },
};
