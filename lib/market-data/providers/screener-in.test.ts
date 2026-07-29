import { afterEach, describe, expect, it, vi } from "vitest";
import { extractRatio, screenerInProvider } from "./screener-in";

// Trimmed but structurally faithful to the real screener.in ratios list
// (irregular whitespace/newlines between label and value is deliberate —
// that's what actually breaks a naive `>${label}<` match).
const SAMPLE_HTML = `
<li class="flex flex-space-between" data-source="default">
  <span class="name">

      Market Cap

  </span>
  <span class="nowrap value">
    ₹
    <span class="number">17,15,385</span>
    Cr.
  </span>
</li>
<li class="flex flex-space-between" data-source="default">
  <span class="name">

      Stock P/E

  </span>
  <span class="nowrap value">
    <span class="number">43.7</span>
  </span>
</li>
<li class="flex flex-space-between" data-source="default">
  <span class="name">

      Dividend Yield

  </span>
  <span class="nowrap value">
    <span class="number">0.47</span>
    %
  </span>
</li>
`;

function mockResponse(status: number, text: string): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => text } as Response;
}

describe("extractRatio", () => {
  it("finds the value following a label despite irregular whitespace", () => {
    expect(extractRatio(SAMPLE_HTML, "Stock P/E")).toBe(43.7);
    expect(extractRatio(SAMPLE_HTML, "Dividend Yield")).toBe(0.47);
  });

  it("strips Indian-style comma grouping from large numbers", () => {
    expect(extractRatio(SAMPLE_HTML, "Market Cap")).toBe(1715385);
  });

  it("returns undefined for a label that isn't present", () => {
    expect(extractRatio(SAMPLE_HTML, "ROCE")).toBeUndefined();
  });
});

describe("screenerInProvider.getFundamentals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("converts market cap (crore) to rupees and dividend yield (%) to a fraction", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(200, SAMPLE_HTML)));

    const result = await screenerInProvider.getFundamentals("RELIANCE.NS");
    expect(result.peRatio).toBe(43.7);
    expect(result.marketCap).toBe(1715385 * 1e7);
    expect(result.dividendYield).toBeCloseTo(0.0047);
  });

  it("throws when none of the expected fields are found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(200, "<html>nothing here</html>")));
    await expect(screenerInProvider.getFundamentals("RELIANCE.NS")).rejects.toThrow(/no data/);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(404, "")));
    await expect(screenerInProvider.getFundamentals("RELIANCE.NS")).rejects.toThrow(/404/);
  });
});

describe("screenerInProvider.getQuote / getHistorical", () => {
  it("reject immediately without making a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(screenerInProvider.getQuote("RELIANCE.NS")).rejects.toThrow(/not supported/);
    await expect(screenerInProvider.getHistorical("RELIANCE.NS", "1d", "3mo")).rejects.toThrow(
      /not supported/
    );
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
