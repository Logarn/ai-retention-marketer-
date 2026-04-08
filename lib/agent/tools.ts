import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { groqClient, GROQ_MODEL } from "@/lib/ai";
import { DEFAULT_STORE_ID, ensureBrandProfileForStore } from "@/app/api/brain/profile/store";
import { runStoreAnalysisPipeline } from "@/lib/agent/analyze-store-pipeline";
import { generateEmailContentWithGroq } from "@/lib/brain/email-generation-groq";
import { scrapeHomepagePlainText } from "@/lib/brain/firecrawl-homepage";
import { extractJsonText } from "@/lib/brain/analyze-store-normalize";

const DOCUMENT_ANALYSIS_SYSTEM = `You are a brand analyst. Analyze this brand document and extract any brand guidelines, rules, voice preferences, or marketing insights. Return ONLY valid JSON:
{
  "summary": "2-3 sentence summary of what this document contains",
  "brandInsights": {
    "voiceNotes": "any voice/tone guidance found",
    "dosFound": ["rule 1", "rule 2"],
    "dontsFound": ["rule 1", "rule 2"],
    "ctasFound": ["CTA 1"],
    "phrasesPreferred": ["phrase 1"],
    "phrasesBanned": ["phrase 1"],
    "audienceNotes": "any target audience info found",
    "brandStoryNotes": "any brand story/history found",
    "emailGuidelines": "any email-specific guidelines found",
    "otherInsights": ["any other useful brand info"]
  }
}`;

function parseDocumentLlmJson(raw: string): { summary: string; brandInsights: Record<string, unknown> } | null {
  const jsonText = extractJsonText(raw);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as {
      summary?: string;
      brandInsights?: Record<string, unknown>;
    };
    if (!parsed.summary || typeof parsed.summary !== "string") return null;
    if (!parsed.brandInsights || typeof parsed.brandInsights !== "object") return null;
    return { summary: parsed.summary.trim(), brandInsights: parsed.brandInsights };
  } catch {
    return null;
  }
}

