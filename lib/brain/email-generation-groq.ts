import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID, ensureBrandProfileForStore } from "@/app/api/brain/profile/store";
import { GROQ_MODEL } from "@/lib/ai";

const MODEL = GROQ_MODEL;

const VOICE_DIMENSIONS: Array<{
  key:
    | "voiceFormalCasual"
    | "voiceSeriousPlayful"
    | "voiceReservedEnthusiastic"
    | "voiceTechnicalSimple"
    | "voiceAuthoritativeApproachable"
    | "voiceMinimalDescriptive"
    | "voiceLuxuryAccessible"
    | "voiceEdgySafe"
    | "voiceEmotionalRational"
    | "voiceTrendyTimeless";
  left: string;
  right: string;
}> = [
  { key: "voiceFormalCasual", left: "Formal", right: "Casual" },
  { key: "voiceSeriousPlayful", left: "Serious", right: "Playful" },
  { key: "voiceReservedEnthusiastic", left: "Reserved", right: "Enthusiastic" },
  { key: "voiceTechnicalSimple", left: "Technical", right: "Simple" },
  { key: "voiceAuthoritativeApproachable", left: "Authoritative", right: "Approachable" },
  { key: "voiceMinimalDescriptive", left: "Minimal", right: "Descriptive" },
  { key: "voiceLuxuryAccessible", left: "Luxury", right: "Accessible" },
  { key: "voiceEdgySafe", left: "Edgy", right: "Safe" },
  { key: "voiceEmotionalRational", left: "Emotional", right: "Rational" },
  { key: "voiceTrendyTimeless", left: "Trendy", right: "Timeless" },
];

function describeScale(value: number, left: string, right: string) {
  if (value <= 20) return `${value}/100 meaning very ${left.toLowerCase()}`;
  if (value <= 40) return `${value}/100 meaning fairly ${left.toLowerCase()}`;
  if (value <= 60) return `${value}/100 meaning balanced between ${left.toLowerCase()} and ${right.toLowerCase()}`;
  if (value <= 80) return `${value}/100 meaning fairly ${right.toLowerCase()}`;
  return `${value}/100 meaning very ${right.toLowerCase()}`;
}

function extractJsonText(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fencedMatches = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  if (fencedMatches?.length) {
    for (const block of fencedMatches) {
      const inner = block.replace(/```(?:json)?/i, "").replace(/```$/, "").trim();
      if (inner.startsWith("{") && inner.endsWith("}")) return inner;
    }
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace === -1) return null;
  let depth = 0;
  for (let index = firstBrace; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return trimmed.slice(firstBrace, index + 1);
    }
  }
  return null;
}

export type EmailGenResult = {
  brief: {
    campaignGoal: string;
    targetSegment: string;
    strategyRationale: string;
    subjectLines: string[];
    messagingPoints: string[];
    recommendedCTA: string;
    expectedEmotion: string;
  };
  copy: {
    subjectLine: string;
    previewText: string;
    emailBody: string;
    ctaText: string;
    signOff: string;
  };
};

function parseVoiceTestResponse(raw: string): EmailGenResult | null {
  const candidate = extractJsonText(raw);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as Partial<EmailGenResult>;
    const brief = (parsed.brief ?? {}) as Partial<EmailGenResult["brief"]>;
    const copy = (parsed.copy ?? {}) as Partial<EmailGenResult["copy"]>;
    return {
      brief: {
        campaignGoal: String(brief.campaignGoal ?? ""),
        targetSegment: String(brief.targetSegment ?? ""),
        strategyRationale: String(brief.strategyRationale ?? ""),
        subjectLines: Array.isArray(brief.subjectLines) ? brief.subjectLines.map(String).slice(0, 3) : [],
        messagingPoints: Array.isArray(brief.messagingPoints) ? brief.messagingPoints.map(String).slice(0, 6) : [],
        recommendedCTA: String(brief.recommendedCTA ?? ""),
        expectedEmotion: String(brief.expectedEmotion ?? ""),
      },
      copy: {
        subjectLine: String(copy.subjectLine ?? ""),
        previewText: String(copy.previewText ?? ""),
        emailBody: String(copy.emailBody ?? ""),
        ctaText: String(copy.ctaText ?? ""),
        signOff: String(copy.signOff ?? ""),
      },
    };
  } catch {
    return null;
  }
}

function withFallbacks(result: EmailGenResult): EmailGenResult {
  return {
    brief: {
      campaignGoal: result.brief.campaignGoal || "Drive incremental retention revenue.",
      targetSegment: result.brief.targetSegment || "Most relevant segment for this scenario.",
      strategyRationale: result.brief.strategyRationale || "Align the message to brand voice.",
      subjectLines:
        result.brief.subjectLines.length >= 3
          ? result.brief.subjectLines.slice(0, 3)
          : [...result.brief.subjectLines, "Subject A", "Subject B", "Subject C"].slice(0, 3),
      messagingPoints:
        result.brief.messagingPoints.length >= 3
          ? result.brief.messagingPoints
          : [...result.brief.messagingPoints, "Clear value", "On-brand tone"],
      recommendedCTA: result.brief.recommendedCTA || "Shop now",
      expectedEmotion: result.brief.expectedEmotion || "Confidence",
    },
    copy: {
      subjectLine: result.copy.subjectLine || result.brief.subjectLines[0] || "Hello",
      previewText: result.copy.previewText || "",
      emailBody: result.copy.emailBody || "Hi there,\n\n",
      ctaText: result.copy.ctaText || result.brief.recommendedCTA || "Shop now",
      signOff: result.copy.signOff || "Best,",
    },
  };
}

