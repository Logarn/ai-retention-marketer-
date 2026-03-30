import { NextResponse } from "next/server";
import { z } from "zod";
import { anthropicClient, CLAUDE_MODEL } from "@/lib/ai";

const payloadSchema = z.object({
  context: z.string().min(5),
  tone: z.string().default("friendly"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { context, tone } = parsed.data;

    if (!anthropicClient || !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        subjectLines: [
          "You asked, we listened: your favorites are back",
          "A quick update made just for you",
          "Limited-time offer curated for your style",
          "You might love what we picked next",
          "Your next order could ship free today",
        ],
        provider: "mock",
      });
    }

    const prompt = `
You are an expert lifecycle marketer.
Generate exactly 5 subject lines for an email campaign.
Tone: ${tone}
Campaign context: ${context}

Constraints:
- 45 characters max each
- Different angle per option
- No emojis
- Output only numbered lines
`;

    const completion = await anthropicClient.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 250,
      messages: [{ role: "user", content: prompt }],
    });

    const text = completion.content
      .map((c) => ("text" in c ? c.text : ""))
      .join("\n")
      .trim();

    const subjectLines = text
      .split("\n")
      .map((line) => line.replace(/^\s*\d+[\).\-\s]*/, "").trim())
      .filter(Boolean)
      .slice(0, 5);

    return NextResponse.json({
      subjectLines,
      provider: "anthropic",
    });
  } catch (error) {
    console.error("POST /api/ai/generate-subject-lines failed", error);
    return NextResponse.json({ error: "Failed to generate subject lines" }, { status: 500 });
  }
}
