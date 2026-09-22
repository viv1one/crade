import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

const ACTIONS = ["buy", "sell", "watch"] as const;

export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { journalEntries } = await getCollections();
  const list = await journalEntries
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
  const action = body.action;
  const reasoning = typeof body.reasoning === "string" ? body.reasoning.trim() : "";
  const price = body.price !== undefined ? Number(body.price) : undefined;

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!reasoning) {
    return NextResponse.json({ error: "reasoning is required" }, { status: 400 });
  }
  if (price !== undefined && !Number.isFinite(price)) {
    return NextResponse.json({ error: "price must be a number" }, { status: 400 });
  }

  const { journalEntries } = await getCollections();
  const doc = {
    _id: new ObjectId(),
    userId: new ObjectId(user.id),
    symbol,
    action: action as "buy" | "sell" | "watch",
    reasoning,
    ...(price !== undefined ? { price } : {}),
    createdAt: new Date(),
  };
  await journalEntries.insertOne(doc);
  return NextResponse.json(doc);
}
