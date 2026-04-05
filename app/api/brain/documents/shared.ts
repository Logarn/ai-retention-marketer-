import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "../profile/store";

export type BrandInsightsPayload = {
  voiceNotes?: string;
  dosFound?: string[];
  dontsFound?: string[];
  ctasFound?: string[];
  phrasesPreferred?: string[];
  phrasesBanned?: string[];
  audienceNotes?: string;
  brandStoryNotes?: string;
  emailGuidelines?: string;
  otherInsights?: string[];
};

export function parseExtractedRulesJson(raw: string | null): BrandInsightsPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BrandInsightsPayload;
  } catch {
    return null;
  }
}

type DocRow = NonNullable<Awaited<ReturnType<typeof prisma.brandDocument.findUnique>>>;

export function mapDocumentToApi(doc: DocRow) {
  let brandInsights: BrandInsightsPayload | null = null;
  if (doc.extractedRules) {
    brandInsights = parseExtractedRulesJson(doc.extractedRules);
  }
  return {
    id: doc.id,
    storeId: doc.storeId,
    fileName: doc.fileName,
    fileType: doc.fileType,
    fileSize: doc.fileSize,
    fileUrl: doc.fileUrl,
    rawTextLength: doc.rawText.length,
    summary: doc.summary,
    extractedRules: doc.extractedRules,
    brandInsights,
    status: doc.status,
    appliedToProfile: doc.appliedToProfile,
    error: doc.error,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listDocumentsForStore(storeId = DEFAULT_STORE_ID) {
  return prisma.brandDocument.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });
}
