import { NextResponse } from "next/server";
import { marketData } from "@/lib/market-data";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(request.url);
  const interval = searchParams.get("interval") ?? "1d";
  const range = searchParams.get("range") ?? "1mo";

  try {
    const bars = await marketData.getHistorical(symbol, interval, range);
    return NextResponse.json({ symbol, interval, range, bars });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch history" },
      { status: 502 }
    );
  }
}
