import { NextResponse } from "next/server";
import { z } from "zod";
import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID, ensureBrandProfileForStore } from "../profile/store";

const MODEL = "llama-3.3-70b-versatile";

const payloadSchema = z.object({
  scenario: z.string().min(1),
  context: z.string().optional().nullable(),
});

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

type VoiceTestResult = {
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

function describeScale(value: number, left: string, right: string) {
  if (value <= 20) return `${value}/100 meaning very ${left.toLowerCase()}`;
  if (value <= 40) return `${value}/100 meaning fairly ${left.toLowerCase()}`;
  if (value <= 60) return `${value}/100 meaning balanced between ${left.toLowerCase()} and ${right.toLowerCase()}`;
  if (value <= 80) return `${value}/100 meaning fairly ${right.toLowerCase()}`;
  return `${value}/100 meaning very ${right.toLowerCase()}`;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeStringArray(value: unknown, max = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => safeString(item))
    .filter(Boolean)
    .slice(0, max);
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
      if (depth === 0) {
        return trimmed.slice(firstBrace, index + 1);
      }
    }
  }

  return null;
}

function parseVoiceTestResponse(raw: string): VoiceTestResult | null {
  const candidate = extractJsonText(raw);
  if (!candidate) return null;

  try {
    const parsed = JSON.parse(candidate) as Partial<VoiceTestResult>;
    if (!parsed || typeof parsed !== "object") return null;

    const brief = parsed.brief ?? ({} as VoiceTestResult["brief"]);
    const copy = parsed.copy ?? ({} as VoiceTestResult["copy"]);

    return {
      brief: {
        campaignGoal: safeString(brief.campaignGoal),
        targetSegment: safeString(brief.targetSegment),
        strategyRationale: safeString(brief.strategyRationale),
        subjectLines: safeStringArray(brief.subjectLines, 3),
        messagingPoints: safeStringArray(brief.messagingPoints, 6),
        recommendedCTA: safeString(brief.recommendedCTA),
        expectedEmotion: safeString(brief.expectedEmotion),
      },
      copy: {
        subjectLine: safeString(copy.subjectLine),
        previewText: safeString(copy.previewText),
        emailBody: safeString(copy.emailBody),
        ctaText: safeString(copy.ctaText),
        signOff: safeString(copy.signOff),
      },
    };
  } catch {
    return null;
  }
}

function withFallbacks(result: VoiceTestResult): VoiceTestResult {
  return {
    brief: {
      campaignGoal: result.brief.campaignGoal || "Drive incremental retention revenue for this campaign scenario.",
      targetSegment: result.brief.targetSegment || "Most relevant segment based on the selected scenario.",
      strategyRationale: result.brief.strategyRationale || "Align the message to brand voice while matching customer intent.",
      subjectLines:
        result.brief.subjectLines.length >= 3
          ? result.brief.subjectLines.slice(0, 3)
          : [
              ...result.brief.subjectLines,
              ...Array.from({ length: Math.max(0, 3 - result.brief.subjectLines.length) }).map(
                (_, idx) => `Subject option ${idx + result.brief.subjectLines.length + 1}`,
              ),
            ],
      messagingPoints:
        result.brief.messagingPoints.length >= 3
          ? result.brief.messagingPoints
          : [...result.brief.messagingPoints, "Reinforce value clearly.", "Use concise, on-brand language."],
      recommendedCTA: result.brief.recommendedCTA || "Shop now",
      expectedEmotion: result.brief.expectedEmotion || "Confidence and excitement",
    },
    copy: {
      subjectLine: result.copy.subjectLine || result.brief.subjectLines[0] || "A message tailored for your audience",
      previewText: result.copy.previewText || "Built from your brand voice and customer context.",
      emailBody: result.copy.emailBody || "Hi there,\n\nHere is a draft generated from your brand profile data.\n\nBest,",
      ctaText: result.copy.ctaText || result.brief.recommendedCTA || "Shop now",
      signOff: result.copy.signOff || "Best regards,",
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = payloadSchema.parse(body);

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

    const doRuleLines = doRules.length
      ? doRules.map((rule) => `- [${rule.priority}] ${rule.rule}`)
      : ["- None"];
    const dontRuleLines = dontRules.length
      ? dontRules.map((rule) => `- [${rule.priority}] ${rule.rule}`)
      : ["- None"];
    const ctaLines = ctas.length ? ctas.map((cta) => `- ${cta.text}`) : ["- None"];
    const preferredPhraseLines = preferredPhrases.length
      ? preferredPhrases.map((phrase) => `- ${phrase.phrase}`)
      : ["- None"];
    const bannedPhraseLines = bannedPhrases.length
      ? bannedPhrases.map((phrase) => `- ${phrase.phrase}`)
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
${doRuleLines.join("\n")}

DON'T RULES
${dontRuleLines.join("\n")}

PREFERRED CTAS
${ctaLines.join("\n")}

PREFERRED PHRASES
${preferredPhraseLines.join("\n")}

BANNED PHRASES
${bannedPhraseLines.join("\n")}

EMAIL PREFERENCES
- Greeting style: ${profile.greetingStyle ?? "friendly"}
- Sign-off style: ${profile.signOffStyle ?? "warm"}
- Emoji usage: ${profile.emojiUsage ?? "sparingly"}
- Preferred length: ${profile.preferredLength ?? "medium"}
- Discount philosophy: ${profile.discountPhilosophy ?? "strategically"}`;

    const userPrompt = `Scenario: ${input.scenario}
Additional context: ${input.context?.trim() || "None provided"}

Generate two sections:

SECTION 1 - EMAIL BRIEF (Strategy)
- Campaign goal (1 sentence)
- Target segment description
- Strategy rationale (why this approach for this scenario)
- 3 subject line options
- Key messaging points (3-5 bullets)
- Recommended CTA
- Expected emotional response from reader

SECTION 2 - EMAIL COPY (Execution)
- Subject line (pick the best from the brief)
- Preview text (40-90 characters)
- Full email body (must follow all brand constraints and preferences)
- CTA button text
- Sign-off

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

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured." },
        { status: 500 },
      );
    }

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
      return NextResponse.json(
        {
          error: "Failed to parse model JSON response.",
          raw,
        },
        { status: 502 },
      );
    }

    const result = withFallbacks(parsed);

    return NextResponse.json({
      ...result,
      brandDataUsed: {
        profileFieldsUsed: [
          "brandName",
          "tagline",
          "industry",
          "niche",
          "brandStory",
          "usp",
          "missionStatement",
          "websiteUrl",
          "targetDemographics",
          "targetPsychographics",
          "audiencePainPoints",
          "audienceDesires",
          "voiceDescription",
          "greetingStyle",
          "signOffStyle",
          "emojiUsage",
          "preferredLength",
          "discountPhilosophy",
        ],
        presetVoiceDimensions: VOICE_DIMENSIONS.map((item) => `${item.left}<->${item.right}`),
        customVoiceDimensions: customVoiceDimensions.map(
          (item) => `${item.leftLabel}<->${item.rightLabel} (${item.value}/100)`,
        ),
        doRules: doRules.map((rule) => `[${rule.priority}] ${rule.rule}`),
        dontRules: dontRules.map((rule) => `[${rule.priority}] ${rule.rule}`),
        preferredCTAs: ctas.map((item) => item.text),
        preferredPhrases: preferredPhrases.map((item) => item.phrase),
        bannedPhrases: bannedPhrases.map((item) => item.phrase),
      },
      source: "groq",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to run voice test",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
