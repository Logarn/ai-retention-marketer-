export const MAX_HOMEPAGE_CHARS = 4000;

export type AnalysisData = {
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

export function normalizeInputUrl(input: string) {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  return {
    normalized: parsed.toString(),
    origin: parsed.origin,
  };
}

export function stripBoilerplate(markdown: string) {
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
  return collapsedText
    .replace(/[#>*`_~=-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function clampSlider(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function safeList(value: unknown, max = 10) {
  if (!Array.isArray(value)) return [];
  return unique(
    value
      .map((item) => safeText(item))
      .filter(Boolean),
  ).slice(0, max);
}

export function enumOrDefault<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  const lowered = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(lowered) ? (lowered as T) : fallback;
}

export function normalizeIdentityOnly(input: Record<string, unknown>): Partial<AnalysisData> {
  return {
    brandName: safeText(input.brandName),
    tagline: safeText(input.tagline),
    industry: safeText(input.industry),
    niche: safeText(input.niche),
    brandStory: safeText(input.brandStory),
    usp: safeText(input.usp),
    missionStatement: safeText(input.missionStatement),
    targetDemographics: safeText(input.targetDemographics),
    targetPsychographics: safeText(input.targetPsychographics),
    audiencePainPoints: safeText(input.audiencePainPoints),
    audienceDesires: safeText(input.audienceDesires),
    productsSummary: safeText(input.productsSummary),
    priceRange: safeText(input.priceRange),
    competitivePositioning: safeText(input.competitivePositioning),
  };
}

export function normalizeVoiceOnly(input: Record<string, unknown>): Partial<AnalysisData> {
  return {
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
    greetingStyle: enumOrDefault(input.greetingStyle, ["formal", "friendly", "casual", "none"] as const, "friendly"),
    signOffStyle: enumOrDefault(input.signOffStyle, ["warm", "professional", "casual", "brand"] as const, "warm"),
    emojiUsage: enumOrDefault(input.emojiUsage, ["never", "sparingly", "often"] as const, "sparingly"),
    preferredLength: enumOrDefault(input.preferredLength, ["short", "medium", "long"] as const, "medium"),
    discountPhilosophy: enumOrDefault(
      input.discountPhilosophy,
      ["never", "rarely", "strategically", "frequently"] as const,
      "strategically",
    ),
  };
}

export function normalizeFullAnalysis(input: Partial<AnalysisData>): AnalysisData {
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
    greetingStyle: enumOrDefault(input.greetingStyle, ["formal", "friendly", "casual", "none"] as const, "friendly"),
    signOffStyle: enumOrDefault(input.signOffStyle, ["warm", "professional", "casual", "brand"] as const, "warm"),
    emojiUsage: enumOrDefault(input.emojiUsage, ["never", "sparingly", "often"] as const, "sparingly"),
    preferredLength: enumOrDefault(input.preferredLength, ["short", "medium", "long"] as const, "medium"),
    discountPhilosophy: enumOrDefault(
      input.discountPhilosophy,
      ["never", "rarely", "strategically", "frequently"] as const,
      "strategically",
    ),
    productsSummary: safeText(input.productsSummary),
    priceRange: safeText(input.priceRange),
    competitivePositioning: safeText(input.competitivePositioning),
  };
}

export function extractJsonText(raw: string) {
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

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const jsonText = extractJsonText(raw);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
