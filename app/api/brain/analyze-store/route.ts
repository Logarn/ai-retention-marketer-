import { NextResponse } from "next/server";
import { z } from "zod";
import Firecrawl from "@mendable/firecrawl-js";
import { groqClient, GROQ_MODEL } from "@/lib/ai";

export const maxDuration = 60;

const STORE_ID = "default";
const MAX_PAGES = 8;
const MAX_PAGE_MARKDOWN_CHARS = 2000;
const MAX_COMBINED_MARKDOWN_CHARS = 10000;
const GROQ_RETRY_ATTEMPTS = 3;

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

type ScrapedChunk = {
  url: string;
  label: string;
  markdown: string;
  order: number;
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  const directStatus = record.status;
  if (typeof directStatus === "number") return directStatus;
  const response = record.response as Record<string, unknown> | undefined;
  if (response && typeof response.status === "number") return response.status;
  const nestedError = record.error as Record<string, unknown> | undefined;
  if (nestedError && typeof nestedError.status === "number") return nestedError.status;
  return undefined;
}

function stripBoilerplate(markdown: string) {
  const linkAndMediaStripped = markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]+>/g, " ");

  const lines = linkAndMediaStripped.replace(/\r/g, "").split("\n");
  const kept: string[] = [];
  const seenShort = new Set<string>();
  const boilerplatePattern =
    /\b(cookie|privacy policy|terms(?: of service)?|all rights reserved|accept all|manage preferences|newsletter|subscribe|skip to content|back to top|powered by|wishlist|cart|login|my account|search|navigation|menu|footer)\b/i;

  for (const raw of lines) {
    const compact = raw.replace(/\s+/g, " ").trim();
    if (!compact) {
      kept.push("");
      continue;
    }

    const lower = compact.toLowerCase();
    if (compact.length <= 180 && boilerplatePattern.test(compact)) continue;
    if (/^(home|shop|collections|products|about|faq|contact)\s*[>|/\\-]?/i.test(compact) && compact.length < 80) {
      continue;
    }

    if (compact.length <= 200) {
      if (seenShort.has(lower)) continue;
      seenShort.add(lower);
    }
    kept.push(raw.trimEnd());
  }

  const collapsed: string[] = [];
  let blankCount = 0;
  for (const line of kept) {
    if (!line.trim()) {
      blankCount += 1;
      if (blankCount > 2) continue;
      collapsed.push("");
      continue;
    }
    blankCount = 0;
    collapsed.push(line);
  }

  const collapsedText = collapsed.join("\n").trim();
  // Strip remaining markdown formatting aggressively to plain text.
  return collapsedText
    .replace(/[#>*`_~=-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function classifyChunkPriority(chunk: ScrapedChunk) {
  const label = chunk.label.toLowerCase();
  const pathname = (() => {
    try {
      return new URL(chunk.url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (label.includes("homepage")) return 0;
  if (label.includes("about") || pathname.includes("/about") || pathname.includes("/our-story")) return 1;
  if (label.includes("product") || pathname.startsWith("/products/")) return 2;
  if (label.includes("collections") || pathname.startsWith("/collections")) return 3;
  if (label.includes("faq") || pathname.includes("/faq")) return 4;
  return 5;
}

function prioritizeChunks(chunks: ScrapedChunk[]) {
  const withPriority = chunks
    .map((chunk) => ({ chunk, priority: classifyChunkPriority(chunk) }))
    .sort((a, b) => (a.priority === b.priority ? a.chunk.order - b.chunk.order : a.priority - b.priority));

  const homepage = withPriority.filter((item) => item.priority === 0).map((item) => item.chunk).slice(0, 1);
  const about = withPriority.filter((item) => item.priority === 1).map((item) => item.chunk).slice(0, 1);
  const products = withPriority.filter((item) => item.priority === 2).map((item) => item.chunk).slice(0, 3);
  const collections = withPriority.filter((item) => item.priority === 3).map((item) => item.chunk).slice(0, 1);
  const faq = withPriority.filter((item) => item.priority === 4).map((item) => item.chunk).slice(0, 1);
  const other = withPriority.filter((item) => item.priority >= 5).map((item) => item.chunk);
  return [...homepage, ...about, ...products, ...collections, ...faq, ...other];
}

function buildCombinedMarkdown(chunks: ScrapedChunk[], charBudget = MAX_COMBINED_MARKDOWN_CHARS) {
  const prioritized = prioritizeChunks(chunks);
  const joinChunks = (items: ScrapedChunk[]) =>
    items.map((chunk) => `### ${chunk.label}\nURL: ${chunk.url}\n${chunk.markdown}`).join("\n\n---\n\n");

  const totalBeforeTruncation = joinChunks(prioritized).length;
  let selected = [...prioritized];
  let combined = joinChunks(selected);

  while (selected.length > 1 && combined.length > charBudget) {
    selected = selected.slice(0, -1);
    combined = joinChunks(selected);
  }

  if (combined.length > charBudget) {
    const homepage = prioritized.find((chunk) => classifyChunkPriority(chunk) === 0);
    const about = prioritized.find((chunk) => classifyChunkPriority(chunk) === 1);
    const product = prioritized.find((chunk) => classifyChunkPriority(chunk) === 2);
    const strictMinimal = [homepage, about, product].filter((chunk): chunk is ScrapedChunk => Boolean(chunk));
    if (strictMinimal.length) {
      selected = strictMinimal;
      combined = joinChunks(selected);
    }
  }

  if (combined.length > charBudget) combined = combined.slice(0, charBudget);

  return {
    combinedMarkdown: combined,
    selectedChunks: selected,
    totalBeforeTruncation,
    totalAfterTruncation: combined.length,
  };
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

async function callGroqWithRetry(messages: Array<{ role: "system" | "user"; content: string }>) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= GROQ_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await groqClient!.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_completion_tokens: 1400,
        response_format: { type: "json_object" },
        messages,
      });
    } catch (error) {
      lastError = error;
      const status = getErrorStatusCode(error);
      const retryable = status === 413 || status === 429;
      if (!retryable || attempt === GROQ_RETRY_ATTEMPTS) break;
      const delayMs = 2000 * 2 ** (attempt - 1);
      console.warn("[analyze-store][llm-retry]", { attempt, status, delayMs });
      await wait(delayMs);
    }
  }
  throw lastError ?? new Error("Groq call failed after retries.");
}

async function scrapePage(
  firecrawl: Firecrawl,
  url: string,
  label: string,
  pages: PageResult[],
  markdownChunks: ScrapedChunk[],
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
    const links = [...(response.links ?? []), ...extractMarkdownLinks(markdown)];
    for (const link of links) discoveredLinks.add(link);

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

    const cleaned = stripBoilerplate(markdown).slice(0, MAX_PAGE_MARKDOWN_CHARS);
    markdownChunks.push({
      url,
      label,
      markdown: cleaned,
      order: markdownChunks.length,
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
    return NextResponse.json({ error: "FIRECRAWL_API_KEY is not configured." }, { status: 500 });
  }

  try {
    const { normalized, origin } = normalizeInputUrl(parsedBody.data.url);
    const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

    const pages: PageResult[] = [];
    const markdownChunks: ScrapedChunk[] = [];
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

    await queueScrape(normalized, "Homepage");

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

    const faqFromLinks =
      normalizedDiscovered().find((link) => {
        const pathname = new URL(link).pathname.toLowerCase();
        return pathname === "/pages/faq" || pathname === "/faq";
      }) ?? null;
    await queueScrape(faqFromLinks ?? new URL("/pages/faq", origin).toString(), "FAQ page");

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

    const successfulProductCount = pages.filter((p) => p.label === "Product page" && p.status === "success").length;
    if (successfulProductCount < 3 && pages.length < MAX_PAGES) {
      await queueScrape(new URL("/collections/all", origin).toString(), "Collections all");
      await scrapeProductLinks();
    }

    if (markdownChunks.length === 0) {
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

    const combinedMarkdownBundle = buildCombinedMarkdown(markdownChunks, MAX_COMBINED_MARKDOWN_CHARS);
    const combinedMarkdown = combinedMarkdownBundle.combinedMarkdown;

    const identityPrompt = `You are a brand analyst. Analyze the website content and return ONLY valid JSON with these fields:
{
  "brandName": "",
  "tagline": "",
  "industry": "",
  "niche": "",
  "brandStory": "",
  "usp": "",
  "missionStatement": "",
  "targetDemographics": "",
  "targetPsychographics": "",
  "audiencePainPoints": "",
  "audienceDesires": "",
  "productsSummary": "",
  "priceRange": "",
  "competitivePositioning": ""
}`;

    const voicePrompt = `You are a brand voice analyst. Analyze the website content and return ONLY valid JSON with these fields:
{
  "voiceFormalCasual": 0,
  "voiceSeriousPlayful": 0,
  "voiceReservedEnthusiastic": 0,
  "voiceTechnicalSimple": 0,
  "voiceAuthoritativeApproachable": 0,
  "voiceMinimalDescriptive": 0,
  "voiceLuxuryAccessible": 0,
  "voiceEdgySafe": 0,
  "voiceEmotionalRational": 0,
  "voiceTrendyTimeless": 0,
  "voiceDescription": "",
  "suggestedDos": [],
  "suggestedDonts": [],
  "suggestedCTAs": [],
  "suggestedPreferredPhrases": [],
  "suggestedBannedPhrases": [],
  "greetingStyle": "formal|friendly|casual|none",
  "signOffStyle": "warm|professional|casual|brand",
  "emojiUsage": "never|sparingly|often",
  "preferredLength": "short|medium|long",
  "discountPhilosophy": "never|rarely|strategically|frequently"
}`;

    let identityCompletion: Awaited<ReturnType<typeof groqClient.chat.completions.create>>;
    try {
      identityCompletion = await callGroqWithRetry([
        { role: "system", content: identityPrompt },
        {
          role: "user",
          content: `Store URL: ${normalized}\nStore ID: ${STORE_ID}\n\nWebsite content:\n${combinedMarkdown}`,
        },
      ]);
    } catch (error) {
      logStepError("llm-call-identity", error, {
        combinedMarkdownLength: combinedMarkdown.length,
        pagesSuccessful: pages.filter((item) => item.status === "success").length,
      });
      return NextResponse.json(
        {
          error: `LLM identity/audience step failed: ${error instanceof Error ? error.message : "Groq request failed."}`,
          step: "llm_identity",
          crawledPages: pages,
        },
        { status: 502 },
      );
    }

    const identityRaw = identityCompletion.choices[0]?.message?.content?.trim() ?? "";
    const identityData = identityRaw ? parseAnalysis(identityRaw) : null;
    if (!identityData) {
      return NextResponse.json(
        {
          error: "LLM identity/audience step returned invalid JSON.",
          step: "json_parse_identity",
          crawledPages: pages,
          rawSnippet: identityRaw.slice(0, 2000),
        },
        { status: 502 },
      );
    }

    await wait(5000);

    let voiceCompletion: Awaited<ReturnType<typeof groqClient.chat.completions.create>>;
    try {
      voiceCompletion = await callGroqWithRetry([
        { role: "system", content: voicePrompt },
        {
          role: "user",
          content: `Store URL: ${normalized}\nStore ID: ${STORE_ID}\n\nWebsite content:\n${combinedMarkdown}`,
        },
      ]);
    } catch (error) {
      logStepError("llm-call-voice", error, {
        combinedMarkdownLength: combinedMarkdown.length,
      });
      return NextResponse.json(
        {
          error: `LLM voice/messaging step failed: ${error instanceof Error ? error.message : "Groq request failed."}`,
          step: "llm_voice",
          crawledPages: pages,
        },
        { status: 502 },
      );
    }

    const voiceRaw = voiceCompletion.choices[0]?.message?.content?.trim() ?? "";
    const voiceData = voiceRaw ? parseAnalysis(voiceRaw) : null;
    if (!voiceData) {
      return NextResponse.json(
        {
          error: "LLM voice/messaging step returned invalid JSON.",
          step: "json_parse_voice",
          crawledPages: pages,
          rawSnippet: voiceRaw.slice(0, 2000),
        },
        { status: 502 },
      );
    }

    const analysisData = normalizeAnalysis({
      ...identityData,
      ...voiceData,
    });

    return NextResponse.json({
      analysisData,
      crawledPages: pages,
      pagesAttempted: pages.length,
      pagesSuccessful: pages.filter((item) => item.status === "success").length,
      source: "groq",
      diagnostics: {
        totalBeforeTruncation: combinedMarkdownBundle.totalBeforeTruncation,
        totalAfterTruncation: combinedMarkdownBundle.totalAfterTruncation,
        selectedPages: combinedMarkdownBundle.selectedChunks.map((chunk) => ({
          label: chunk.label,
          url: chunk.url,
          chars: chunk.markdown.length,
        })),
      },
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
