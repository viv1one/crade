import { NextResponse } from "next/server";
import { marketData } from "@/lib/market-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  try {
    const quote = await marketData.getQuote(symbol);
    return NextResponse.json(quote);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch quote" },
      { status: 502 }
    );
  }
}
