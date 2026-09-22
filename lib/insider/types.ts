export interface InsiderTransaction {
  personName: string;
  category?: string; // e.g. "Promoter", "Designated Person", "Director"
  transactionType: "buy" | "sell" | "other";
  quantity?: number;
  value?: number; // rupees, when disclosed
  date: string; // ISO string
}
