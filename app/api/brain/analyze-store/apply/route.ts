import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "../../profile/store";

const analysisSchema = z.object({
  brandName: z.string().optional().nullable(),
  tagline: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  niche: z.string().optional().nullable(),
  brandStory: z.string().optional().nullable(),
  usp: z.string().optional().nullable(),
  missionStatement: z.string().optional().nullable(),
  targetDemographics: z.string().optional().nullable(),
  targetPsychographics: z.string().optional().nullable(),
  audiencePainPoints: z.string().optional().nullable(),
  audienceDesires: z.string().optional().nullable(),
  voiceFormalCasual: z.number().optional(),
  voiceSeriousPlayful: z.number().optional(),
  voiceReservedEnthusiastic: z.number().optional(),
  voiceTechnicalSimple: z.number().optional(),
  voiceAuthoritativeApproachable: z.number().optional(),
  voiceMinimalDescriptive: z.number().optional(),
  voiceLuxuryAccessible: z.number().optional(),
  voiceEdgySafe: z.number().optional(),
  voiceEmotionalRational: z.number().optional(),
  voiceTrendyTimeless: z.number().optional(),
  voiceDescription: z.string().optional().nullable(),
  suggestedDos: z.array(z.string()).optional(),
  suggestedDonts: z.array(z.string()).optional(),
  suggestedCTAs: z.array(z.string()).optional(),
  suggestedPreferredPhrases: z.array(z.string()).optional(),
  suggestedBannedPhrases: z.array(z.string()).optional(),
  greetingStyle: z.enum(["formal", "friendly", "casual", "none"]).optional(),
  signOffStyle: z.enum(["warm", "professional", "casual", "brand"]).optional(),
  emojiUsage: z.enum(["never", "sparingly", "often"]).optional(),
  preferredLength: z.enum(["short", "medium", "long"]).optional(),
  discountPhilosophy: z.enum(["never", "rarely", "strategically", "frequently"]).optional(),
});

const bodySchema = z.object({
  analysisData: analysisSchema,
  sections: z.array(
    z.enum(["identity", "audience", "voice", "rules", "ctas", "phrases", "emailPrefs"]),
  ),
});

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeArray(values: string[] | undefined, max = 20) {
  return (values ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, max);
}

