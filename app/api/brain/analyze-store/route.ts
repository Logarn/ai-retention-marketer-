import { NextResponse } from "next/server";
import { z } from "zod";
import Firecrawl from "@mendable/firecrawl-js";
import { groqClient, GROQ_MODEL } from "@/lib/ai";

const STORE_ID = "default";
const MAX_PAGES = 8;

const requestSchema = z.object({
  url: z.string().min(1),
});

type PageResult = {
  url: string;
  label: string;
  status: "success" | "failed";
  error?: string;
  chars?: number;
};

type AnalysisData = {
  brandName: string;
  tagline: string;
  industry: string;
  niche: string;
  brandStory: string;
  usp: string;
  missionStatement: string;
  targetDemographics: string;
  targetPsychographics: string;
  audiencePainPoints: string;
  audienceDesires: string;
  voiceFormalCasual: number;
  voiceSeriousPlayful: number;
  voiceReservedEnthusiastic: number;
  voiceTechnicalSimple: number;
  voiceAuthoritativeApproachable: number;
  voiceMinimalDescriptive: number;
  voiceLuxuryAccessible: number;
  voiceEdgySafe: number;
  voiceEmotionalRational: number;
  voiceTrendyTimeless: number;
  voiceDescription: string;
  suggestedDos: string[];
  suggestedDonts: string[];
  suggestedCTAs: string[];
  suggestedPreferredPhrases: string[];
  suggestedBannedPhrases: string[];
  greetingStyle: "formal" | "friendly" | "casual" | "none";
  signOffStyle: "warm" | "professional" | "casual" | "brand";
  emojiUsage: "never" | "sparingly" | "often";
  preferredLength: "short" | "medium" | "long";
  discountPhilosophy: "never" | "rarely" | "strategically" | "frequently";
  productsSummary: string;
  priceRange: string;
  competitivePositioning: string;
};

type FirecrawlDoc = {
  success?: boolean;
  error?: string;
  markdown?: string;
  links?: string[];
};

type ErrorDetail = {
  name?: string;
  message: string;
  stack?: string;
  cause?: unknown;
};

function normalizeInputUrl(input: string) {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  return {
    normalized: parsed.toString(),
    origin: parsed.origin,
  };
}

function isInternalUrl(url: URL, origin: string) {
  try {
    return url.origin === origin;
  } catch {
    return false;
  }
}

function normalizeDiscoveredUrl(value: string, origin: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("javascript:") || trimmed.startsWith("mailto:")) return null;
  try {
    const parsed = new URL(trimmed, origin);
    if (!isInternalUrl(parsed, origin)) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractMarkdownLinks(markdown: string) {
  const links: string[] = [];
  const regex = /\[[^\]]*\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null = regex.exec(markdown);
  while (match) {
    links.push(match[1] ?? "");
    match = regex.exec(markdown);
  }
  return links;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function clampSlider(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeList(value: unknown, max = 10) {
  if (!Array.isArray(value)) return [];
  return unique(
    value
      .map((item) => safeText(item))
      .filter(Boolean),
  ).slice(0, max);
}

function enumOrDefault<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim().toLowerCase() as T;
  return allowed.includes(candidate) ? candidate : fallback;
}

function normalizeAnalysis(input: Partial<AnalysisData>): AnalysisData {
  return {
    brandName: safeText(input.brandName, "Unknown brand"),
    tagline: safeText(input.tagline),
    industry: safeText(input.industry, "e-commerce"),
    niche: safeText(input.niche),
    brandStory: safeText(input.brandStory),
    usp: safeText(input.usp),
    missionStatement: safeText(input.missionStatement),
    targetDemographics: safeText(input.targetDemographics),
    targetPsychographics: safeText(input.targetPsychographics),
    audiencePainPoints: safeText(input.audiencePainPoints),
    audienceDesires: safeText(input.audienceDesires),
    voiceFormalCasual: clampSlider(input.voiceFormalCasual),
    voiceSeriousPlayful: clampSlider(input.voiceSeriousPlayful),
    voiceReservedEnthusiastic: clampSlider(input.voiceReservedEnthusiastic),
    voiceTechnicalSimple: clampSlider(input.voiceTechnicalSimple),
    voiceAuthoritativeApproachable: clampSlider(input.voiceAuthoritativeApproachable),
    voiceMinimalDescriptive: clampSlider(input.voiceMinimalDescriptive),
    voiceLuxuryAccessible: clampSlider(input.voiceLuxuryAccessible),
    voiceEdgySafe: clampSlider(input.voiceEdgySafe),
    voiceEmotionalRational: clampSlider(input.voiceEmotionalRational),
    voiceTrendyTimeless: clampSlider(input.voiceTrendyTimeless),
    voiceDescription: safeText(input.voiceDescription),
    suggestedDos: safeList(input.suggestedDos, 8),
    suggestedDonts: safeList(input.suggestedDonts, 8),
    suggestedCTAs: safeList(input.suggestedCTAs, 8),
    suggestedPreferredPhrases: safeList(input.suggestedPreferredPhrases, 10),
    suggestedBannedPhrases: safeList(input.suggestedBannedPhrases, 10),
    greetingStyle: enumOrDefault(input.greetingStyle, ["formal", "friendly", "casual", "none"], "friendly"),
    signOffStyle: enumOrDefault(input.signOffStyle, ["warm", "professional", "casual", "brand"], "warm"),
    emojiUsage: enumOrDefault(input.emojiUsage, ["never", "sparingly", "often"], "sparingly"),
    preferredLength: enumOrDefault(input.preferredLength, ["short", "medium", "long"], "medium"),
    discountPhilosophy: enumOrDefault(
      input.discountPhilosophy,
      ["never", "rarely", "strategically", "frequently"],
      "strategically",
    ),
    productsSummary: safeText(input.productsSummary),
    priceRange: safeText(input.priceRange),
    competitivePositioning: safeText(input.competitivePositioning),
  };
}

function extractJsonText(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fencedBlocks = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  if (fencedBlocks?.length) {
    for (const block of fencedBlocks) {
      const inner = block.replace(/```(?:json)?/i, "").replace(/```$/, "").trim();
      if (inner.startsWith("{") && inner.endsWith("}")) return inner;
    }
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const firstBrace = trimmed.indexOf("{");
  if (firstBrace < 0) return null;
  let depth = 0;
  for (let i = firstBrace; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return trimmed.slice(firstBrace, i + 1);
    }
  }

  return null;
}

function parseAnalysis(raw: string) {
  const jsonText = extractJsonText(raw);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText) as Partial<AnalysisData>;
  } catch {
    return null;
  }
}

