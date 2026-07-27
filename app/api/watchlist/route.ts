import { NextResponse } from "next/server";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

const LIST_NAME = "default";

export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { watchlists } = await getCollections();
  const doc = await watchlists.findOne({ ownerId: user.id, name: LIST_NAME });
  if (!doc) {
    return NextResponse.json({ symbols: [], isNew: true });
  }
  return NextResponse.json({ symbols: doc.symbols, isNew: false });
}

export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const symbols = body.symbols;
  if (!Array.isArray(symbols) || !symbols.every((s) => typeof s === "string")) {
    return NextResponse.json({ error: "symbols must be a string array" }, { status: 400 });
  }

  const { watchlists } = await getCollections();
  await watchlists.updateOne(
    { ownerId: user.id, name: LIST_NAME },
    { $set: { ownerId: user.id, name: LIST_NAME, symbols } },
    { upsert: true }
  );
  return NextResponse.json({ symbols, isNew: false });
}
