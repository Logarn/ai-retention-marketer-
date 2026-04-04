import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID, ensureBrandProfileForStore } from "./store";

type BrandProfilePayload = {
  brandName?: string | null;
  tagline?: string | null;
  industry?: string | null;
  niche?: string | null;
  brandStory?: string | null;
  usp?: string | null;
  missionStatement?: string | null;
  websiteUrl?: string | null;
  targetDemographics?: string | null;
  targetPsychographics?: string | null;
  audiencePainPoints?: string | null;
  audienceDesires?: string | null;
  voiceFormalCasual?: number;
  voiceSeriousPlayful?: number;
  voiceReservedEnthusiastic?: number;
  voiceTechnicalSimple?: number;
  voiceAuthoritativeApproachable?: number;
  voiceMinimalDescriptive?: number;
  voiceLuxuryAccessible?: number;
  voiceEdgySafe?: number;
  voiceEmotionalRational?: number;
  voiceTrendyTimeless?: number;
  voiceDescription?: string | null;
  greetingStyle?: string | null;
  signOffStyle?: string | null;
  emojiUsage?: string | null;
  preferredLength?: string | null;
  discountPhilosophy?: string | null;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeSlider(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizePayload(input: Partial<BrandProfilePayload>, existing?: { [key: string]: unknown }) {
  return {
    brandName: normalizeText(input.brandName) ?? normalizeText(existing?.brandName) ?? null,
    tagline: normalizeText(input.tagline),
    industry: normalizeText(input.industry),
    niche: normalizeText(input.niche),
    brandStory: normalizeText(input.brandStory),
    usp: normalizeText(input.usp),
    missionStatement: normalizeText(input.missionStatement),
    websiteUrl: normalizeText(input.websiteUrl),
    targetDemographics: normalizeText(input.targetDemographics),
    targetPsychographics: normalizeText(input.targetPsychographics),
    audiencePainPoints: normalizeText(input.audiencePainPoints),
    audienceDesires: normalizeText(input.audienceDesires),
    voiceFormalCasual: normalizeSlider(input.voiceFormalCasual, Number(existing?.voiceFormalCasual ?? 50)),
    voiceSeriousPlayful: normalizeSlider(
      input.voiceSeriousPlayful,
      Number(existing?.voiceSeriousPlayful ?? 50),
    ),
    voiceReservedEnthusiastic: normalizeSlider(
      input.voiceReservedEnthusiastic,
      Number(existing?.voiceReservedEnthusiastic ?? 50),
    ),
    voiceTechnicalSimple: normalizeSlider(
      input.voiceTechnicalSimple,
      Number(existing?.voiceTechnicalSimple ?? 50),
    ),
    voiceAuthoritativeApproachable: normalizeSlider(
      input.voiceAuthoritativeApproachable,
      Number(existing?.voiceAuthoritativeApproachable ?? 50),
    ),
    voiceMinimalDescriptive: normalizeSlider(
      input.voiceMinimalDescriptive,
      Number(existing?.voiceMinimalDescriptive ?? 50),
    ),
    voiceLuxuryAccessible: normalizeSlider(
      input.voiceLuxuryAccessible,
      Number(existing?.voiceLuxuryAccessible ?? 50),
    ),
    voiceEdgySafe: normalizeSlider(input.voiceEdgySafe, Number(existing?.voiceEdgySafe ?? 50)),
    voiceEmotionalRational: normalizeSlider(
      input.voiceEmotionalRational,
      Number(existing?.voiceEmotionalRational ?? 50),
    ),
    voiceTrendyTimeless: normalizeSlider(
      input.voiceTrendyTimeless,
      Number(existing?.voiceTrendyTimeless ?? 50),
    ),
    voiceDescription: normalizeText(input.voiceDescription),
    greetingStyle: normalizeText(input.greetingStyle) ?? "friendly",
    signOffStyle: normalizeText(input.signOffStyle) ?? "warm",
    emojiUsage: normalizeText(input.emojiUsage) ?? "sparingly",
    preferredLength: normalizeText(input.preferredLength) ?? "medium",
    discountPhilosophy: normalizeText(input.discountPhilosophy) ?? "strategically",
  };
}

export async function GET() {
  try {
    const profile = await ensureBrandProfileForStore();
    const [ctas, phrases, rules, customVoiceDimensions] = await Promise.all([
      prisma.brandCTA.findMany({
        where: { storeId: DEFAULT_STORE_ID },
        orderBy: { createdAt: "desc" },
      }),
      prisma.brandPhrase.findMany({
        where: { storeId: DEFAULT_STORE_ID },
        orderBy: { createdAt: "desc" },
      }),
      prisma.brandRule.findMany({
        where: { storeId: DEFAULT_STORE_ID },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      }),
      prisma.customVoiceDimension.findMany({
        where: { storeId: DEFAULT_STORE_ID },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return NextResponse.json({
      profile,
      ctas,
      phrases,
      rules,
      customVoiceDimensions,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load brand profile",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<BrandProfilePayload>;
    const existing = await ensureBrandProfileForStore();
    const normalized = normalizePayload(body, existing as unknown as { [key: string]: unknown });
    const updated = await prisma.brandProfile.upsert({
      where: { storeId: DEFAULT_STORE_ID },
      create: {
        storeId: DEFAULT_STORE_ID,
        ...normalized,
      },
      update: normalized,
    });
    return NextResponse.json({ profile: updated });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to update brand profile",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