function toErrorDetail(error: unknown): ErrorDetail {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    };
  }
  return {
    message: typeof error === "string" ? error : "Unknown error",
    cause: error,
  };
}

function logStepError(step: string, error: unknown, context?: Record<string, unknown>) {
  const detail = toErrorDetail(error);
  console.error(`[analyze-store][${step}]`, {
    ...context,
    error: detail,
  });
}

async function scrapePage(
  firecrawl: Firecrawl,
  url: string,
  label: string,
  pages: PageResult[],
  markdownChunks: Array<{ url: string; label: string; markdown: string }>,
  discoveredLinks: Set<string>,
) {
  if (pages.length >= MAX_PAGES) return false;
  try {
    const response = (await firecrawl.v1.scrapeUrl(url, { formats: ["markdown"] })) as FirecrawlDoc;
    console.log("[analyze-store][scrape] response", {
      url,
      label,
      success: response.success ?? true,
      error: response.error ?? null,
      markdownLength: response.markdown?.length ?? 0,
      linkCount: response.links?.length ?? 0,
    });

    if (response.success === false || response.error) {
      pages.push({
        url,
        label,
        status: "failed",
        error: `Firecrawl scrape failed: ${response.error || "Unknown Firecrawl error"}`,
      });
      return false;
    }

    const markdown = (response.markdown ?? "").trim();
    const links = [
      ...(response.links ?? []),
      ...extractMarkdownLinks(markdown),
    ];

    for (const link of links) {
      discoveredLinks.add(link);
    }

    if (!markdown) {
      pages.push({
        url,
        label,
        status: "failed",
        error: "Firecrawl returned no markdown content for this page",
      });
      return false;
    }

    pages.push({
      url,
      label,
      status: "success",
      chars: markdown.length,
    });

    markdownChunks.push({
      url,
      label,
      markdown: markdown.slice(0, 8000),
    });
    return true;
  } catch (error) {
    logStepError("scrape-page", error, { url, label });
    pages.push({
      url,
      label,
      status: "failed",
      error: `Firecrawl exception: ${error instanceof Error ? error.message : "Unknown scrape error"}`,
    });
    return false;
  }
}

