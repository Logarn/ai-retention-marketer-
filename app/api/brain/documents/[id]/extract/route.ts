import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type ParamsContext = {
  params: Promise<{ id: string }> | { id: string };
};

function inferDocumentType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.includes("brand") || lower.includes("voice") || lower.includes("style")) {
    return "brand-guidelines";
  }
  if (lower.includes("legal") || lower.includes("compliance")) {
    return "legal";
  }
  if (lower.includes("campaign") || lower.includes("brief")) {
    return "campaign-brief";
  }
  if (lower.includes("product")) {
    return "product-info";
  }
  return "general";
}

export async function POST(_request: Request, context: ParamsContext) {
  try {
    const resolved = await context.params;
    const id = resolved.id;

    const doc = await prisma.brandDocument.findUnique({ where: { id } });
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const extractedRules = {
      source: doc.fileName,
      extractedAt: new Date().toISOString(),
      rules: [
        {
          category: "messagingDos",
          rule: "Always lead with one clear value proposition in the first section.",
          explanation: "Auto-extracted placeholder rule. Replace with parser output.",
          priority: 2,
        },
        {
          category: "languageDonts",
          rule: "Avoid vague superlatives without proof.",
          explanation: "Auto-extracted placeholder rule. Replace with parser output.",
          priority: 2,
        },
      ],
    };

    const extractedText = `Placeholder extraction for ${doc.fileName}.`;

    const updated = await prisma.brandDocument.update({
      where: { id },
      data: {
        extractionStatus: "complete",
        extractedAt: new Date(),
        documentType: doc.documentType ?? inferDocumentType(doc.fileName),
        extractedText,
        extractedRules,
        conflictsFound: [],
      },
    });

    return NextResponse.json({
      ok: true,
      document: updated,
      note: "Extraction currently uses a scaffold placeholder. Integrate OCR/parser next.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to extract document intelligence",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
