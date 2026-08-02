import { ObjectId } from "mongodb";
import clientPromise from "./mongodb";
import type { Holding, Trade } from "../paper-trading/types";
import type {
  BacktestConfig,
  BacktestMetrics,
  CrossSectionalBacktestConfig,
  EquityPoint,
  PairsBacktestConfig,
  PortfolioBacktestConfig,
  SymbolContribution,
} from "../backtest/types";
import type { ScreenerRow } from "../screener/types";
import type { NewsItem } from "../news/types";

export interface User {
  _id: ObjectId;
  email: string;
  passwordHash?: string;
  oauthProvider?: string;
  createdAt: Date;
  // Timestamp of the required signup acknowledgment ("simulation-only,
  // not investment advice, not connected to any broker"). Older accounts
  // created before this existed won't have it.
  consentedAt?: Date;
  notificationPrefs?: {
    push: boolean;
    email: boolean;
  };
}

export interface Session {
  _id: ObjectId;
  userId: ObjectId;
  // SHA-256 of the raw token that lives in the session cookie — never the
  // raw token itself, so a DB read alone can't be replayed as a cookie.
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export type ShareResourceType = "watchlist";

export interface Share {
  _id: ObjectId;
  ownerId: string; // who owns the resource being shared — User._id.toString()
  resourceType: ShareResourceType;
  // Matched by email at read time (see app/api/shares/shared-with-me), not
  // a userId link — works whether or not the invited person has an account
  // yet, and doesn't need a separate "accept" step for read-only access.
  invitedEmail: string;
  createdAt: Date;
}

export interface Watchlist {
  _id: ObjectId;
  ownerId: string; // User._id.toString() — see lib/auth/session.ts
  name: string;
  symbols: string[]; // e.g. "RELIANCE.NS", "TCS.NS"
}

export interface PaperPortfolio {
  _id: ObjectId;
  ownerId: string; // same as Watchlist.ownerId
  cash: number;
  holdings: Record<string, Holding>;
  trades: Trade[];
  updatedAt: Date;
}

export type AlertCondition =
  | { type: "price_above"; value: number }
  | { type: "price_below"; value: number }
  | { type: "rsi_below"; value: number }
  | { type: "volume_spike"; value: number };

export interface Alert {
  _id: ObjectId;
  userId: ObjectId;
  symbol: string;
  condition: AlertCondition;
  channel: "push" | "email";
  status: "active" | "paused" | "triggered";
  lastTriggeredAt?: Date;
}

// A real, pre-existing investment the user tells Crade about manually — not
// connected to a broker, not verified, not part of the simulated paper-
// trading flow in lib/paper-trading/. Named RealHolding (not Holding) to
// stay textually distinct from lib/paper-trading/types.ts's Holding
// wherever both are in scope.
export interface RealHolding {
  _id: ObjectId;
  userId: ObjectId;
  symbol: string;
  qty: number;
  avgCost: number;
  note?: string;
  // When the user says they bought this — optional, since qty/avgCost alone
  // is already enough for point-in-time P&L. Only needed for annualized
  // (CAGR) return; see lib/holdings-cagr.ts.
  purchasedAt?: Date;
  createdAt: Date;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceCache {
  _id: ObjectId;
  symbol: string;
  interval: string;
  candles: Candle[];
  source: string;
  fetchedAt: Date; // TTL-indexed field
}

export interface FundamentalsCacheEntry {
  _id: ObjectId;
  symbol: string;
  marketCap?: number;
  peRatio?: number;
  eps?: number;
  dividendYield?: number;
  source: string;
  fetchedAt: Date;
}

export interface LastKnownQuote {
  _id: ObjectId;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  asOf: Date; // the original market timestamp of this quote
  fetchedAt: Date; // when we stored it — bounds how stale a fallback can be
}

export interface ScreenerSnapshot {
  _id: ObjectId;
  universe: string; // e.g. "nifty50"
  rows: ScreenerRow[];
  fetchedAt: Date;
}

export interface NewsCacheEntry {
  _id: ObjectId;
  query: string;
  items: NewsItem[];
  fetchedAt: Date;
}

export interface AiSession {
  _id: ObjectId;
  userId: ObjectId;
  symbol?: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  provider: string;
  model: string;
  createdAt: Date;
}

export interface PushSubscriptionDoc {
  _id: ObjectId;
  userId: ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: Date;
}

export interface Backtest {
  _id: ObjectId;
  ownerId: string; // same as Watchlist.ownerId
  config: BacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  aiReview?: { content: string; provider: string; model: string; createdAt: Date };
  createdAt: Date;
}

export interface PortfolioBacktest {
  _id: ObjectId;
  ownerId: string; // same as Backtest.ownerId
  config: PortfolioBacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  bySymbol: SymbolContribution[];
  aiReview?: { content: string; provider: string; model: string; createdAt: Date };
  createdAt: Date;
}

export interface CrossSectionalBacktest {
  _id: ObjectId;
  ownerId: string; // same as Backtest.ownerId
  config: CrossSectionalBacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  aiReview?: { content: string; provider: string; model: string; createdAt: Date };
  createdAt: Date;
}

export interface PairsBacktest {
  _id: ObjectId;
  ownerId: string; // same as Backtest.ownerId
  config: PairsBacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  aiReview?: { content: string; provider: string; model: string; createdAt: Date };
  createdAt: Date;
}

export async function getDb() {
  const client = await clientPromise;
  return client.db();
}

export async function getCollections() {
  const db = await getDb();
  return {
    users: db.collection<User>("users"),
    sessions: db.collection<Session>("sessions"),
    watchlists: db.collection<Watchlist>("watchlists"),
    shares: db.collection<Share>("shares"),
    paperPortfolios: db.collection<PaperPortfolio>("paper_portfolios"),
    alerts: db.collection<Alert>("alerts"),
    realHoldings: db.collection<RealHolding>("real_holdings"),
    priceCache: db.collection<PriceCache>("price_cache"),
    screenerSnapshots: db.collection<ScreenerSnapshot>("screener_snapshots"),
    lastKnownQuotes: db.collection<LastKnownQuote>("last_known_quotes"),
    newsCache: db.collection<NewsCacheEntry>("news_cache"),
    fundamentalsCache: db.collection<FundamentalsCacheEntry>("fundamentals_cache"),
    backtests: db.collection<Backtest>("backtests"),
    portfolioBacktests: db.collection<PortfolioBacktest>("portfolio_backtests"),
    crossSectionalBacktests: db.collection<CrossSectionalBacktest>("cross_sectional_backtests"),
    pairsBacktests: db.collection<PairsBacktest>("pairs_backtests"),
    aiSessions: db.collection<AiSession>("ai_sessions"),
    pushSubscriptions: db.collection<PushSubscriptionDoc>("push_subscriptions"),
  };
}
