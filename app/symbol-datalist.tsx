import { ALL_NSE_UNIVERSE } from "@/lib/screener/universe";

export const SYMBOL_SUGGESTIONS_ID = "nse-symbol-suggestions";

// Shared by every symbol input across the app — one <datalist>, referenced
// by list={SYMBOL_SUGGESTIONS_ID} from any input. Native browser autocomplete
// matches against both the option's value (the ticker) and its visible text
// (the company name), so typing "ad" surfaces ADANIENT.NS/ADANIPORTS.NS
// whether the user thinks in tickers or names. Sourced from the full NSE
// EQ-series listing (~2,000 symbols, lib/screener/universe.ts's
// ALL_NSE_UNIVERSE) rather than just the 50 Nifty names — every symbol
// input already accepts free text and works against any real NSE ticker,
// this just makes the suggestions match what actually works.
export function SymbolDatalist() {
  return (
    <datalist id={SYMBOL_SUGGESTIONS_ID}>
      {ALL_NSE_UNIVERSE.map((s) => (
        <option key={s.symbol} value={s.symbol}>
          {s.name}
        </option>
      ))}
    </datalist>
  );
}
