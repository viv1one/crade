import { ObjectId } from "mongodb";
import clientPromise from "./mongodb";
import type { Holding, Trade } from "../paper-trading/types";

export interface User {
  _id: ObjectId;
  email: string;
  passwordHash?: string;
  oauthProvider?: string;
  createdAt: Date;
  notificationPrefs?: {
    push: boolean;
    email: boolean;
  };
}

export interface Watchlist {
  _id: ObjectId;
  // Keyed by the anonymous device id (see lib/identity/device-id.ts) until
  // real auth exists, at which point this becomes a User._id.toString().
  ownerId: string;
  name: string;
  symbols: string[]; // e.g. "RELIANCE.NS", "TCS.NS"
}

export interface PaperPortfolio {
  _id: ObjectId;
  ownerId: string; // same anonymous device id as Watchlist.ownerId
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

export interface JournalEntry {
  _id: ObjectId;
  userId: ObjectId;
  symbol: string;
  note: string;
  tags: string[];
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
    watchlists: db.collection<Watchlist>("watchlists"),
    paperPortfolios: db.collection<PaperPortfolio>("paper_portfolios"),
    alerts: db.collection<Alert>("alerts"),
    priceCache: db.collection<PriceCache>("price_cache"),
    aiSessions: db.collection<AiSession>("ai_sessions"),
    pushSubscriptions: db.collection<PushSubscriptionDoc>("push_subscriptions"),
    journalEntries: db.collection<JournalEntry>("journal_entries"),
  };
}
