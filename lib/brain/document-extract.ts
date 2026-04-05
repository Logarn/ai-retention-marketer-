import mammoth from "mammoth";

export const MAX_RAW_TEXT_STORAGE = 20_000;

export type FileKind = "pdf" | "docx" | "txt";

export function detectFileKind(fileName: string, mimeType: string): FileKind | null {
  const lower = fileName.toLowerCase();
  const mime = (mimeType || "").toLowerCase();
  if (lower.endsWith(".pdf") || mime.includes("pdf")) return "pdf";
  if (lower.endsWith(".docx") || mime.includes("wordprocessingml") || mime.includes("docx")) return "docx";
  if (lower.endsWith(".txt") || mime === "text/plain") return "txt";
  return null;
}

export async function extractTextFromBuffer(kind: FileKind, buffer: Buffer): Promise<string> {
  if (kind === "txt") {
    return buffer.toString("utf8");
  }
  if (kind === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value ?? "").trim();
  }
  if (kind === "pdf") {
    const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text?: string }>;
    const parsed = await pdfParse(buffer);
    return String(parsed.text ?? "").trim();
  }
  return "";
}

export function truncateForStorage(text: string, max = MAX_RAW_TEXT_STORAGE) {
  if (text.length <= max) return text;
  return text.slice(0, max);
}
