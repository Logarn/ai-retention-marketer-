import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBrandProfileId, mapDocumentResponse } from "@/app/api/brain/documents/shared";

export async function GET() {
  try {
    const brandProfileId = await ensureBrandProfileId();
    const documents = await prisma.brandDocument.findMany({
      where: { brandProfileId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      documents: documents.map(mapDocumentResponse),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load brand documents",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    await prisma.brandDocument.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to delete document",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
