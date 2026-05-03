import { NextResponse } from "next/server";
import { z } from "zod";
import { generateJson, generateText, LlmRouterError } from "@/lib/llm";
import { normalizeProviderName } from "@/lib/llm/utils";

const payloadSchema = z.object({
  prompt: z.string().min(1, "prompt is required"),
  mode: z.enum(["text", "json"]).default("text"),
  provider: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const normalizedProvider = parsed.data.provider ? normalizeProviderName(parsed.data.provider) : undefined;
    if (parsed.data.provider && !normalizedProvider) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid provider",
          providers: ["groq", "openrouter", "gemini", "deepseek", "mistral", "cohere", "edenai", "mock"],
        },
        { status: 400 },
      );
    }
    const provider = normalizedProvider ?? undefined;

    const result =
      parsed.data.mode === "json"
        ? await generateJson({ prompt: parsed.data.prompt, provider })
        : await generateText({ prompt: parsed.data.prompt, provider });

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
      output: result.output,
    });
  } catch (error) {
    if (error instanceof LlmRouterError) {
      return NextResponse.json(
        {
          ok: false,
          error: "No configured LLM provider succeeded.",
          attempts: error.attempts,
        },
        { status: error.status },
      );
    }

    return NextResponse.json({ ok: false, error: "LLM router test failed." }, { status: 500 });
  }
}
