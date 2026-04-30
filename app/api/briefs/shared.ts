import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const MAX_BRIEF_LIMIT = 100;
const DEFAULT_BRIEF_LIMIT = 50;

const generateBriefSchema = z
  .object({
    planItemId: z.string().trim().min(1).max(200).optional().nullable(),
    title: z.string().trim().max(240).optional().nullable(),
    campaignType: z.string().trim().max(120).optional().nullable(),
    segment: z.string().trim().max(160).optional().nullable(),
    goal: z.string().trim().max(500).optional().nullable(),
    subjectLineAngle: z.string().trim().max(240).optional().nullable(),
    primaryProduct: z.string().trim().max(240).optional().nullable(),
    angle: z.string().trim().max(1200).optional().nullable(),
    cta: z.string().trim().max(120).optional().nullable(),
    designNotes: z.string().trim().max(3000).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const stringArraySchema = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(8)
  .transform((items) => items.map((item) => item.trim()));

const briefPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    campaignType: z.string().trim().min(1).max(120).optional(),
    segment: z.string().trim().min(1).max(160).optional(),
    goal: z.string().trim().min(1).max(500).optional(),
    subjectLines: stringArraySchema.optional(),
    previewTexts: stringArraySchema.optional(),
    angle: z.string().trim().min(1).max(1200).optional(),
    primaryProduct: z.string().trim().max(240).nullable().optional(),
    status: z.string().trim().min(1).max(80).optional(),
    designNotes: z.string().trim().max(3000).nullable().optional(),
    cta: z.string().trim().max(120).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const sectionPatchSchema = z
  .object({
    type: z.string().trim().min(1).max(80).optional(),
    heading: z.string().trim().max(200).nullable().optional(),
    body: z.string().trim().min(1).max(6000).optional(),
    sortOrder: z.unknown().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type BriefGeneratePayload = {
  planItemId: string | null;
  title: string | null;
  campaignType: string | null;
  segment: string | null;
  goal: string | null;
  subjectLineAngle: string | null;
  primaryProduct: string | null;
  angle: string | null;
  cta: string | null;
  designNotes: string | null;
  metadata: Record<string, unknown> | null;
};

type PlanItemSource = {
  id: string;
  title: string;
  campaignType: string;
  goal: string;
  segment: string;
  subjectLineAngle: string | null;
  primaryProduct: string | null;
  why: string;
  confidenceScore: number | null;
  metadata: Prisma.JsonValue | null;
};

type BrandContext = {
  brandName: string | null;
  tagline: string | null;
  usp: string | null;
  voiceDescription: string | null;
  preferredLength: string | null;
  discountPhilosophy: string | null;
  rules: string[];
};

type MemoryContext = {
  totalCampaigns: number;
  bestCampaignType: string | null;
  bestSegment: string | null;
  recentLesson: string | null;
};

type BriefContext = {
  brand: BrandContext;
  memory: MemoryContext;
};

type BriefSource = {
  planItemId: string | null;
  title: string;
  campaignType: string;
  segment: string;
  goal: string;
  subjectLineAngle: string | null;
  primaryProduct: string | null;
  why: string | null;
  confidenceScore: number | null;
  angleOverride: string | null;
  ctaOverride: string | null;
  designNotesOverride: string | null;
  metadata: Record<string, unknown> | null;
};

type GeneratedBriefSection = {
  type: string;
  heading: string | null;
  body: string;
  sortOrder: number;
  metadata?: Record<string, unknown>;
};

type GeneratedBrief = {
  planItemId: string | null;
  title: string;
  campaignType: string;
  segment: string;
  goal: string;
  subjectLines: string[];
  previewTexts: string[];
  angle: string;
  primaryProduct: string | null;
  status: string;
  designNotes: string;
  cta: string;
  metadata: Record<string, unknown>;
  sections: GeneratedBriefSection[];
};

function cleanString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanOptionalText(value: string | null | undefined) {
  if (value === null) return null;
  return cleanString(value);
}

function hasOwn(input: object, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function issueMessages(error: z.ZodError) {
  return error.issues.map((issue) => {
    const field = issue.path.join(".");
    return field ? `${field}: ${issue.message}` : issue.message;
  });
}

async function withBriefFallback<T>(query: PromiseLike<T>, fallback: T, label: string): Promise<T> {
  try {
    return await query;
  } catch {
    console.warn(`Brief context fallback used for ${label}`);
    return fallback;
  }
}

function collectRuleText(input: unknown, output: string[]) {
  if (!input) return;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed) output.push(trimmed);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectRuleText(item, output);
    return;
  }
  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (typeof record.rule === "string") collectRuleText(record.rule, output);
    if (typeof record.text === "string") collectRuleText(record.text, output);
  }
}

export function validateGenerateBriefPayload(input: unknown):
  | { ok: true; data: BriefGeneratePayload }
  | { ok: false; issues: string[] } {
  const parsed = generateBriefSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: issueMessages(parsed.error) };
  }

  const payload = parsed.data;
  const planItemId = cleanString(payload.planItemId);
  const title = cleanString(payload.title);
  const campaignType = cleanString(payload.campaignType);
  const segment = cleanString(payload.segment);
  const goal = cleanString(payload.goal);
  const issues: string[] = [];

  if (!planItemId) {
    if (!title) issues.push("title is required when planItemId is not provided.");
    if (!campaignType) issues.push("campaignType is required when planItemId is not provided.");
    if (!segment) issues.push("segment is required when planItemId is not provided.");
    if (!goal) issues.push("goal is required when planItemId is not provided.");
  }

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    data: {
      planItemId,
      title,
      campaignType,
      segment,
      goal,
      subjectLineAngle: cleanString(payload.subjectLineAngle),
      primaryProduct: cleanString(payload.primaryProduct),
      angle: cleanString(payload.angle),
      cta: cleanString(payload.cta),
      designNotes: cleanString(payload.designNotes),
      metadata: payload.metadata ?? null,
    },
  };
}

