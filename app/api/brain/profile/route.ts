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

function hasOwn(input: object, key: keyof BrandProfilePayload) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function normalizePayload(input: Partial<BrandProfilePayload>, existing?: { [key: string]: unknown }) {
  return {
    // Only normalize keys present in the incoming PATCH-like payload.
    // This prevents auto-save blur updates from nulling unrelated columns.
    ...(hasOwn(input, "brandName")
      ? { brandName: normalizeText(input.brandName) ?? normalizeText(existing?.brandName) ?? null }
      : {}),
    ...(hasOwn(input, "tagline") ? { tagline: normalizeText(input.tagline) } : {}),
    ...(hasOwn(input, "industry") ? { industry: normalizeText(input.industry) } : {}),
    ...(hasOwn(input, "niche") ? { niche: normalizeText(input.niche) } : {}),
    ...(hasOwn(input, "brandStory") ? { brandStory: normalizeText(input.brandStory) } : {}),
    ...(hasOwn(input, "usp") ? { usp: normalizeText(input.usp) } : {}),
    ...(hasOwn(input, "missionStatement") ? { missionStatement: normalizeText(input.missionStatement) } : {}),
    ...(hasOwn(input, "websiteUrl") ? { websiteUrl: normalizeText(input.websiteUrl) } : {}),
    ...(hasOwn(input, "targetDemographics")
      ? { targetDemographics: normalizeText(input.targetDemographics) }
      : {}),
    ...(hasOwn(input, "targetPsychographics")
      ? { targetPsychographics: normalizeText(input.targetPsychographics) }
      : {}),
    ...(hasOwn(input, "audiencePainPoints")
      ? { audiencePainPoints: normalizeText(input.audiencePainPoints) }
      : {}),
    ...(hasOwn(input, "audienceDesires") ? { audienceDesires: normalizeText(input.audienceDesires) } : {}),
    ...(hasOwn(input, "voiceFormalCasual")
      ? { voiceFormalCasual: normalizeSlider(input.voiceFormalCasual, Number(existing?.voiceFormalCasual ?? 50)) }
      : {}),
    ...(hasOwn(input, "voiceSeriousPlayful")
      ? {
          voiceSeriousPlayful: normalizeSlider(
            input.voiceSeriousPlayful,
            Number(existing?.voiceSeriousPlayful ?? 50),
          ),
        }
      : {}),
    ...(hasOwn(input, "voiceReservedEnthusiastic")
      ? {
          voiceReservedEnthusiastic: normalizeSlider(
            input.voiceReservedEnthusiastic,
            Number(existing?.voiceReservedEnthusiastic ?? 50),
          ),
        }
      : {}),
    ...(hasOwn(input, "voiceTechnicalSimple")
      ? {
          voiceTechnicalSimple: normalizeSlider(
            input.voiceTechnicalSimple,
            Number(existing?.voiceTechnicalSimple ?? 50),
          ),
        }
      : {}),
    ...(hasOwn(input, "voiceAuthoritativeApproachable")
      ? {
          voiceAuthoritativeApproachable: normalizeSlider(
            input.voiceAuthoritativeApproachable,
            Number(existing?.voiceAuthoritativeApproachable ?? 50),
          ),
        }
      : {}),
    ...(hasOwn(input, "voiceMinimalDescriptive")
      ? {
          voiceMinimalDescriptive: normalizeSlider(
            input.voiceMinimalDescriptive,
            Number(existing?.voiceMinimalDescriptive ?? 50),
          ),
        }
      : {}),
    ...(hasOwn(input, "voiceLuxuryAccessible")
      ? {
          voiceLuxuryAccessible: normalizeSlider(
            input.voiceLuxuryAccessible,
            Number(existing?.voiceLuxuryAccessible ?? 50),
          ),
        }
      : {}),
    ...(hasOwn(input, "voiceEdgySafe")
      ? { voiceEdgySafe: normalizeSlider(input.voiceEdgySafe, Number(existing?.voiceEdgySafe ?? 50)) }
      : {}),
    ...(hasOwn(input, "voiceEmotionalRational")
      ? {
          voiceEmotionalRational: normalizeSlider(
            input.voiceEmotionalRational,
            Number(existing?.voiceEmotionalRational ?? 50),
          ),
        }
      : {}),
    ...(hasOwn(input, "voiceTrendyTimeless")
      ? {
          voiceTrendyTimeless: normalizeSlider(
            input.voiceTrendyTimeless,
            Number(existing?.voiceTrendyTimeless ?? 50),
          ),
        }
      : {}),
    ...(hasOwn(input, "voiceDescription") ? { voiceDescription: normalizeText(input.voiceDescription) } : {}),
    ...(hasOwn(input, "greetingStyle")
      ? { greetingStyle: normalizeText(input.greetingStyle) ?? "friendly" }
      : {}),
    ...(hasOwn(input, "signOffStyle")
      ? { signOffStyle: normalizeText(input.signOffStyle) ?? "warm" }
      : {}),
    ...(hasOwn(input, "emojiUsage") ? { emojiUsage: normalizeText(input.emojiUsage) ?? "sparingly" } : {}),
    ...(hasOwn(input, "preferredLength")
      ? { preferredLength: normalizeText(input.preferredLength) ?? "medium" }
      : {}),
    ...(hasOwn(input, "discountPhilosophy")
      ? { discountPhilosophy: normalizeText(input.discountPhilosophy) ?? "strategically" }
      : {}),
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
    const payload = {
      profile,
      ctas,
      phrases,
      rules,
      customVoiceDimensions,
    };
    console.log("[brain/profile][GET] returning payload:", payload);
    return NextResponse.json(payload);
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
    console.log("[brain/profile][PUT] incoming body:", body);
    const existing = await ensureBrandProfileForStore();
    const normalized = normalizePayload(body, existing as unknown as { [key: string]: unknown });
    console.log("[brain/profile][PUT] normalized update payload:", normalized);
    const updated = await prisma.brandProfile.upsert({
      where: { storeId: DEFAULT_STORE_ID },
      create: {
        storeId: DEFAULT_STORE_ID,
        ...normalized,
      },
      update: normalized,
    });
    console.log("[brain/profile][PUT] updated profile:", updated);
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
