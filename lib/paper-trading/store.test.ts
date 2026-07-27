import { describe, expect, it } from "vitest";
import { applyBuy, applySell, createEmptyPortfolio } from "./store";
import { STARTING_CASH } from "./types";

describe("applyBuy", () => {
  it("deducts cash and opens a new holding", () => {
    const state = applyBuy(createEmptyPortfolio(), "TCS.NS", 2, 100);
    expect(state.cash).toBe(STARTING_CASH - 200);
    expect(state.holdings["TCS.NS"]).toEqual({ symbol: "TCS.NS", qty: 2, avgCost: 100 });
    expect(state.trades).toHaveLength(1);
    expect(state.trades[0]).toMatchObject({ symbol: "TCS.NS", side: "buy", qty: 2, price: 100 });
  });

  it("averages cost basis across repeated buys", () => {
    let state = applyBuy(createEmptyPortfolio(), "TCS.NS", 2, 100); // 200 cost
    state = applyBuy(state, "TCS.NS", 2, 200); // +400 cost, 4 qty total
    expect(state.holdings["TCS.NS"].qty).toBe(4);
    expect(state.holdings["TCS.NS"].avgCost).toBe(150);
  });

  it("rejects a buy that exceeds available cash", () => {
    expect(() => applyBuy(createEmptyPortfolio(), "TCS.NS", 10_000, 100)).toThrow(
      /insufficient/i
    );
  });

  it("rejects a non-positive quantity", () => {
    expect(() => applyBuy(createEmptyPortfolio(), "TCS.NS", 0, 100)).toThrow();
    expect(() => applyBuy(createEmptyPortfolio(), "TCS.NS", -5, 100)).toThrow();
  });
});

describe("applySell", () => {
  it("adds proceeds to cash and computes realized P&L", () => {
    const bought = applyBuy(createEmptyPortfolio(), "TCS.NS", 4, 100);
    const sold = applySell(bought, "TCS.NS", 2, 150);
    expect(sold.holdings["TCS.NS"]).toEqual({ symbol: "TCS.NS", qty: 2, avgCost: 100 });
    expect(sold.trades[0]).toMatchObject({ side: "sell", qty: 2, price: 150, realizedPnl: 100 });
    expect(sold.cash).toBe(bought.cash + 300);
  });

  it("removes the holding entirely when fully sold", () => {
    const bought = applyBuy(createEmptyPortfolio(), "TCS.NS", 2, 100);
    const sold = applySell(bought, "TCS.NS", 2, 120);
    expect(sold.holdings["TCS.NS"]).toBeUndefined();
  });

  it("rejects selling more than is held", () => {
    const bought = applyBuy(createEmptyPortfolio(), "TCS.NS", 2, 100);
    expect(() => applySell(bought, "TCS.NS", 3, 120)).toThrow(/only hold/i);
  });

  it("rejects selling a symbol with no position", () => {
    expect(() => applySell(createEmptyPortfolio(), "TCS.NS", 1, 100)).toThrow(/only hold/i);
  });
});
