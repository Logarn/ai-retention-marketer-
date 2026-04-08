import Firecrawl from "@mendable/firecrawl-js";
import { MAX_HOMEPAGE_CHARS, normalizeInputUrl, stripBoilerplate } from "@/lib/brain/analyze-store-normalize";

type FirecrawlDoc = {
  success?: boolean;
  error?: string;
  markdown?: string;
};

export async function scrapeHomepagePlainText(url: string): Promise<{ content: string; pageUrl: string }> {
  if (!process.env.FIRECRAWL_API_KEY) {
    throw new Error("FIRECRAWL_API_KEY is not configured.");
  }
  const { normalized } = normalizeInputUrl(url);
  const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  const response = (await firecrawl.v1.scrapeUrl(normalized, { formats: ["markdown"] })) as FirecrawlDoc;
  if (response.success === false || response.error) {
    throw new Error(response.error || "Firecrawl scrape failed");
  }
  const markdown = (response.markdown ?? "").trim();
  if (!markdown) {
    throw new Error("Firecrawl returned no content");
  }
  const plain = stripBoilerplate(markdown);
  const content = plain.slice(0, MAX_HOMEPAGE_CHARS);
  return { content, pageUrl: normalized };
}