export async function POST(request: Request) {
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid payload. Expected { url: string }." }, { status: 400 });
  }

  if (!process.env.FIRECRAWL_API_KEY) {
    return NextResponse.json(
      { error: "FIRECRAWL_API_KEY is not configured." },
      { status: 500 },
    );
  }

  try {
    const { normalized, origin } = normalizeInputUrl(parsedBody.data.url);
    const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

    const pages: PageResult[] = [];
    const markdownChunks: Array<{ url: string; label: string; markdown: string }> = [];
    const discoveredLinks = new Set<string>();
    const queued = new Set<string>();

    const queueScrape = async (candidate: string | null, label: string) => {
      if (!candidate) return false;
      if (queued.has(candidate)) return false;
      queued.add(candidate);
      return scrapePage(firecrawl, candidate, label, pages, markdownChunks, discoveredLinks);
    };

    const normalizedDiscovered = () =>
      unique(
        Array.from(discoveredLinks)
          .map((link) => normalizeDiscoveredUrl(link, origin))
          .filter((v): v is string => Boolean(v)),
      );

    // 1) Homepage
    await queueScrape(normalized, "Homepage");

    // 2) About page attempts
    const aboutPatterns = ["/pages/about", "/pages/about-us", "/pages/our-story", "/about", "/about-us"];
    const discoveredAfterHome = normalizedDiscovered();
    const aboutFromLinks =
      discoveredAfterHome.find((link) =>
        aboutPatterns.some((path) => new URL(link).pathname.toLowerCase().startsWith(path)),
      ) ?? null;
    let aboutScraped = await queueScrape(aboutFromLinks, "About page");
    if (!aboutScraped) {
      for (const path of aboutPatterns) {
        if (pages.length >= MAX_PAGES || aboutScraped) break;
        aboutScraped = await queueScrape(new URL(path, origin).toString(), "About page");
      }
    }

    // 3) Collections
    const discoveredAfterAbout = normalizedDiscovered();
    const collectionsFromLinks =
      discoveredAfterAbout.find((link) => {
        const pathname = new URL(link).pathname.toLowerCase();
        return pathname === "/collections" || pathname.startsWith("/collections/");
      }) ?? null;
    let collectionsScraped = await queueScrape(collectionsFromLinks, "Collections page");
    if (!collectionsScraped) {
      collectionsScraped = await queueScrape(new URL("/collections", origin).toString(), "Collections page");
    }

    // 4) FAQ page
    const faqFromLinks =
      normalizedDiscovered().find((link) => {
        const pathname = new URL(link).pathname.toLowerCase();
        return pathname === "/pages/faq" || pathname === "/faq";
      }) ?? null;
    await queueScrape(faqFromLinks ?? new URL("/pages/faq", origin).toString(), "FAQ page");

    // 5) Product pages (3-4 target, still capped at max pages total)
    const scrapeProductLinks = async () => {
      const products = normalizedDiscovered().filter((link) =>
        new URL(link).pathname.toLowerCase().startsWith("/products/"),
      );
      for (const product of products.slice(0, 4)) {
        if (pages.length >= MAX_PAGES) break;
        await queueScrape(product, "Product page");
      }
    };

    await scrapeProductLinks();

    // If still missing product pages, try /collections/all once and discover products.
    const successfulProductCount = pages.filter((p) => p.label === "Product page" && p.status === "success").length;
    if (successfulProductCount < 3 && pages.length < MAX_PAGES) {
      await queueScrape(new URL("/collections/all", origin).toString(), "Collections all");
      await scrapeProductLinks();
    }

    const successfulMarkdown = markdownChunks.length;
    if (successfulMarkdown === 0) {
      console.error("[analyze-store][scrape] no successful markdown pages", { pages });
      return NextResponse.json(
        {
          error: "Scrape step failed: no page markdown was retrieved from Firecrawl.",
          step: "scrape",
          crawledPages: pages,
        },
        { status: 502 },
      );
    }

    if (!groqClient) {
      return NextResponse.json(
        {
          error: "GROQ_API_KEY is not configured.",
          step: "llm",
          crawledPages: pages,
        },
        { status: 500 },
      );
    }

    const combinedMarkdown = markdownChunks
      .map(
        (chunk) =>
          `### ${chunk.label}\nURL: ${chunk.url}\n${chunk.markdown.slice(0, 7000)}`,
      )
      .join("\n\n---\n\n")
      .slice(0, 42000);

    const systemPrompt = `You are a brand analyst. Analyze the following website content and extract structured brand knowledge. Return ONLY valid JSON with these fields:

{
  "brandName": "extracted brand name",
  "tagline": "extracted tagline or slogan if found",
  "industry": "detected industry",
  "niche": "specific niche within the industry",
  "brandStory": "summarized brand story/about in 2-3 sentences",
  "usp": "unique selling proposition — what makes them different",
  "missionStatement": "mission or vision if found",
  "targetDemographics": "who they sell to based on products and messaging",
  "targetPsychographics": "values, lifestyle, interests of their target customer",
  "audiencePainPoints": "what problems their customers have based on product descriptions",
  "audienceDesires": "what their customers want/aspire to",
  "voiceFormalCasual": number 0-100 (0=very formal, 100=very casual),
  "voiceSeriousPlayful": number 0-100,
  "voiceReservedEnthusiastic": number 0-100,
  "voiceTechnicalSimple": number 0-100,
  "voiceAuthoritativeApproachable": number 0-100,
  "voiceMinimalDescriptive": number 0-100,
  "voiceLuxuryAccessible": number 0-100,
  "voiceEdgySafe": number 0-100,
  "voiceEmotionalRational": number 0-100,
  "voiceTrendyTimeless": number 0-100,
  "voiceDescription": "2-3 sentence description of the overall brand voice",
  "suggestedDos": ["rule 1", "rule 2", ...],
  "suggestedDonts": ["rule 1", "rule 2", ...],
  "suggestedCTAs": ["CTA 1", "CTA 2", ...],
  "suggestedPreferredPhrases": ["phrase 1", ...],
  "suggestedBannedPhrases": ["phrase 1", ...],
  "greetingStyle": "formal" | "friendly" | "casual" | "none",
  "signOffStyle": "warm" | "professional" | "casual" | "brand",
  "emojiUsage": "never" | "sparingly" | "often",
  "preferredLength": "short" | "medium" | "long",
  "discountPhilosophy": "never" | "rarely" | "strategically" | "frequently",
  "productsSummary": "brief summary of main products/categories found",
  "priceRange": "detected price range",
  "competitivePositioning": "how the brand positions itself in the market"
}`;

    let completion: Awaited<ReturnType<typeof groqClient.chat.completions.create>>;
    try {
      completion = await groqClient.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_completion_tokens: 2600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Store URL: ${normalized}\nStore ID: ${STORE_ID}\n\nWebsite content:\n${combinedMarkdown}`,
          },
        ],
      });
    } catch (error) {
      logStepError("llm-call", error, {
        combinedMarkdownLength: combinedMarkdown.length,
        pagesAttempted: pages.length,
        pagesSuccessful: pages.filter((item) => item.status === "success").length,
      });
      return NextResponse.json(
        {
          error: `LLM step failed: ${error instanceof Error ? error.message : "Groq request failed."}`,
          step: "llm",
          crawledPages: pages,
          diagnostics: {
            combinedMarkdownLength: combinedMarkdown.length,
            pagesAttempted: pages.length,
            pagesSuccessful: pages.filter((item) => item.status === "success").length,
          },
        },
        { status: 502 },
      );
    }

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      console.error("[analyze-store][llm] empty model response", {
        choices: completion.choices?.length ?? 0,
      });
      return NextResponse.json(
        {
          error: "LLM step failed: model returned an empty response.",
          step: "llm",
          crawledPages: pages,
        },
        { status: 502 },
      );
    }

    let parsed: Partial<AnalysisData> | null = null;
    try {
      parsed = parseAnalysis(raw);
    } catch (error) {
      logStepError("json-parse-exception", error, {
        rawLength: raw.length,
        rawSnippet: raw.slice(0, 800),
      });
      return NextResponse.json(
        {
          error: `JSON parse step failed: ${error instanceof Error ? error.message : "Parser exception."}`,
          step: "json_parse",
          crawledPages: pages,
          rawSnippet: raw.slice(0, 2000),
        },
        { status: 502 },
      );
    }

    if (!parsed) {
      console.error("[analyze-store][json-parse] unable to parse model JSON", {
        rawLength: raw.length,
        rawSnippet: raw.slice(0, 800),
      });
      return NextResponse.json(
        {
          error: "JSON parse step failed: model output was not valid JSON.",
          step: "json_parse",
          crawledPages: pages,
          rawSnippet: raw.slice(0, 2000),
        },
        { status: 502 },
      );
    }

    const analysisData = normalizeAnalysis(parsed);
    return NextResponse.json({
      analysisData,
      crawledPages: pages,
      pagesAttempted: pages.length,
      pagesSuccessful: pages.filter((item) => item.status === "success").length,
      source: "groq",
    });
  } catch (error) {
    logStepError("unhandled", error, { inputUrl: parsedBody.data.url });
    return NextResponse.json(
      {
        error: `Analyzer failed: ${error instanceof Error ? error.message : "Unknown server error."}`,
        step: "unhandled",
      },
      { status: 500 },
    );
  }
}