export async function generateEmailContentWithGroq(scenario: string, context?: string | null): Promise<EmailGenResult> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const [profile, rules, ctas, phrases, customVoiceDimensions] = await Promise.all([
    ensureBrandProfileForStore(DEFAULT_STORE_ID),
    prisma.brandRule.findMany({
      where: { storeId: DEFAULT_STORE_ID },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    }),
    prisma.brandCTA.findMany({
      where: { storeId: DEFAULT_STORE_ID },
      orderBy: { createdAt: "desc" },
    }),
    prisma.brandPhrase.findMany({
      where: { storeId: DEFAULT_STORE_ID },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customVoiceDimension.findMany({
      where: { storeId: DEFAULT_STORE_ID },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const doRules = rules.filter((item) => item.type === "do");
  const dontRules = rules.filter((item) => item.type === "dont");
  const preferredPhrases = phrases.filter((item) => item.type === "preferred");
  const bannedPhrases = phrases.filter((item) => item.type === "banned");

  const presetDimensionLines = VOICE_DIMENSIONS.map((dimension) => {
    const value = Number(profile[dimension.key] ?? 50);
    return `- ${dimension.left}<->${dimension.right}: ${describeScale(value, dimension.left, dimension.right)}`;
  });

  const customDimensionLines = customVoiceDimensions.length
    ? customVoiceDimensions.map(
        (item) =>
          `- ${item.leftLabel}<->${item.rightLabel}: ${describeScale(item.value, item.leftLabel, item.rightLabel)}${
            item.description ? ` (${item.description})` : ""
          }`,
      )
    : ["- None"];

  const systemPrompt = `You are a senior DTC retention strategist and lifecycle email copywriter.
You must strictly follow the brand profile and constraints.
Never use banned phrases. Prioritize preferred phrases where natural.
Respect do and don't rules.
Match voice dimensions and email preferences.
Return valid JSON only with no markdown.

BRAND PROFILE
- Brand name: ${profile.brandName ?? "Unknown"}
- Tagline: ${profile.tagline ?? "None"}
- Industry: ${profile.industry ?? "Unknown"}
- Niche: ${profile.niche ?? "Unknown"}
- Brand story: ${profile.brandStory ?? "None"}
- USP: ${profile.usp ?? "None"}
- Mission: ${profile.missionStatement ?? "None"}
- Website URL: ${profile.websiteUrl ?? "None"}

TARGET AUDIENCE
- Demographics: ${profile.targetDemographics ?? "None"}
- Psychographics: ${profile.targetPsychographics ?? "None"}
- Pain points: ${profile.audiencePainPoints ?? "None"}
- Desires: ${profile.audienceDesires ?? "None"}

VOICE DIMENSIONS (0-100)
${presetDimensionLines.join("\n")}

CUSTOM VOICE DIMENSIONS
${customDimensionLines.join("\n")}

VOICE DESCRIPTION
- ${profile.voiceDescription ?? "None"}

DO RULES
${doRules.length ? doRules.map((rule) => `- [${rule.priority}] ${rule.rule}`).join("\n") : "- None"}

DON'T RULES
${dontRules.length ? dontRules.map((rule) => `- [${rule.priority}] ${rule.rule}`).join("\n") : "- None"}

PREFERRED CTAS
${ctas.length ? ctas.map((cta) => `- ${cta.text}`).join("\n") : "- None"}

PREFERRED PHRASES
${preferredPhrases.length ? preferredPhrases.map((phrase) => `- ${phrase.phrase}`).join("\n") : "- None"}

BANNED PHRASES
${bannedPhrases.length ? bannedPhrases.map((phrase) => `- ${phrase.phrase}`).join("\n") : "- None"}

EMAIL PREFERENCES
- Greeting style: ${profile.greetingStyle ?? "friendly"}
- Sign-off style: ${profile.signOffStyle ?? "warm"}
- Emoji usage: ${profile.emojiUsage ?? "sparingly"}
- Preferred length: ${profile.preferredLength ?? "medium"}
- Discount philosophy: ${profile.discountPhilosophy ?? "strategically"}`;

  const userPrompt = `Scenario: ${scenario}
Additional context: ${context?.trim() || "None provided"}

Return JSON only in this exact shape:
{
  "brief": {
    "campaignGoal": "",
    "targetSegment": "",
    "strategyRationale": "",
    "subjectLines": ["", "", ""],
    "messagingPoints": ["", "", ""],
    "recommendedCTA": "",
    "expectedEmotion": ""
  },
  "copy": {
    "subjectLine": "",
    "previewText": "",
    "emailBody": "",
    "ctaText": "",
    "signOff": ""
  }
}`;

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.55,
    max_completion_tokens: 2200,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  const parsed = parseVoiceTestResponse(raw);
  if (!parsed) {
    throw new Error("Failed to parse email generation JSON");
  }
  return withFallbacks(parsed);
}
