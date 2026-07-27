import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import type { AlertCondition } from "@/lib/db/collections";

const CONDITION_TYPES = ["price_above", "price_below", "rsi_below", "volume_spike"] as const;

export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { alerts } = await getCollections();
  const list = await alerts
    .find({ userId: new ObjectId(user.id) })
    .sort({ _id: -1 })
    .toArray();
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const conditionType = body.condition?.type;
  const conditionValue = Number(body.condition?.value);
  const channel: "push" | "email" = body.channel === "email" ? "email" : "push";

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }
  if (!CONDITION_TYPES.includes(conditionType)) {
    return NextResponse.json({ error: "Invalid condition type" }, { status: 400 });
  }
  if (!Number.isFinite(conditionValue)) {
    return NextResponse.json({ error: "condition.value must be a number" }, { status: 400 });
  }

  const condition = { type: conditionType, value: conditionValue } as AlertCondition;

  const { alerts } = await getCollections();
  const doc = {
    _id: new ObjectId(),
    userId: new ObjectId(user.id),
    symbol,
    condition,
    channel,
    status: "active" as const,
  };
  await alerts.insertOne(doc);
  return NextResponse.json(doc);
}
