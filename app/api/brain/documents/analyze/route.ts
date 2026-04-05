import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { groqClient, GROQ_MODEL } from "@/lib/ai";
import { DEFAULT_STORE_ID } from "../../profile/store";
import { extractJsonText } from "@/lib/brain/analyze-store-normalize";

export const maxDuration = 10;

const bodySchema = z.object({
  documentId: z.string().min(1),
});

const SYSTEM_PROMPT = `You are a brand analyst. Analyze this brand document and extract any brand guidelines, rules, voice preferences, or marketing insights. Return ONLY valid JSON:
{
  "summary": "2-3 sentence summary of what this document contains",
  "brandInsights": {
    "voiceNotes": "any voice/tone guidance found",
    "dosFound": ["rule 1", "rule 2"],
    "dontsFound": ["rule 1", "rule 2"],
    "ctasFound": ["CTA 1"],
    "phrasesPreferred": ["phrase 1"],
    "phrasesBanned": ["phrase 1"],
    "audienceNotes": "any target audience info found",
    "brandStoryNotes": "any brand story/history found",
    "emailGuidelines": "any email-specific guidelines found",
    "otherInsights": ["any other useful brand info"]
  }
}`;

function parseLlmJson(raw: string): { summary: string; brandInsights: Record<string, unknown> } | null {
  const jsonText = extractJsonText(raw);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as {
      summary?: string;
      brandInsights?: Record<string, unknown>;
    };
    if (!parsed.summary || typeof parsed.summary !== "string") return null;
    if (!parsed.brandInsights || typeof parsed.brandInsights !== "object") return null;
    return { summary: parsed.summary.trim(), brandInsights: parsed.brandInsights };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Expected { documentId: string }", step: "analyze" }, { status: 400 });
    }

    if (!groqClient) {
      return NextResponse.json({ error: "GROQ_API_KEY is not configured.", step: "analyze" }, { status: 500 });
    }

    const { documentId } = parsed.data;

    const doc = await prisma.brandDocument.findFirst({
      where: { id: documentId, storeId: DEFAULT_STORE_ID },
    });
    if (!doc) {
      return NextResponse.json({ error: "Document not found", step: "analyze" }, { status: 404 });
    }

    await prisma.brandDocument.update({
      where: { id: doc.id },
      data: { status: "processing", error: null },
    });

    const llmInput = doc.rawText.slice(0, 4000);

    let completion;
    try {
      completion = await groqClient.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Document file name: ${doc.fileName}\n\nContent:\n${llmInput}` },
        ],
      });
    } catch (llmErr) {
      await prisma.brandDocument.update({
        where: { id: doc.id },
        data: {
          status: "failed",
          error: llmErr instanceof Error ? llmErr.message : "Groq request failed",
        },
      });
      return NextResponse.json(
        {
          error: llmErr instanceof Error ? llmErr.message : "LLM request failed",
          step: "llm",
        },
        { status: 502 },
      );
    }

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const structured = parseLlmJson(raw);
    if (!structured) {
      await prisma.brandDocument.update({
        where: { id: doc.id },
        data: {
          status: "failed",
          error: "LLM returned invalid JSON",
        },
      });
      return NextResponse.json(
        {
          error: "LLM returned invalid JSON",
          step: "json_parse",
          rawSnippet: raw.slice(0, 2000),
        },
        { status: 502 },
      );
    }

    const extractedRulesJson = JSON.stringify(structured.brandInsights);

    const updated = await prisma.brandDocument.update({
      where: { id: doc.id },
      data: {
        summary: structured.summary,
        extractedRules: extractedRulesJson,
        status: "completed",
        error: null,
      },
    });

    return NextResponse.json({
      documentId: updated.id,
      summary: structured.summary,
      brandInsights: structured.brandInsights,
    });
  } catch (error) {
    console.error("[documents/analyze]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Analyze failed",
        step: "analyze",
      },
      { status: 500 },
    );
  }
}
