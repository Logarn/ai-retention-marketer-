import { NextResponse } from "next/server";
import { z } from "zod";
import Firecrawl from "@mendable/firecrawl-js";
import { MAX_HOMEPAGE_CHARS, normalizeInputUrl, stripBoilerplate } from "@/lib/brain/analyze-store-normalize";

export const maxDuration = 10;

const requestSchema = z.object({
  url: z.string().min(1),
});

type FirecrawlDoc = {
  success?: boolean;
  error?: string;
  markdown?: string;
};

export async function POST(request: Request) {
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid payload. Expected { url: string }.", step: "scrape" }, { status: 400 });
  }

  if (!process.env.FIRECRAWL_API_KEY) {
    return NextResponse.json(
      { error: "FIRECRAWL_API_KEY is not configured.", step: "scrape" },
      { status: 500 },
    );
  }

  try {
    const { normalized } = normalizeInputUrl(parsedBody.data.url);
    const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

    const response = (await firecrawl.v1.scrapeUrl(normalized, { formats: ["markdown"] })) as FirecrawlDoc;

    if (response.success === false || response.error) {
      return NextResponse.json(
        {
          error: `Firecrawl scrape failed: ${response.error || "Unknown Firecrawl error"}`,
          step: "scrape",
        },
        { status: 502 },
      );
    }

    const markdown = (response.markdown ?? "").trim();
    if (!markdown) {
      return NextResponse.json(
        {
          error: "Firecrawl returned no markdown content for the homepage.",
          step: "scrape",
        },
        { status: 502 },
      );
    }

    const plain = stripBoilerplate(markdown);
    const content = plain.slice(0, MAX_HOMEPAGE_CHARS);

    return NextResponse.json({
      content,
      pageUrl: normalized,
    });
  } catch (error) {
    console.error("[analyze-store/scrape]", error);
    return NextResponse.json(
      {
        error: `Scrape failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        step: "scrape",
      },
      { status: 500 },
    );
  }
}
