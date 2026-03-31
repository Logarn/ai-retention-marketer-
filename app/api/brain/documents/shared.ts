import type { BrandDocument, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type RuleItem = {
  id: string;
  rule: string;
  explanation?: string | null;
  source?: string | null;
  priority: number;
};

const DEFAULT_RULE_CATEGORIES = {
  messagingDos: [] as RuleItem[],
  languageDos: [] as RuleItem[],
  complianceDos: [] as RuleItem[],
  designDos: [] as RuleItem[],
  timingDos: [] as RuleItem[],
  messagingDonts: [] as RuleItem[],
  languageDonts: [] as RuleItem[],
  complianceDonts: [] as RuleItem[],
  designDonts: [] as RuleItem[],
  toneDonts: [] as RuleItem[],
  cautionRules: [] as RuleItem[],
};

export async function ensureBrandProfileId() {
  const existing = await prisma.brandProfile.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.brandProfile.create({
    data: {
      brandName: "Your Brand",
      industryVertical: "skincare",
      pricePositioning: "premium",
      coreValues: ["quality", "customer-first"],
    },
    select: { id: true },
  });
  return created.id;
}

export function inferDocumentType(fileName: string, fileType?: string | null) {
  const lower = fileName.toLowerCase();
  const mime = (fileType ?? "").toLowerCase();
  if (lower.includes("brand") || lower.includes("style") || lower.includes("voice")) {
    return "brand-guidelines";
  }
  if (lower.includes("legal") || lower.includes("compliance") || lower.includes("policy")) {
    return "legal";
  }
  if (lower.includes("product") || lower.includes("catalog")) {
    return "product-info";
  }
  if (lower.includes("competitor")) {
    return "competitor-analysis";
  }
  if (mime.includes("pdf")) return "pdf-upload";
  if (mime.includes("word") || mime.includes("docx")) return "doc-upload";
  return "general";
}

function toRuleArray(items: string[]): RuleItem[] {
  return items.map((rule, index) => ({
    id: `doc-rule-${Date.now().toString(36)}-${index}`,
    rule,
    explanation: null,
    source: "document-extraction",
    priority: 2,
  }));
}

function parseRuleLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length > 3);
}

export function buildStubExtraction(fileName: string, extractedText: string) {
  const lines = parseRuleLines(extractedText).slice(0, 24);
  const dos = lines.filter((line) => /\b(always|must|do|use|include)\b/i.test(line)).slice(0, 10);
  const donts = lines.filter((line) => /\b(never|don't|do not|avoid|ban)\b/i.test(line)).slice(0, 10);

  const extractedRules = {
    summary: `Stub extraction from ${fileName}. Replace with LLM/OCR pipeline in next phase.`,
    source: "stub",
    counts: {
      totalLines: lines.length,
      dos: dos.length,
      donts: donts.length,
    },
    rules: {
      suggestedDos: dos,
      suggestedDonts: donts,
    },
  };

  const conflictsFound = (() => {
    const conflictCandidates = [...dos, ...donts]
      .filter((line) => /exclamation|emoji|discount|urgency|caps/i.test(line))
      .slice(0, 5);
    return conflictCandidates.length
      ? {
          summary: "Potential style or promotional conflicts detected.",
          items: conflictCandidates,
        }
      : null;
  })();

  return { extractedRules, conflictsFound };
}

export async function ensureRulesRecord(brandProfileId: string) {
  const existing = await prisma.dosAndDonts.findUnique({
    where: { brandProfileId },
  });
  if (existing) return existing;
  return prisma.dosAndDonts.create({
    data: {
      brandProfileId,
      ...DEFAULT_RULE_CATEGORIES,
    },
  });
}

function normalizeRuleArray(input: unknown): RuleItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Partial<RuleItem>;
      const rule = String(raw.rule ?? "").trim();
      if (!rule) return null;
      const priorityNum = Number(raw.priority ?? 2);
      const priority = Number.isFinite(priorityNum) ? Math.min(3, Math.max(1, Math.round(priorityNum))) : 2;
      return {
        id: raw.id?.trim() || `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        rule,
        explanation: raw.explanation?.trim() || null,
        source: raw.source?.trim() || "document",
        priority,
      };
    })
    .filter(Boolean) as RuleItem[];
}

export async function applyExtractedRulesToBrand(input: {
  brandProfileId: string;
  extractedRules: Prisma.JsonValue | null;
}) {
  const rulesRecord = await ensureRulesRecord(input.brandProfileId);
  const payload = (input.extractedRules || {}) as {
    rules?: { suggestedDos?: string[]; suggestedDonts?: string[] };
  };
  const suggestedDos = Array.isArray(payload.rules?.suggestedDos) ? payload.rules!.suggestedDos : [];
  const suggestedDonts = Array.isArray(payload.rules?.suggestedDonts) ? payload.rules!.suggestedDonts : [];

  const existingMessagingDos = normalizeRuleArray(rulesRecord.messagingDos);
  const existingMessagingDonts = normalizeRuleArray(rulesRecord.messagingDonts);

  const newDos = toRuleArray(suggestedDos).filter(
    (candidate) => !existingMessagingDos.some((existing) => existing.rule.toLowerCase() === candidate.rule.toLowerCase()),
  );
  const newDonts = toRuleArray(suggestedDonts).filter(
    (candidate) => !existingMessagingDonts.some((existing) => existing.rule.toLowerCase() === candidate.rule.toLowerCase()),
  );

  const updated = await prisma.dosAndDonts.update({
    where: { id: rulesRecord.id },
    data: {
      messagingDos: [...existingMessagingDos, ...newDos],
      messagingDonts: [...existingMessagingDonts, ...newDonts],
    },
  });

  return {
    appliedDos: newDos.length,
    appliedDonts: newDonts.length,
    rulesId: updated.id,
  };
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

export function mapDocumentResponse(doc: BrandDocument) {
  return {
    id: doc.id,
    brandProfileId: doc.brandProfileId,
    fileName: doc.fileName,
    fileType: doc.fileType,
    fileUrl: doc.fileUrl,
    fileSize: doc.fileSize,
    documentType: doc.documentType,
    extractionStatus: doc.extractionStatus,
    extractedText: doc.extractedText,
    extractedRules: doc.extractedRules,
    extractedAt: toIso(doc.extractedAt),
    appliedToBrand: doc.appliedToBrand,
    conflictsFound: doc.conflictsFound,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

// Alias for upload route readability.
export const normalizeDocumentResponse = mapDocumentResponse;
// Alias for apply route readability.
export const mapDocument = mapDocumentResponse;