export function validateBriefPatchPayload(input: unknown):
  | { ok: true; data: Prisma.CampaignBriefUpdateInput }
  | { ok: false; issues: string[] } {
  const parsed = briefPatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: issueMessages(parsed.error) };
  }

  const payload = parsed.data;
  const data: Prisma.CampaignBriefUpdateInput = {};

  if (hasOwn(payload, "title")) data.title = payload.title;
  if (hasOwn(payload, "campaignType")) data.campaignType = payload.campaignType;
  if (hasOwn(payload, "segment")) data.segment = payload.segment;
  if (hasOwn(payload, "goal")) data.goal = payload.goal;
  if (hasOwn(payload, "subjectLines")) data.subjectLines = payload.subjectLines as Prisma.InputJsonValue;
  if (hasOwn(payload, "previewTexts")) data.previewTexts = payload.previewTexts as Prisma.InputJsonValue;
  if (hasOwn(payload, "angle")) data.angle = payload.angle;
  if (hasOwn(payload, "primaryProduct")) data.primaryProduct = cleanOptionalText(payload.primaryProduct);
  if (hasOwn(payload, "status")) data.status = payload.status;
  if (hasOwn(payload, "designNotes")) data.designNotes = cleanOptionalText(payload.designNotes);
  if (hasOwn(payload, "cta")) data.cta = cleanOptionalText(payload.cta);
  if (hasOwn(payload, "metadata")) data.metadata = payload.metadata as Prisma.InputJsonValue;

  if (!Object.keys(data).length) {
    return { ok: false, issues: ["At least one brief field must be provided."] };
  }

  return { ok: true, data };
}

export function validateBriefSectionPatchPayload(input: unknown):
  | { ok: true; data: Prisma.CampaignBriefSectionUpdateInput }
  | { ok: false; issues: string[] } {
  const parsed = sectionPatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: issueMessages(parsed.error) };
  }

  const payload = parsed.data;
  const data: Prisma.CampaignBriefSectionUpdateInput = {};

  if (hasOwn(payload, "type")) data.type = payload.type;
  if (hasOwn(payload, "heading")) data.heading = cleanOptionalText(payload.heading);
  if (hasOwn(payload, "body")) data.body = payload.body;
  if (hasOwn(payload, "sortOrder")) {
    const parsedSortOrder = Number(payload.sortOrder);
    if (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0) {
      return { ok: false, issues: ["sortOrder must be a non-negative whole number."] };
    }
    data.sortOrder = parsedSortOrder;
  }
  if (hasOwn(payload, "metadata")) data.metadata = payload.metadata as Prisma.InputJsonValue;

  if (!Object.keys(data).length) {
    return { ok: false, issues: ["At least one section field must be provided."] };
  }

  return { ok: true, data };
}

function topMemoryBy<T extends { revenue: number }>(items: T[]) {
  return items.reduce<T | null>((best, item) => (!best || item.revenue > best.revenue ? item : best), null);
}

