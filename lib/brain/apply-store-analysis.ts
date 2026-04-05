import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/app/api/brain/profile/store";
import type { AnalysisData } from "@/lib/brain/analyze-store-normalize";

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

function clampSlider(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function toSignOffValue(value: "warm" | "professional" | "casual" | "brand" | undefined) {
  if (value === "brand") return "brand_only";
  return value;
}

/** Normalize store/website URL for BrandProfile.websiteUrl (https origin, trailing slash stripped). */
function normalizeAnalyzedWebsiteUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    u.hash = "";
    u.search = "";
    let href = u.href;
    if (href.endsWith("/") && u.pathname !== "/") href = href.slice(0, -1);
    return href;
  } catch {
    return null;
  }
}

export type ApplyFullResult = {
  profileUpdated: boolean;
  rulesAdded: number;
  ctasAdded: number;
  phrasesAdded: number;
  createdRuleIds: string[];
  createdCtaIds: string[];
  createdPhraseIds: string[];
};

/**
 * Applies full analyzer output: profile fields + rules + CTAs + phrases (deduped).
 * When `analyzedUrl` is set, updates BrandProfile.websiteUrl to that URL.
 */
export async function applyFullStoreAnalysis(
  analysis: AnalysisData,
  options?: { analyzedUrl?: string | null },
): Promise<ApplyFullResult> {
  const websiteFromAnalysis = normalizeAnalyzedWebsiteUrl(options?.analyzedUrl ?? undefined);

  const profilePatch: Record<string, string | number | null> = {
    brandName: normalizeText(analysis.brandName),
    tagline: normalizeText(analysis.tagline),
    industry: normalizeText(analysis.industry),
    niche: normalizeText(analysis.niche),
    brandStory: normalizeText(analysis.brandStory),
    usp: normalizeText(analysis.usp),
    missionStatement: normalizeText(analysis.missionStatement),
    targetDemographics: normalizeText(analysis.targetDemographics),
    targetPsychographics: normalizeText(analysis.targetPsychographics),
    audiencePainPoints: normalizeText(analysis.audiencePainPoints),
    audienceDesires: normalizeText(analysis.audienceDesires),
    voiceFormalCasual: clampSlider(analysis.voiceFormalCasual, 50),
    voiceSeriousPlayful: clampSlider(analysis.voiceSeriousPlayful, 50),
    voiceReservedEnthusiastic: clampSlider(analysis.voiceReservedEnthusiastic, 50),
    voiceTechnicalSimple: clampSlider(analysis.voiceTechnicalSimple, 50),
    voiceAuthoritativeApproachable: clampSlider(analysis.voiceAuthoritativeApproachable, 50),
    voiceMinimalDescriptive: clampSlider(analysis.voiceMinimalDescriptive, 50),
    voiceLuxuryAccessible: clampSlider(analysis.voiceLuxuryAccessible, 50),
    voiceEdgySafe: clampSlider(analysis.voiceEdgySafe, 50),
    voiceEmotionalRational: clampSlider(analysis.voiceEmotionalRational, 50),
    voiceTrendyTimeless: clampSlider(analysis.voiceTrendyTimeless, 50),
    voiceDescription: normalizeText(analysis.voiceDescription),
    greetingStyle: analysis.greetingStyle ?? null,
    signOffStyle: toSignOffValue(analysis.signOffStyle) ?? null,
    emojiUsage: analysis.emojiUsage ?? null,
    preferredLength: analysis.preferredLength ?? null,
    discountPhilosophy: analysis.discountPhilosophy ?? null,
  };

  if (websiteFromAnalysis) {
    profilePatch.websiteUrl = websiteFromAnalysis;
  }

  await prisma.brandProfile.upsert({
    where: { storeId: DEFAULT_STORE_ID },
    create: {
      storeId: DEFAULT_STORE_ID,
      ...profilePatch,
    },
    update: profilePatch,
  });

  const createdRuleIds: string[] = [];
  const createdCtaIds: string[] = [];
  const createdPhraseIds: string[] = [];

  const dos = normalizeArray(analysis.suggestedDos, 20);
  const donts = normalizeArray(analysis.suggestedDonts, 20);
  const existingRules = await prisma.brandRule.findMany({ where: { storeId: DEFAULT_STORE_ID } });
  const ruleSet = new Set(existingRules.map((r) => `${r.type.toLowerCase()}::${r.rule.trim().toLowerCase()}`));

  for (const rule of dos) {
    const key = `do::${rule.toLowerCase()}`;
    if (ruleSet.has(key)) continue;
    const row = await prisma.brandRule.create({
      data: { storeId: DEFAULT_STORE_ID, type: "do", rule, priority: "important" },
    });
    createdRuleIds.push(row.id);
    ruleSet.add(key);
  }
  for (const rule of donts) {
    const key = `dont::${rule.toLowerCase()}`;
    if (ruleSet.has(key)) continue;
    const row = await prisma.brandRule.create({
      data: { storeId: DEFAULT_STORE_ID, type: "dont", rule, priority: "important" },
    });
    createdRuleIds.push(row.id);
    ruleSet.add(key);
  }

  const ctas = normalizeArray(analysis.suggestedCTAs, 20);
  const existingCtas = await prisma.brandCTA.findMany({ where: { storeId: DEFAULT_STORE_ID } });
  const ctaSet = new Set(existingCtas.map((c) => c.text.trim().toLowerCase()));
  for (const text of ctas) {
    const k = text.toLowerCase();
    if (ctaSet.has(k)) continue;
    const row = await prisma.brandCTA.create({
      data: { storeId: DEFAULT_STORE_ID, text, isPreferred: true },
    });
    createdCtaIds.push(row.id);
    ctaSet.add(k);
  }

  const preferred = normalizeArray(analysis.suggestedPreferredPhrases, 30);
  const banned = normalizeArray(analysis.suggestedBannedPhrases, 30);
  const existingPhrases = await prisma.brandPhrase.findMany({ where: { storeId: DEFAULT_STORE_ID } });
  const phraseSet = new Set(
    existingPhrases.map((p) => `${p.type.toLowerCase()}::${p.phrase.trim().toLowerCase()}`),
  );
  for (const phrase of preferred) {
    const key = `preferred::${phrase.toLowerCase()}`;
    if (phraseSet.has(key)) continue;
    const row = await prisma.brandPhrase.create({
      data: { storeId: DEFAULT_STORE_ID, phrase, type: "preferred" },
    });
    createdPhraseIds.push(row.id);
    phraseSet.add(key);
  }
  for (const phrase of banned) {
    const key = `banned::${phrase.toLowerCase()}`;
    if (phraseSet.has(key)) continue;
    const row = await prisma.brandPhrase.create({
      data: { storeId: DEFAULT_STORE_ID, phrase, type: "banned" },
    });
    createdPhraseIds.push(row.id);
    phraseSet.add(key);
  }

  return {
    profileUpdated: true,
    rulesAdded: createdRuleIds.length,
    ctasAdded: createdCtaIds.length,
    phrasesAdded: createdPhraseIds.length,
    createdRuleIds,
    createdCtaIds,
    createdPhraseIds,
  };
}
