// A curated snapshot of Nifty 50 constituents — not fetched live, since
// there's no bulk "list all NSE stocks" data source wired into this app
// (see docs/plan.md §4). Index composition changes periodically; treat this
// as a reasonable starting universe, not an authoritative/current source.
// Re-verify against NSE's published Nifty 50 list before relying on it.
export interface UniverseStock {
  symbol: string;
  name: string;
  sector: string;
}

export const NIFTY_50: UniverseStock[] = [
  { symbol: "RELIANCE.NS", name: "Reliance Industries", sector: "Energy" },
  { symbol: "TCS.NS", name: "Tata Consultancy Services", sector: "IT" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", sector: "Financials" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", sector: "Financials" },
  { symbol: "INFY.NS", name: "Infosys", sector: "IT" },
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever", sector: "Consumer Staples" },
  { symbol: "ITC.NS", name: "ITC", sector: "Consumer Staples" },
  { symbol: "SBIN.NS", name: "State Bank of India", sector: "Financials" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", sector: "Telecom" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance", sector: "Financials" },
  { symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank", sector: "Financials" },
  { symbol: "LT.NS", name: "Larsen & Toubro", sector: "Industrials" },
  { symbol: "HCLTECH.NS", name: "HCL Technologies", sector: "IT" },
  { symbol: "AXISBANK.NS", name: "Axis Bank", sector: "Financials" },
  { symbol: "ASIANPAINT.NS", name: "Asian Paints", sector: "Consumer Discretionary" },
  { symbol: "MARUTI.NS", name: "Maruti Suzuki", sector: "Automobile" },
  { symbol: "SUNPHARMA.NS", name: "Sun Pharmaceutical", sector: "Healthcare" },
  { symbol: "TITAN.NS", name: "Titan Company", sector: "Consumer Discretionary" },
  { symbol: "ULTRACEMCO.NS", name: "UltraTech Cement", sector: "Materials" },
  { symbol: "WIPRO.NS", name: "Wipro", sector: "IT" },
  { symbol: "NESTLEIND.NS", name: "Nestle India", sector: "Consumer Staples" },
  { symbol: "BAJAJFINSV.NS", name: "Bajaj Finserv", sector: "Financials" },
  { symbol: "POWERGRID.NS", name: "Power Grid Corporation", sector: "Utilities" },
  { symbol: "NTPC.NS", name: "NTPC", sector: "Utilities" },
  { symbol: "TATAMOTORS.NS", name: "Tata Motors", sector: "Automobile" },
  { symbol: "TATASTEEL.NS", name: "Tata Steel", sector: "Materials" },
  { symbol: "ADANIENT.NS", name: "Adani Enterprises", sector: "Diversified" },
  { symbol: "JSWSTEEL.NS", name: "JSW Steel", sector: "Materials" },
  { symbol: "INDUSINDBK.NS", name: "IndusInd Bank", sector: "Financials" },
  { symbol: "GRASIM.NS", name: "Grasim Industries", sector: "Materials" },
  { symbol: "TECHM.NS", name: "Tech Mahindra", sector: "IT" },
  { symbol: "HINDALCO.NS", name: "Hindalco Industries", sector: "Materials" },
  { symbol: "DRREDDY.NS", name: "Dr. Reddy's Laboratories", sector: "Healthcare" },
  { symbol: "CIPLA.NS", name: "Cipla", sector: "Healthcare" },
  { symbol: "COALINDIA.NS", name: "Coal India", sector: "Energy" },
  { symbol: "DIVISLAB.NS", name: "Divi's Laboratories", sector: "Healthcare" },
  { symbol: "BRITANNIA.NS", name: "Britannia Industries", sector: "Consumer Staples" },
  { symbol: "EICHERMOT.NS", name: "Eicher Motors", sector: "Automobile" },
  { symbol: "APOLLOHOSP.NS", name: "Apollo Hospitals", sector: "Healthcare" },
  { symbol: "BAJAJ-AUTO.NS", name: "Bajaj Auto", sector: "Automobile" },
  { symbol: "BPCL.NS", name: "Bharat Petroleum", sector: "Energy" },
  { symbol: "SHREECEM.NS", name: "Shree Cement", sector: "Materials" },
  { symbol: "HEROMOTOCO.NS", name: "Hero MotoCorp", sector: "Automobile" },
  { symbol: "HDFCLIFE.NS", name: "HDFC Life Insurance", sector: "Financials" },
  { symbol: "SBILIFE.NS", name: "SBI Life Insurance", sector: "Financials" },
  { symbol: "ONGC.NS", name: "Oil & Natural Gas Corporation", sector: "Energy" },
  { symbol: "UPL.NS", name: "UPL", sector: "Materials" },
  { symbol: "TATACONSUM.NS", name: "Tata Consumer Products", sector: "Consumer Staples" },
  { symbol: "ADANIPORTS.NS", name: "Adani Ports", sector: "Industrials" },
  { symbol: "LTIM.NS", name: "LTIMindtree", sector: "IT" },
  { symbol: "M&M.NS", name: "Mahindra & Mahindra", sector: "Automobile" },
];

export const SECTORS = [...new Set(NIFTY_50.map((s) => s.sector))].sort();