function groupMemory(memories: Array<{ campaignType: string | null; segment: string | null; revenue: number }>, key: "campaignType" | "segment") {
  const groups = new Map<string, { key: string; revenue: number }>();
  for (const memory of memories) {
    const groupKey = memory[key] || "unknown";
    const current = groups.get(groupKey) ?? { key: groupKey, revenue: 0 };
    current.revenue += memory.revenue;
    groups.set(groupKey, current);
  }
  return topMemoryBy(Array.from(groups.values()))?.key ?? null;
}

export async function loadBriefContext(): Promise<BriefContext> {
  const [brandProfile, brandRules, dosAndDonts, memories] = await Promise.all([
    withBriefFallback(
      prisma.brandProfile.findFirst({
        orderBy: { createdAt: "asc" },
        select: {
          brandName: true,
          tagline: true,
          usp: true,
          voiceDescription: true,
          preferredLength: true,
          discountPhilosophy: true,
        },
      }),
      null,
      "brand profile",
    ),
    withBriefFallback(
      prisma.brandRule.findMany({
        orderBy: { createdAt: "desc" },
        select: { rule: true },
        take: 25,
      }) as unknown as Promise<Array<{ rule: string }>>,
      [],
      "brand rules",
    ),
    withBriefFallback(
      prisma.dosAndDonts.findFirst({
        orderBy: { updatedAt: "desc" },
      }),
      null,
      "Brain dos and donts",
    ),
    withBriefFallback(
      prisma.campaignMemory.findMany({
        orderBy: { sentAt: "desc" },
        select: {
          campaignType: true,
          segment: true,
          revenue: true,
          notes: true,
          winningInsight: true,
        },
        take: 100,
      }),
      [],
      "campaign memory",
    ),
  ]);

  const rules = brandRules.map((rule) => rule.rule.trim()).filter(Boolean);
  if (dosAndDonts) {
    collectRuleText(dosAndDonts.messagingDos, rules);
    collectRuleText(dosAndDonts.languageDos, rules);
    collectRuleText(dosAndDonts.messagingDonts, rules);
    collectRuleText(dosAndDonts.languageDonts, rules);
    collectRuleText(dosAndDonts.toneDonts, rules);
    collectRuleText(dosAndDonts.cautionRules, rules);
  }

  return {
    brand: {
      brandName: brandProfile?.brandName ?? null,
      tagline: brandProfile?.tagline ?? null,
      usp: brandProfile?.usp ?? null,
      voiceDescription: brandProfile?.voiceDescription ?? null,
      preferredLength: brandProfile?.preferredLength ?? null,
      discountPhilosophy: brandProfile?.discountPhilosophy ?? null,
      rules: Array.from(new Set(rules)).slice(0, 20),
    },
    memory: {
      totalCampaigns: memories.length,
      bestCampaignType: groupMemory(memories, "campaignType"),
      bestSegment: groupMemory(memories, "segment"),
      recentLesson:
        memories.find((memory) => memory.winningInsight || memory.notes)?.winningInsight ??
        memories.find((memory) => memory.winningInsight || memory.notes)?.notes ??
        null,
    },
  };
}

export function buildBriefSource(
  payload: BriefGeneratePayload,
  planItem: PlanItemSource | null,
): BriefSource {
  return {
    planItemId: payload.planItemId,
    title: payload.title ?? planItem?.title ?? "Campaign brief",
    campaignType: payload.campaignType ?? planItem?.campaignType ?? "Email campaign",
    segment: payload.segment ?? planItem?.segment ?? "all",
    goal: payload.goal ?? planItem?.goal ?? "Drive retention revenue with a useful, brand-safe email.",
    subjectLineAngle: payload.subjectLineAngle ?? planItem?.subjectLineAngle ?? null,
    primaryProduct: payload.primaryProduct ?? planItem?.primaryProduct ?? null,
    why: planItem?.why ?? null,
    confidenceScore: planItem?.confidenceScore ?? null,
    angleOverride: payload.angle,
    ctaOverride: payload.cta,
    designNotesOverride: payload.designNotes,
    metadata: payload.metadata,
  };
}

