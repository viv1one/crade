import { NextResponse } from "next/server";
import { getCollections } from "@/lib/db/collections";
import { fetchScreenerData } from "@/lib/screener/fetch";

const UNIVERSE = "nifty50";
const TTL_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";

  const { screenerSnapshots } = await getCollections();

  if (!forceRefresh) {
    const cached = await screenerSnapshots.findOne({ universe: UNIVERSE });
    if (cached && Date.now() - cached.fetchedAt.getTime() < TTL_MS) {
      return NextResponse.json({ rows: cached.rows, fetchedAt: cached.fetchedAt });
    }
  }

  const rows = await fetchScreenerData();
  const fetchedAt = new Date();
  await screenerSnapshots.updateOne(
    { universe: UNIVERSE },
    { $set: { universe: UNIVERSE, rows, fetchedAt } },
    { upsert: true }
  );

  return NextResponse.json({ rows, fetchedAt });
}
