import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBrandProfileId, inferDocumentType, normalizeDocumentResponse } from "../shared";

type UploadPayload = {
  fileName?: string;
  fileType?: string;
  fileUrl?: string;
  fileSize?: number;
};

function extensionFromFileName(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "txt";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UploadPayload;
    const fileName = String(body.fileName ?? "").trim();
    if (!fileName) {
      return NextResponse.json({ error: "fileName is required" }, { status: 400 });
    }

    const fileType = String(body.fileType ?? "").trim() || extensionFromFileName(fileName);
    const fileUrl =
      String(body.fileUrl ?? "").trim() ||
      `https://example.invalid/brain-documents/${Date.now().toString(36)}-${encodeURIComponent(fileName)}`;
    const fileSize = Number(body.fileSize ?? 0);

    const created = await prisma.brandDocument.create({
      data: {
        brandProfileId: await ensureBrandProfileId(),
        fileName,
        fileType,
        fileUrl,
        fileSize: Number.isFinite(fileSize) ? Math.max(0, Math.round(fileSize)) : 0,
        documentType: inferDocumentType(fileName),
        extractionStatus: "pending",
      },
    });

    return NextResponse.json({ document: normalizeDocumentResponse(created) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to upload document",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
