import { Prisma } from "@prisma/client";
import { z } from "zod";

export const MAX_MEMORY_LIMIT = 100;
export const DEFAULT_MEMORY_LIMIT = 50;

const memoryPayloadSchema = z
  .object({
    campaignId: z.string().trim().min(1, "campaignId is required").max(200),
    name: z.string().trim().min(1, "name is required").max(240),
    campaignType: z.string().trim().max(120).optional().nullable(),
    subjectLine: z.string().trim().max(240).optional().nullable(),
    previewText: z.string().trim().max(320).optional().nullable(),
    segment: z.string().trim().max(160).optional().nullable(),
    sentAt: z.string().trim().min(1, "sentAt is required"),
    openRate: z.unknown().optional(),
    clickRate: z.unknown().optional(),
    conversionRate: z.unknown().optional(),
    audienceSize: z.unknown().optional(),
    orders: z.unknown().optional(),
    revenue: z.unknown().optional(),
    revenuePerRecipient: z.unknown().optional(),
    notes: z.string().trim().max(5000).optional().nullable(),
    winningInsight: z.string().trim().max(1200).optional().nullable(),
    source: z.string().trim().max(80).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .passthrough();

export type MemoryValidationResult =
  | { ok: true; data: Prisma.CampaignMemoryCreateInput }
  | { ok: false; issues: string[] };

function optionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseDate(value: string, field: string, issues: string[]) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    issues.push(`${field} must be a valid date string.`);
    return null;
  }
  return parsed;
}

function parseNumberLike(value: unknown, field: string, issues: string[]) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    issues.push(`${field} must be a valid number.`);
    return null;
  }
  return parsed;
}

function parseNonNegativeNumber(value: unknown, field: string, issues: string[]) {
  const parsed = parseNumberLike(value, field, issues);
  if (parsed === null) return null;
  if (parsed < 0) {
    issues.push(`${field} cannot be negative.`);
    return null;
  }
  return parsed;
}

function parseNonNegativeInt(value: unknown, field: string, issues: string[]) {
  const parsed = parseNonNegativeNumber(value, field, issues);
  if (parsed === null) return null;
  if (!Number.isInteger(parsed)) {
    issues.push(`${field} must be a whole number.`);
    return null;
  }
  return parsed;
}

function parseRate(value: unknown, field: string, issues: string[]) {
  const parsed = parseNumberLike(value, field, issues);
  if (parsed === null) return null;
  if (parsed < 0 || parsed > 100) {
    issues.push(`${field} must be between 0 and 1, or between 0 and 100 as a percentage.`);
    return null;
  }
  return parsed > 1 ? parsed / 100 : parsed;
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function roundRate(value: number | null) {
  return value === null ? null : Number(value.toFixed(6));
}

export function validateCampaignMemoryPayload(input: unknown): MemoryValidationResult {
  const parsed = memoryPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const payload = parsed.data;
  const issues: string[] = [];
  const sentAt = parseDate(payload.sentAt, "sentAt", issues);
  const audienceSize = parseNonNegativeInt(payload.audienceSize, "audienceSize", issues);
  const orders = parseNonNegativeInt(payload.orders, "orders", issues);
  const revenue = parseNonNegativeNumber(payload.revenue, "revenue", issues) ?? 0;
  const openRate = roundRate(parseRate(payload.openRate, "openRate", issues));
  const clickRate = roundRate(parseRate(payload.clickRate, "clickRate", issues));
  const providedConversionRate = roundRate(
    parseRate(payload.conversionRate, "conversionRate", issues),
  );
  const conversionRate =
    providedConversionRate ??
    (audienceSize && orders !== null ? roundRate(orders / Math.max(1, audienceSize)) : null);
  const providedRevenuePerRecipient = parseNonNegativeNumber(
    payload.revenuePerRecipient,
    "revenuePerRecipient",
    issues,
  );
  const revenuePerRecipient =
    providedRevenuePerRecipient ??
    (audienceSize ? roundCurrency(revenue / Math.max(1, audienceSize)) : null);

  if (!sentAt || issues.length) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    data: {
      campaignId: payload.campaignId,
      name: payload.name,
      campaignType: optionalString(payload.campaignType),
      subjectLine: optionalString(payload.subjectLine),
      previewText: optionalString(payload.previewText),
      segment: optionalString(payload.segment) ?? "all",
      sentAt,
      audienceSize,
      openRate,
      clickRate,
      conversionRate,
      orders,
      revenue: roundCurrency(revenue),
      revenuePerRecipient,
      notes: optionalString(payload.notes),
      winningInsight: optionalString(payload.winningInsight),
      source: optionalString(payload.source) ?? "manual",
      metadata: payload.metadata ? (payload.metadata as Prisma.InputJsonValue) : undefined,
    },
  };
}

export function serializeCampaignMemory(memory: {
  id: string;
  campaignId: string;
  name: string;
  campaignType: string | null;
  subjectLine: string | null;
  previewText: string | null;
  segment: string | null;
  sentAt: Date;
  audienceSize: number | null;
  openRate: number | null;
  clickRate: number | null;
  conversionRate: number | null;
  orders: number | null;
  revenue: number;
  revenuePerRecipient: number | null;
  notes: string | null;
  winningInsight: string | null;
  source: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: memory.id,
    campaignId: memory.campaignId,
    name: memory.name,
    campaignType: memory.campaignType,
    subjectLine: memory.subjectLine,
    previewText: memory.previewText,
    segment: memory.segment,
    sentAt: memory.sentAt.toISOString(),
    audienceSize: memory.audienceSize,
    openRate: memory.openRate,
    clickRate: memory.clickRate,
    conversionRate: memory.conversionRate,
    orders: memory.orders,
    revenue: memory.revenue,
    revenuePerRecipient: memory.revenuePerRecipient,
    notes: memory.notes,
    winningInsight: memory.winningInsight,
    source: memory.source,
    metadata: memory.metadata,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  };
}

export function parseMemoryLimit(value: string | null) {
  if (!value) return { ok: true as const, limit: DEFAULT_MEMORY_LIMIT };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { ok: false as const, error: "limit must be a positive whole number." };
  }
  return { ok: true as const, limit: Math.min(MAX_MEMORY_LIMIT, parsed) };
}

export function parseOptionalDateParam(value: string | null, field: string) {
  if (!value) return { ok: true as const, date: null };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false as const, error: `${field} must be a valid date string.` };
  }
  return { ok: true as const, date: parsed };
}
