import { normalizeFullAnalysis, type AnalysisData } from "@/lib/brain/analyze-store-normalize";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type AnalysisResult = AnalysisData;

export type AnalyzeAndApplyResult = {
  analysisData: AnalysisData;
  crawledPageUrl: string;
  applied: {
    profileUpdated: boolean;
    rulesAdded: number;
    ctasAdded: number;
    phrasesAdded: number;
  };
  createdIds: {
    rules: string[];
    ctas: string[];
    phrases: string[];
  };
};

/**
 * Runs scrape → extract-identity → extract-voice (with 2s delays). Does not persist.
 */
export async function runStoreAnalyzerPipeline(url: string, baseUrl: string): Promise<{
  analysisData: AnalysisData;
  crawledPageUrl: string;
}> {
  const root = baseUrl.replace(/\/$/, "");

  const scrapeRes = await fetch(`${root}/api/brain/analyze-store/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.trim() }),
  });
  const scrapeJson = (await scrapeRes.json()) as { content?: string; pageUrl?: string; error?: string };
  if (!scrapeRes.ok || !scrapeJson.content) {
    throw new Error(scrapeJson.error || "Homepage scrape failed");
  }

  await delay(2000);

  const idRes = await fetch(`${root}/api/brain/analyze-store/extract-identity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: scrapeJson.content }),
  });
  const idJson = (await idRes.json()) as { analysisData?: Partial<AnalysisData>; error?: string };
  if (!idRes.ok) throw new Error(idJson.error || "Identity extraction failed");

  await delay(2000);

  const voiceRes = await fetch(`${root}/api/brain/analyze-store/extract-voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: scrapeJson.content }),
  });
  const voiceJson = (await voiceRes.json()) as { analysisData?: Partial<AnalysisData>; error?: string };
  if (!voiceRes.ok) throw new Error(voiceJson.error || "Voice extraction failed");

  const analysisData = normalizeFullAnalysis({
    ...(idJson.analysisData ?? {}),
    ...(voiceJson.analysisData ?? {}),
  });

  return {
    analysisData,
    crawledPageUrl: scrapeJson.pageUrl ?? url,
  };
}

/**
 * Full pipeline + persist via `/api/brain/analyze-store/auto-apply`.
 * Safe to import from client components (no Prisma).
 */
export async function analyzeAndApplyStore(url: string, baseUrl: string): Promise<AnalyzeAndApplyResult> {
  const { analysisData, crawledPageUrl } = await runStoreAnalyzerPipeline(url, baseUrl);
  const root = baseUrl.replace(/\/$/, "");

  const applyRes = await fetch(`${root}/api/brain/analyze-store/auto-apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisData }),
  });
  const applyJson = (await applyRes.json()) as {
    success?: boolean;
    applied?: {
      profileUpdated: boolean;
      rulesAdded: number;
      ctasAdded: number;
      phrasesAdded: number;
    };
    createdIds?: { rules?: string[]; ctas?: string[]; phrases?: string[] };
    error?: string;
  };
  if (!applyRes.ok) {
    throw new Error(applyJson.error || "Auto-apply failed");
  }

  return {
    analysisData,
    crawledPageUrl,
    applied: applyJson.applied ?? {
      profileUpdated: true,
      rulesAdded: 0,
      ctasAdded: 0,
      phrasesAdded: 0,
    },
    createdIds: {
      rules: applyJson.createdIds?.rules ?? [],
      ctas: applyJson.createdIds?.ctas ?? [],
      phrases: applyJson.createdIds?.phrases ?? [],
    },
  };
}
