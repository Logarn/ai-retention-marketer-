import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "../profile/store";
import { listDocumentsForStore, mapDocumentToApi } from "./shared";

export async function GET() {
  try {
    const documents = await listDocumentsForStore(DEFAULT_STORE_ID);
    const total = documents.length;
    const completed = documents.filter((d) => d.status === "completed").length;
    return NextResponse.json({
      documents: documents.map(mapDocumentToApi),
      stats: {
        totalDocuments: total,
        completedAnalyses: completed,
      },
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

    const deleted = await prisma.brandDocument.deleteMany({
      where: { id, storeId: DEFAULT_STORE_ID },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

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