function sentenceCase(value: string) {
  const cleaned = value.replace(/[_-]+/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Campaign";
}

function compactSegment(segment: string) {
  if (segment === "all") return "your customers";
  return sentenceCase(segment).toLowerCase();
}

function productPhrase(product: string | null) {
  return product ? product : "the featured offer";
}

function defaultCta(campaignType: string) {
  const normalized = campaignType.toLowerCase();
  if (normalized.includes("vip") || normalized.includes("early")) return "Get early access";
  if (normalized.includes("winback") || normalized.includes("risk")) return "See what is new";
  if (normalized.includes("replen")) return "Restock now";
  if (normalized.includes("education")) return "Learn more";
  if (normalized.includes("cross")) return "Find your next favorite";
  return "Shop now";
}

function buildSubjectLines(source: BriefSource, context: BriefContext) {
  const product = productPhrase(source.primaryProduct);
  const brand = context.brand.brandName;
  const angle = source.subjectLineAngle;
  const subjectLines = [
    angle ?? `${sentenceCase(source.campaignType)} for ${compactSegment(source.segment)}`,
    source.primaryProduct ? `Why customers keep choosing ${product}` : `A note for ${compactSegment(source.segment)}`,
    brand ? `${brand}: ${source.title}` : source.title,
  ];

  return Array.from(new Set(subjectLines.map((line) => line.trim()).filter(Boolean))).slice(0, 4);
}

function buildPreviewTexts(source: BriefSource, context: BriefContext) {
  const product = productPhrase(source.primaryProduct);
  const previews = [
    source.goal,
    source.primaryProduct
      ? `A focused story around ${product}, built for ${compactSegment(source.segment)}.`
      : `A focused message built for ${compactSegment(source.segment)}.`,
    context.memory.recentLesson ? `Built with recent Campaign Memory lessons in mind.` : null,
  ];

  return previews.filter((preview): preview is string => Boolean(preview)).slice(0, 3);
}

function buildAngle(source: BriefSource, context: BriefContext) {
  if (source.angleOverride) return source.angleOverride;

  const product = productPhrase(source.primaryProduct);
  const memoryLine =
    context.memory.bestCampaignType &&
    context.memory.bestCampaignType.toLowerCase() === source.campaignType.toLowerCase()
      ? "Campaign Memory suggests this campaign type has performed well before."
      : context.memory.recentLesson
        ? `Campaign Memory lesson to keep in mind: ${context.memory.recentLesson}`
        : "Use this send as a clean learning moment for future planning.";

  return `${source.title} should frame ${product} through the lens of ${source.goal.toLowerCase()} ${memoryLine}`;
}

function buildDesignNotes(source: BriefSource, context: BriefContext) {
  if (source.designNotesOverride) return source.designNotesOverride;
  const notes = [
    "Keep the layout scannable: strong hero, short body sections, one clear CTA, and mobile-first spacing.",
    source.primaryProduct ? `Make ${source.primaryProduct} visually identifiable near the top of the email.` : "",
    context.brand.rules.length ? "Respect the active Brain rules and avoid off-brand claims or phrasing." : "",
  ];
  return notes.filter(Boolean).join(" ");
}

function buildSections(source: BriefSource, context: BriefContext, cta: string, designNotes: string) {
  const product = productPhrase(source.primaryProduct);
  const proof =
    context.memory.recentLesson ??
    (context.memory.bestSegment
      ? `Campaign Memory currently has useful signal for ${context.memory.bestSegment}.`
      : "Use customer benefit proof, product specifics, and light social proof.");
  const brandLine = context.brand.usp ?? context.brand.tagline ?? context.brand.voiceDescription;
  const whyLine = source.why ? `Planner rationale: ${source.why}` : "Planner rationale: manual brief input.";

  return [
    {
      type: "hero",
      heading: source.title,
      body: `Lead with a clear promise for ${compactSegment(source.segment)}. Tie the opening message directly to ${source.goal.toLowerCase()}`,
      sortOrder: 10,
      metadata: { role: "above_the_fold" },
    },
    {
      type: "intro_story",
      heading: "Why this matters now",
      body: `${whyLine} Keep the story simple, specific, and grounded in the audience need rather than a generic promotion.`,
      sortOrder: 20,
      metadata: { source: source.planItemId ? "planner" : "manual" },
    },
    {
      type: "product_callout",
      heading: source.primaryProduct ? source.primaryProduct : "Featured focus",
      body: source.primaryProduct
        ? `Position ${product} as the natural next step. Mention the most relevant benefit, who it is for, and why it earns attention now.`
        : `Use this block for the main product, collection, story, or offer once creative has the final asset direction.`,
      sortOrder: 30,
      metadata: { primaryProduct: source.primaryProduct },
    },
    {
      type: "education_proof",
      heading: "Education and proof",
      body: `${brandLine ? `${brandLine} ` : ""}${proof} Give the reader one useful takeaway and one reason to trust the recommendation.`,
      sortOrder: 40,
      metadata: { memoryCampaigns: context.memory.totalCampaigns },
    },
    {
      type: "cta",
      heading: cta,
      body: `Use one primary CTA: "${cta}". Keep secondary links minimal so clicks concentrate around the campaign goal.`,
      sortOrder: 50,
      metadata: { cta },
    },
    {
      type: "design_notes",
      heading: "Design notes",
      body: designNotes,
      sortOrder: 60,
      metadata: { preferredLength: context.brand.preferredLength },
    },
  ];
}

export function generateBriefArtifact(source: BriefSource, context: BriefContext): GeneratedBrief {
  const cta = source.ctaOverride ?? defaultCta(source.campaignType);
  const designNotes = buildDesignNotes(source, context);
  const subjectLines = buildSubjectLines(source, context);
  const previewTexts = buildPreviewTexts(source, context);
  const angle = buildAngle(source, context);

  return {
    planItemId: source.planItemId,
    title: source.title,
    campaignType: source.campaignType,
    segment: source.segment,
    goal: source.goal,
    subjectLines,
    previewTexts,
    angle,
    primaryProduct: source.primaryProduct,
    status: "draft",
    designNotes,
    cta,
    metadata: {
      generatedBy: "brief-generator-v0",
      source: source.planItemId ? "plan_item" : "manual",
      planItemId: source.planItemId,
      confidenceScore: source.confidenceScore,
      inputMetadata: source.metadata,
      context: {
        brandName: context.brand.brandName,
        brainRuleCount: context.brand.rules.length,
        memoryCampaigns: context.memory.totalCampaigns,
        bestMemoryCampaignType: context.memory.bestCampaignType,
        bestMemorySegment: context.memory.bestSegment,
      },
    },
    sections: buildSections(source, context, cta, designNotes),
  };
}

function asStringArray(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function serializeBriefSection(section: {
  id: string;
  briefId: string;
  type: string;
  heading: string | null;
  body: string;
  sortOrder: number;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: section.id,
    briefId: section.briefId,
    type: section.type,
    heading: section.heading,
    body: section.body,
    sortOrder: section.sortOrder,
    metadata: section.metadata,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
  };
}

export function serializeBrief(brief: {
  id: string;
  planItemId: string | null;
  title: string;
  campaignType: string;
  segment: string;
  goal: string;
  subjectLines: Prisma.JsonValue;
  previewTexts: Prisma.JsonValue;
  angle: string;
  primaryProduct: string | null;
  status: string;
  designNotes: string | null;
  cta: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  sections: Array<Parameters<typeof serializeBriefSection>[0]>;
}) {
  return {
    id: brief.id,
    planItemId: brief.planItemId,
    title: brief.title,
    campaignType: brief.campaignType,
    segment: brief.segment,
    goal: brief.goal,
    subjectLines: asStringArray(brief.subjectLines),
    previewTexts: asStringArray(brief.previewTexts),
    angle: brief.angle,
    primaryProduct: brief.primaryProduct,
    status: brief.status,
    designNotes: brief.designNotes,
    cta: brief.cta,
    metadata: brief.metadata,
    createdAt: brief.createdAt.toISOString(),
    updatedAt: brief.updatedAt.toISOString(),
    sectionCount: brief.sections.length,
    sections: brief.sections.map(serializeBriefSection),
  };
}

export function serializeBriefSummary(brief: {
  id: string;
  planItemId: string | null;
  title: string;
  campaignType: string;
  segment: string;
  goal: string;
  subjectLines: Prisma.JsonValue;
  previewTexts: Prisma.JsonValue;
  angle: string;
  primaryProduct: string | null;
  status: string;
  designNotes: string | null;
  cta: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { sections: number };
}) {
  return {
    id: brief.id,
    planItemId: brief.planItemId,
    title: brief.title,
    campaignType: brief.campaignType,
    segment: brief.segment,
    goal: brief.goal,
    subjectLines: asStringArray(brief.subjectLines),
    previewTexts: asStringArray(brief.previewTexts),
    angle: brief.angle,
    primaryProduct: brief.primaryProduct,
    status: brief.status,
    designNotes: brief.designNotes,
    cta: brief.cta,
    metadata: brief.metadata,
    createdAt: brief.createdAt.toISOString(),
    updatedAt: brief.updatedAt.toISOString(),
    sectionCount: brief._count.sections,
  };
}

export function parseBriefLimit(value: string | null) {
  if (!value) return { ok: true as const, limit: DEFAULT_BRIEF_LIMIT };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { ok: false as const, error: "limit must be a positive whole number." };
  }
  return { ok: true as const, limit: Math.min(MAX_BRIEF_LIMIT, parsed) };
}

export function cleanQueryValue(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}
