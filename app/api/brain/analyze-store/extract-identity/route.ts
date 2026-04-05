import { NextResponse } from "next/server";
import { z } from "zod";
import { IDENTITY_SYSTEM_PROMPT, callGroqJson } from "@/lib/brain/analyze-store-groq";
import { normalizeIdentityOnly, parseJsonObject } from "@/lib/brain/analyze-store-normalize";

export const maxDuration = 10;

const requestSchema = z.object({
  content: z.string().min(1),
});

export async function POST(request: Request) {
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid payload. Expected { content: string }.", step: "extract_identity" },
      { status: 400 },
    );
  }

  const { content } = parsedBody.data;

  try {
    const completion = await callGroqJson([
      { role: "system", content: IDENTITY_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Homepage plain text (truncated):\n${content}`,
      },
    ]);

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const parsed = raw ? parseJsonObject(raw) : null;
    if (!parsed) {
      return NextResponse.json(
        {
          error: "LLM returned invalid JSON for identity and audience.",
          step: "json_parse_identity",
          rawSnippet: raw.slice(0, 2000),
        },
        { status: 502 },
      );
    }

    const analysisData = normalizeIdentityOnly(parsed);

    return NextResponse.json({ analysisData });
  } catch (error) {
    console.error("[analyze-store/extract-identity]", error);
    return NextResponse.json(
      {
        error: `Identity extraction failed: ${error instanceof Error ? error.message : "Groq request failed."}`,
        step: "llm_identity",
      },
      { status: 502 },
    );
  }
}
