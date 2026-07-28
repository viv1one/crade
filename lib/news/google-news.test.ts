import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNews } from "./google-news";

function rssResponse(items: string): Response {
  const xml = `<?xml version="1.0"?><rss><channel>${items}</channel></rss>`;
  return { ok: true, status: 200, text: async () => xml } as Response;
}

describe("fetchNews", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses title, link, source, and pubDate, stripping the source suffix from the title", async () => {
    const item =
      "<item>" +
      "<title>Some Headline About A Stock - NDTV Profit</title>" +
      "<link>https://news.google.com/rss/articles/abc</link>" +
      "<pubDate>Tue, 28 Jul 2026 02:00:01 GMT</pubDate>" +
      '<source url="https://www.ndtvprofit.com">NDTV Profit</source>' +
      "</item>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rssResponse(item)));

    const news = await fetchNews("test query");
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({
      title: "Some Headline About A Stock",
      link: "https://news.google.com/rss/articles/abc",
      source: "NDTV Profit",
    });
    expect(new Date(news[0].publishedAt).getUTCFullYear()).toBe(2026);
  });

  it("decodes XML entities in the title", async () => {
    const item =
      "<item>" +
      "<title>Reliance &amp; Jio&#39;s big move - Moneycontrol</title>" +
      "<link>https://example.com</link>" +
      "<source>Moneycontrol</source>" +
      "</item>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rssResponse(item)));

    const news = await fetchNews("test query");
    expect(news[0].title).toBe("Reliance & Jio's big move");
  });

  it("respects the limit", async () => {
    const items = Array.from(
      { length: 8 },
      (_, i) => `<item><title>Headline ${i}</title><link>https://example.com/${i}</link></item>`
    ).join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rssResponse(items)));

    const news = await fetchNews("test query", 3);
    expect(news).toHaveLength(3);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 } as Response)
    );
    await expect(fetchNews("test query")).rejects.toThrow(/429/);
  });
});