async function groqJsonObject(system: string, user: string) {
  if (!groqClient) throw new Error("GROQ_API_KEY is not configured.");
  const res = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.35,
    max_completion_tokens: 2500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

/** Scalar BrandProfile fields only — avoids huge nested JSON / relation payloads in tool results. */
const brandProfileSelect = {
  id: true,
  storeId: true,
  brandName: true,
  tagline: true,
  industry: true,
  niche: true,
  brandStory: true,
  usp: true,
  missionStatement: true,
  websiteUrl: true,
  shopifyUrl: true,
  targetDemographics: true,
  targetPsychographics: true,
  audiencePainPoints: true,
  audienceDesires: true,
  voiceFormalCasual: true,
  voiceSeriousPlayful: true,
  voiceReservedEnthusiastic: true,
  voiceTechnicalSimple: true,
  voiceAuthoritativeApproachable: true,
  voiceMinimalDescriptive: true,
  voiceLuxuryAccessible: true,
  voiceEdgySafe: true,
  voiceEmotionalRational: true,
  voiceTrendyTimeless: true,
  voiceDescription: true,
  greetingStyle: true,
  signOffStyle: true,
  emojiUsage: true,
  preferredLength: true,
  discountPhilosophy: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const worklinTools = {
  getBrandProfile: tool({
    description:
      "Get the current brand profile including voice, tone, rules, CTAs, phrases, custom voice dimensions, and audience info.",
    inputSchema: z.object({}),
    execute: async () => {
      const storeId = DEFAULT_STORE_ID;
      console.log("[tools/getBrandProfile] start storeId=", storeId);
      try {
        let profile = await prisma.brandProfile.findUnique({
          where: { storeId },
          select: brandProfileSelect,
        });

        if (!profile) {
          console.warn("[tools/getBrandProfile] no row — creating via ensureBrandProfileForStore");
          await ensureBrandProfileForStore(storeId);
          profile = await prisma.brandProfile.findUnique({
            where: { storeId },
            select: brandProfileSelect,
          });
        }

        if (!profile) {
          throw new Error("BrandProfile could not be loaded or created for store default");
        }

        const [rules, ctas, phrases, customVoiceDimensions] = await Promise.all([
          prisma.brandRule.findMany({
            where: { storeId },
            orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
            take: 80,
          }),
          prisma.brandCTA.findMany({
            where: { storeId },
            orderBy: { createdAt: "desc" },
            take: 40,
          }),
          prisma.brandPhrase.findMany({
            where: { storeId },
            orderBy: { createdAt: "desc" },
            take: 80,
          }),
          prisma.customVoiceDimension.findMany({
            where: { storeId },
            orderBy: { createdAt: "asc" },
            take: 20,
          }),
        ]);

        console.log(
          "[tools/getBrandProfile] ok profileId=",
          profile.id,
          "rules",
          rules.length,
          "ctas",
          ctas.length,
        );

        return {
          profile,
          rules,
          ctas,
          phrases,
          customVoiceDimensions,
        };
      } catch (e) {
        console.error("[tools/getBrandProfile] error:", e);
        return {
          error: e instanceof Error ? e.message : "Failed to load brand profile",
          storeId,
        };
      }
    },
  }),

  updateBrandProfile: tool({
    description: "Update specific fields in the brand profile (partial update).",
    inputSchema: z.object({
      fields: z.record(z.string(), z.any()),
    }),
    execute: async ({ fields }) => {
      try {
        const allowed = new Set([
          "brandName",
          "tagline",
          "industry",
          "niche",
          "brandStory",
          "usp",
          "missionStatement",
          "websiteUrl",
          "shopifyUrl",
          "targetDemographics",
          "targetPsychographics",
          "audiencePainPoints",
          "audienceDesires",
          "voiceFormalCasual",
          "voiceSeriousPlayful",
          "voiceReservedEnthusiastic",
          "voiceTechnicalSimple",
          "voiceAuthoritativeApproachable",
          "voiceMinimalDescriptive",
          "voiceLuxuryAccessible",
          "voiceEdgySafe",
          "voiceEmotionalRational",
          "voiceTrendyTimeless",
          "voiceDescription",
          "greetingStyle",
          "signOffStyle",
          "emojiUsage",
          "preferredLength",
          "discountPhilosophy",
        ]);
        const patch: Record<string, unknown> = {};
        const updatedFields: string[] = [];
        for (const [k, v] of Object.entries(fields)) {
          if (!allowed.has(k)) continue;
          patch[k] = v;
          updatedFields.push(k);
        }
        if (updatedFields.length === 0) {
          return { success: false as const, error: "No valid fields to update", updatedFields: [] };
        }
        await ensureBrandProfileForStore(DEFAULT_STORE_ID);
        await prisma.brandProfile.update({
          where: { storeId: DEFAULT_STORE_ID },
          data: patch as Record<string, unknown>,
        });
        return { success: true as const, updatedFields };
      } catch (e) {
        return {
          success: false as const,
          error: e instanceof Error ? e.message : "Update failed",
          updatedFields: [] as string[],
        };
      }
    },
  }),

  analyzeStore: tool({
    description:
      "Crawl a website URL and extract brand identity, voice, audience, and messaging rules. Auto-saves to brand profile.",
    inputSchema: z.object({ url: z.string().min(1) }),
    execute: async ({ url }) => {
      try {
        const { analysisData, pageUrl, applied } = await runStoreAnalysisPipeline(url);
        return {
          ok: true as const,
          pageUrl,
          analysisData,
          appliedSummary: applied,
        };
      } catch (e) {
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : "Store analysis failed",
        };
      }
    },
  }),

  generateEmailContent: tool({
    description:
      "Generate an email brief and copy for a specific scenario using the brand voice (uses Groq). Always use this for email drafts.",
    inputSchema: z.object({
      scenario: z.string().min(1),
      context: z.string().optional(),
    }),
    execute: async ({ scenario, context }) => {
      try {
        const result = await generateEmailContentWithGroq(scenario, context ?? null);
        return { brief: result.brief, copy: result.copy };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Email generation failed" };
      }
    },
  }),

  analyzeDocument: tool({
    description: "Extract brand insights from document text; saves a BrandDocument record and runs analysis.",
    inputSchema: z.object({
      documentText: z.string().min(1),
      fileName: z.string().min(1),
    }),
    execute: async ({ documentText, fileName }) => {
      try {
        if (!groqClient) throw new Error("GROQ_API_KEY is not configured.");
        const truncated = documentText.slice(0, 20000);
        const doc = await prisma.brandDocument.create({
          data: {
            storeId: DEFAULT_STORE_ID,
            fileName,
            fileType: "txt",
            fileSize: Buffer.byteLength(truncated, "utf8"),
            rawText: truncated,
            status: "processing",
          },
        });
        const llmInput = truncated.slice(0, 4000);
        const raw = await groqJsonObject(
          DOCUMENT_ANALYSIS_SYSTEM,
          `Document file name: ${fileName}\n\nContent:\n${llmInput}`,
        );
        const structured = parseDocumentLlmJson(raw);
        if (!structured) {
          await prisma.brandDocument.update({
            where: { id: doc.id },
            data: { status: "failed", error: "Invalid JSON from model" },
          });
          return { error: "Analysis failed: invalid model output" };
        }
        await prisma.brandDocument.update({
          where: { id: doc.id },
          data: {
            summary: structured.summary,
            extractedRules: JSON.stringify(structured.brandInsights),
            status: "completed",
            error: null,
          },
        });
        return {
          documentId: doc.id,
          summary: structured.summary,
          insights: structured.brandInsights,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Document analysis failed" };
      }
    },
  }),

  findCompetitors: tool({
    description:
      "Find top competitors in the niche with CMO-level analysis (positioning, strengths, what they do better).",
    inputSchema: z.object({
      industry: z.string().min(1),
      niche: z.string().min(1),
      brandName: z.string().min(1),
    }),
    execute: async ({ industry, niche, brandName }) => {
      try {
        const raw = await groqJsonObject(
          `Return ONLY JSON: { "competitors": [ { "name": string, "url": string, "analysis": string, "strengths": string[], "whatTheyDoBetter": string } ] } with exactly 3 competitors.`,
          `Brand: ${brandName}\nIndustry: ${industry}\nNiche: ${niche}\n\nIdentify 3 strong competitors outperforming in this space. Be specific and actionable.`,
        );
        const json = extractJsonText(raw);
        if (!json) return { error: "Could not parse competitor JSON" };
        const parsed = JSON.parse(json) as {
          competitors?: Array<{
            name?: string;
            url?: string;
            analysis?: string;
            strengths?: string[];
            whatTheyDoBetter?: string;
          }>;
        };
        return {
          competitors: (parsed.competitors ?? []).slice(0, 3).map((c) => ({
            name: c.name ?? "",
            url: c.url ?? "",
            analysis: c.analysis ?? "",
            strengths: Array.isArray(c.strengths) ? c.strengths.map(String) : [],
            whatTheyDoBetter: c.whatTheyDoBetter ?? "",
          })),
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Competitor search failed" };
      }
    },
  }),

  analyzeCompetitorSite: tool({
    description: "Crawl a competitor website homepage and analyze positioning vs our brand.",
    inputSchema: z.object({
      url: z.string().min(1),
      competitorName: z.string().min(1),
    }),
    execute: async ({ url, competitorName }) => {
      try {
        const profile = await ensureBrandProfileForStore(DEFAULT_STORE_ID);
        const { content, pageUrl } = await scrapeHomepagePlainText(url);
        const raw = await groqJsonObject(
          `Return ONLY JSON: { "positioning": string, "messagingThemes": string[], "emailStrategySignals": string[], "pricingSignals": string, "strengthsVsOurBrand": string, "opportunitiesForUs": string[] }`,
          `Competitor: ${competitorName}\nTheir site URL: ${pageUrl}\n\nOur brand: ${profile.brandName ?? "Unknown"} — ${profile.industry ?? ""} / ${profile.niche ?? ""}\nOur USP: ${profile.usp ?? "N/A"}\n\nHomepage text:\n${content.slice(0, 6000)}`,
        );
        const json = extractJsonText(raw);
        if (!json) return { error: "Failed to parse competitor site analysis" };
        return JSON.parse(json) as Record<string, unknown>;
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Competitor site analysis failed" };
      }
    },
  }),

  analyzeCompetitorEmail: tool({
    description: "Analyze pasted competitor email copy for tactics and learnings.",
    inputSchema: z.object({
      emailContent: z.string().min(1),
      competitorName: z.string().optional(),
    }),
    execute: async ({ emailContent, competitorName }) => {
      try {
        const raw = await groqJsonObject(
          `Return ONLY JSON: { "subjectLineStrategy": string, "tone": string, "offerType": string, "ctaApproach": string, "urgencyTactics": string[], "personalizationLevel": string, "takeaways": string[] }`,
          `Analyze this competitor email${competitorName ? ` (from ${competitorName})` : ""}:\n\n${emailContent.slice(0, 8000)}`,
        );
        const json = extractJsonText(raw);
        if (!json) return { error: "Failed to parse email analysis" };
        return JSON.parse(json) as Record<string, unknown>;
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Email analysis failed" };
      }
    },
  }),

  getCustomerStats: tool({
    description: "Get customer and order statistics from the database.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const [customerCount, orderCount, orderAgg, topProducts] = await Promise.all([
          prisma.customer.count(),
          prisma.order.count(),
          prisma.order.aggregate({
            _sum: { totalAmount: true },
            _avg: { totalAmount: true },
          }),
          prisma.orderItem.groupBy({
            by: ["productId"],
            _sum: { quantity: true },
            orderBy: { _sum: { quantity: "desc" } },
            take: 5,
          }),
        ]);
        const productIds = topProducts.map((p) => p.productId);
        const products = await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, price: true },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));
        const repeatCustomers = await prisma.customer.count({ where: { totalOrders: { gt: 1 } } });
        const revenue = orderAgg._sum.totalAmount ?? 0;
        const aov = orderCount > 0 ? revenue / orderCount : 0;
        return {
          customerCount,
          orderCount,
          totalRevenue: revenue,
          averageOrderValue: aov,
          repeatCustomerCount: repeatCustomers,
          repeatPurchaseRate: customerCount > 0 ? repeatCustomers / customerCount : 0,
          topProductsByUnits: topProducts.map((row) => ({
            product: productMap.get(row.productId)?.name ?? row.productId,
            units: row._sum.quantity ?? 0,
          })),
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Stats query failed" };
      }
    },
  }),

  searchBrandDocuments: tool({
    description: "Search uploaded brand documents for a query (matches raw text and extracted insights).",
    inputSchema: z.object({ query: z.string().min(1) }),
    execute: async ({ query }) => {
      try {
        const q = query.toLowerCase();
        const docs = await prisma.brandDocument.findMany({
          where: { storeId: DEFAULT_STORE_ID },
          orderBy: { createdAt: "desc" },
          take: 40,
        });
        const matches: Array<{ fileName: string; excerpt: string }> = [];
        for (const d of docs) {
          const hay = `${d.rawText}\n${d.summary ?? ""}\n${d.extractedRules ?? ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
          const idx = hay.indexOf(q);
          const start = Math.max(0, idx - 80);
          const excerpt = (d.rawText + (d.summary ? "\n" + d.summary : "")).slice(start, start + 280);
          matches.push({ fileName: d.fileName, excerpt: excerpt.trim() });
          if (matches.length >= 12) break;
        }
        return { matches, query };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Document search failed" };
      }
    },
  }),
};
