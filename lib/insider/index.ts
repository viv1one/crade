import { fetchInsiderActivity } from "./nse-insider";
import { getCachedInsiderActivity, setCachedInsiderActivity } from "./cache";
import type { InsiderTransaction } from "./types";

export async function getInsiderActivity(symbol: string): Promise<InsiderTransaction[]> {
  const cached = await getCachedInsiderActivity(symbol);
  if (cached) return cached;

  const transactions = await fetchInsiderActivity(symbol);
  await setCachedInsiderActivity(symbol, transactions);
  return transactions;
}

export * from "./types";