function clampSlider(value: unknown, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function toSignOffValue(value: "warm" | "professional" | "casual" | "brand" | undefined) {
  if (value === "brand") return "brand_only";
  return value;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = bodySchema.parse(body);
    const sections = new Set(input.sections);
    const analysis = input.analysisData;

    const profilePatch: Record<string, string | number | null> = {};

    if (sections.has("identity")) {
      profilePatch.brandName = normalizeText(analysis.brandName);
      profilePatch.tagline = normalizeText(analysis.tagline);
      profilePatch.industry = normalizeText(analysis.industry);
      profilePatch.niche = normalizeText(analysis.niche);
      profilePatch.brandStory = normalizeText(analysis.brandStory);
      profilePatch.usp = normalizeText(analysis.usp);
      profilePatch.missionStatement = normalizeText(analysis.missionStatement);
    }

    if (sections.has("audience")) {
      profilePatch.targetDemographics = normalizeText(analysis.targetDemographics);
      profilePatch.targetPsychographics = normalizeText(analysis.targetPsychographics);
      profilePatch.audiencePainPoints = normalizeText(analysis.audiencePainPoints);
      profilePatch.audienceDesires = normalizeText(analysis.audienceDesires);
    }

    if (sections.has("voice")) {
      profilePatch.voiceFormalCasual = clampSlider(analysis.voiceFormalCasual);
      profilePatch.voiceSeriousPlayful = clampSlider(analysis.voiceSeriousPlayful);
      profilePatch.voiceReservedEnthusiastic = clampSlider(analysis.voiceReservedEnthusiastic);
      profilePatch.voiceTechnicalSimple = clampSlider(analysis.voiceTechnicalSimple);
      profilePatch.voiceAuthoritativeApproachable = clampSlider(
        analysis.voiceAuthoritativeApproachable,
      );
      profilePatch.voiceMinimalDescriptive = clampSlider(analysis.voiceMinimalDescriptive);
      profilePatch.voiceLuxuryAccessible = clampSlider(analysis.voiceLuxuryAccessible);
      profilePatch.voiceEdgySafe = clampSlider(analysis.voiceEdgySafe);
      profilePatch.voiceEmotionalRational = clampSlider(analysis.voiceEmotionalRational);
      profilePatch.voiceTrendyTimeless = clampSlider(analysis.voiceTrendyTimeless);
      profilePatch.voiceDescription = normalizeText(analysis.voiceDescription);
    }

    if (sections.has("emailPrefs")) {
      profilePatch.greetingStyle = analysis.greetingStyle ?? null;
      profilePatch.signOffStyle = toSignOffValue(analysis.signOffStyle) ?? null;
      profilePatch.emojiUsage = analysis.emojiUsage ?? null;
      profilePatch.preferredLength = analysis.preferredLength ?? null;
      profilePatch.discountPhilosophy = analysis.discountPhilosophy ?? null;
    }

    if (Object.keys(profilePatch).length > 0) {
      await prisma.brandProfile.upsert({
        where: { storeId: DEFAULT_STORE_ID },
        create: {
          storeId: DEFAULT_STORE_ID,
          ...profilePatch,
        },
        update: profilePatch,
      });
    }

    if (sections.has("rules")) {
      const dos = normalizeArray(analysis.suggestedDos, 20);
      const donts = normalizeArray(analysis.suggestedDonts, 20);

      if (dos.length > 0 || donts.length > 0) {
        const existing = await prisma.brandRule.findMany({
          where: { storeId: DEFAULT_STORE_ID },
        });
        const existingSet = new Set(
          existing.map((item) => `${item.type.toLowerCase()}::${item.rule.trim().toLowerCase()}`),
        );

        const createRows: Array<{ storeId: string; type: string; rule: string; priority: string }> = [];

        for (const rule of dos) {
          const key = `do::${rule.toLowerCase()}`;
          if (existingSet.has(key)) continue;
          createRows.push({
            storeId: DEFAULT_STORE_ID,
            type: "do",
            rule,
            priority: "important",
          });
          existingSet.add(key);
        }

        for (const rule of donts) {
          const key = `dont::${rule.toLowerCase()}`;
          if (existingSet.has(key)) continue;
          createRows.push({
            storeId: DEFAULT_STORE_ID,
            type: "dont",
            rule,
            priority: "important",
          });
          existingSet.add(key);
        }

        if (createRows.length > 0) {
          await prisma.brandRule.createMany({ data: createRows });
        }
      }
    }

    if (sections.has("ctas")) {
      const ctas = normalizeArray(analysis.suggestedCTAs, 20);
      if (ctas.length > 0) {
        const existing = await prisma.brandCTA.findMany({
          where: { storeId: DEFAULT_STORE_ID },
        });
        const existingSet = new Set(existing.map((item) => item.text.trim().toLowerCase()));
        const rows = ctas
          .filter((item) => {
            const key = item.toLowerCase();
            if (existingSet.has(key)) return false;
            existingSet.add(key);
            return true;
          })
          .map((item) => ({
            storeId: DEFAULT_STORE_ID,
            text: item,
            isPreferred: true,
          }));
        if (rows.length > 0) {
          await prisma.brandCTA.createMany({ data: rows });
        }
      }
    }

    if (sections.has("phrases")) {
      const preferred = normalizeArray(analysis.suggestedPreferredPhrases, 30);
      const banned = normalizeArray(analysis.suggestedBannedPhrases, 30);
      if (preferred.length > 0 || banned.length > 0) {
        const existing = await prisma.brandPhrase.findMany({
          where: { storeId: DEFAULT_STORE_ID },
        });
        const existingSet = new Set(
          existing.map((item) => `${item.type.toLowerCase()}::${item.phrase.trim().toLowerCase()}`),
        );

        const rows: Array<{ storeId: string; phrase: string; type: string }> = [];
        for (const phrase of preferred) {
          const key = `preferred::${phrase.toLowerCase()}`;
          if (existingSet.has(key)) continue;
          rows.push({ storeId: DEFAULT_STORE_ID, phrase, type: "preferred" });
          existingSet.add(key);
        }
        for (const phrase of banned) {
          const key = `banned::${phrase.toLowerCase()}`;
          if (existingSet.has(key)) continue;
          rows.push({ storeId: DEFAULT_STORE_ID, phrase, type: "banned" });
          existingSet.add(key);
        }
        if (rows.length > 0) {
          await prisma.brandPhrase.createMany({ data: rows });
        }
      }
    }

    return NextResponse.json({
      success: true,
      appliedSections: Array.from(sections),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to apply analyzer results",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
