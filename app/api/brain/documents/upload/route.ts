import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { detectFileKind, extractTextFromBuffer, truncateForStorage } from "@/lib/brain/document-extract";
import { DEFAULT_STORE_ID } from "../../profile/store";

export const maxDuration = 10;

const MAX_BYTES = 10 * 1024 * 1024;

function blobFallbackDataUrl(buffer: Buffer, mime: string) {
  const b64 = buffer.toString("base64");
  return `data:${mime};base64,${b64}`;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Expected multipart field \"file\".", step: "upload" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 10MB).", step: "upload" }, { status: 400 });
    }

    const fileName = file.name || "document";
    const kind = detectFileKind(fileName, file.type);
    if (!kind) {
      return NextResponse.json(
        { error: "Only PDF, DOCX, and TXT files are allowed.", step: "upload" },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rawText: string;
    try {
      rawText = await extractTextFromBuffer(kind, buffer);
    } catch (extractErr) {
      return NextResponse.json(
        {
          error: `Text extraction failed: ${extractErr instanceof Error ? extractErr.message : "unknown"}`,
          step: "extract_text",
        },
        { status: 422 },
      );
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "No text could be extracted from this file.", step: "extract_text" },
        { status: 422 },
      );
    }

    const storedText = truncateForStorage(rawText);

    let fileUrl: string | null = null;
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token) {
      try {
        const blob = await put(`brand-docs/${DEFAULT_STORE_ID}/${Date.now()}-${fileName}`, buffer, {
          access: "public",
          token,
        });
        fileUrl = blob.url;
      } catch {
        fileUrl = null;
      }
    }
    if (!fileUrl) {
      const mime =
        kind === "pdf"
          ? "application/pdf"
          : kind === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "text/plain";
      fileUrl = blobFallbackDataUrl(buffer, mime);
    }

    const created = await prisma.brandDocument.create({
      data: {
        storeId: DEFAULT_STORE_ID,
        fileName,
        fileType: kind,
        fileSize: file.size,
        fileUrl,
        rawText: storedText,
        status: "uploaded",
      },
    });

    const preview = storedText.slice(0, 500);

    return NextResponse.json(
      {
        documentId: created.id,
        fileName: created.fileName,
        fileType: created.fileType,
        textPreview: preview,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[documents/upload]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed",
        step: "upload",
      },
      { status: 500 },
    );
  }
}
