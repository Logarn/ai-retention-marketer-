import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBrandProfileId, mapDocument } from "@/app/api/brain/documents/shared";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const resolved = await context.params;
    const id = resolved.id;
    const brandProfileId = await ensureBrandProfileId();

    const existing = await prisma.brandDocument.findFirst({
      where: { id, brandProfileId },
    });
    if (!existing) {
      return NextResponse.json(
        {
          error: "Document not found",
          id,
        },
        { status: 404 },
      );
    }

    if (existing.extractionStatus !== "complete") {
      return NextResponse.json(
        {
          error: "Document extraction is not complete yet",
          extractionStatus: existing.extractionStatus,
        },
        { status: 409 },
      );
    }

    const updated = await prisma.brandDocument.update({
      where: { id: existing.id },
      data: {
        appliedToBrand: true,
      },
    });

    return NextResponse.json({
      ok: true,
      document: mapDocument(updated),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to apply document extraction",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
