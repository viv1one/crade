import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

export async function GET(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(request.url);
  const symbolKey = (searchParams.get("symbol") ?? "").trim().toUpperCase();

  const { aiSessions } = await getCollections();
  const doc = await aiSessions.findOne({ userId: new ObjectId(user.id), symbol: symbolKey });
  return NextResponse.json({ messages: doc?.messages ?? [] });
}
