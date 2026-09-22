import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { marketData } from "@/lib/market-data";
import { getCollections } from "@/lib/db/collections";
import { rsi } from "@/lib/backtest/indicators";
import { sendPushNotification } from "@/lib/push/send";
import { sendEmailNotification } from "@/lib/email/send";
import type { Alert, PushSubscriptionDoc } from "@/lib/db/collections";
import type { HistoricalBar, Quote } from "@/lib/market-data";

interface SymbolData {
  quote: Quote;
  bars: HistoricalBar[];
}

async function loadSymbolData(symbol: string): Promise<SymbolData | null> {
  try {
    const [quote, bars] = await Promise.all([
      marketData.getQuote(symbol),
      marketData.getHistorical(symbol, "1d", "3mo"),
    ]);
    return { quote, bars };
  } catch {
    return null;
  }
}

function isTriggered(alert: Alert, data: SymbolData): boolean {
  const { condition } = alert;
  switch (condition.type) {
    case "price_above":
      return data.quote.price > condition.value;
    case "price_below":
      return data.quote.price < condition.value;
    case "rsi_below": {
      const values = rsi(data.bars, 14);
      const latest = values[values.length - 1];
      return latest !== undefined && latest < condition.value;
    }
    case "volume_spike": {
      const recent = data.bars.slice(-20);
      if (recent.length === 0) return false;
      const avgVolume = recent.reduce((sum, b) => sum + b.volume, 0) / recent.length;
      return avgVolume > 0 && data.quote.volume >= condition.value * avgVolume;
    }
    default:
      return false;
  }
}

function formatMessage(alert: Alert, data: SymbolData): { title: string; body: string } {
  const { condition } = alert;
  const title = `${alert.symbol} alert triggered`;
  switch (condition.type) {
    case "price_above":
      return { title, body: `Price ₹${data.quote.price.toFixed(2)} is above ₹${condition.value}` };
    case "price_below":
      return { title, body: `Price ₹${data.quote.price.toFixed(2)} is below ₹${condition.value}` };
    case "rsi_below":
      return { title, body: `RSI(14) dropped below ${condition.value}` };
    case "volume_spike":
      return { title, body: `Volume is ≥${condition.value}× the 20-day average` };
  }
}

async function notifyUserByEmail(userId: ObjectId, message: { title: string; body: string }) {
  const { users } = await getCollections();
  const user = await users.findOne({ _id: userId });
  if (!user) return;
  try {
    await sendEmailNotification(user.email, message);
  } catch {
    // A bounce/misconfigured RESEND_API_KEY/etc. shouldn't break evaluation
    // of the rest of this run's alerts — same isolation notifyUser already
    // gives each push subscription below.
  }
}

async function notifyUser(userId: ObjectId, message: { title: string; body: string }) {
  const { pushSubscriptions } = await getCollections();
  const subs = await pushSubscriptions.find({ userId }).toArray();
  await Promise.all(
    subs.map(async (sub: PushSubscriptionDoc) => {
      try {
        await sendPushNotification(sub, message);
      } catch (err) {
        // Expired/unregistered subscriptions come back as 404/410 — clean
        // those up so we stop trying to send to a dead endpoint.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await pushSubscriptions.deleteOne({ _id: sub._id });
        }
      }
    })
  );
}

export async function GET(request: Request) {
  // Fail closed: an unset CRON_SECRET must not fall through to "no auth
  // check at all" — that leaves this endpoint open to anyone, unauthenticated.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 401 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { alerts } = await getCollections();
  const activeAlerts = await alerts.find({ status: "active" }).toArray();

  const dataBySymbol = new Map<string, SymbolData | null>();
  let triggeredCount = 0;

  for (const alert of activeAlerts) {
    if (!dataBySymbol.has(alert.symbol)) {
      dataBySymbol.set(alert.symbol, await loadSymbolData(alert.symbol));
    }
    const data = dataBySymbol.get(alert.symbol);
    if (!data) continue;

    if (isTriggered(alert, data)) {
      triggeredCount++;
      await alerts.updateOne(
        { _id: alert._id },
        { $set: { status: "triggered", lastTriggeredAt: new Date() } }
      );
      if (alert.channel === "push") {
        await notifyUser(alert.userId, formatMessage(alert, data));
      } else if (alert.channel === "email") {
        await notifyUserByEmail(alert.userId, formatMessage(alert, data));
      }
    }
  }

  return NextResponse.json({ evaluated: activeAlerts.length, triggered: triggeredCount });
}
