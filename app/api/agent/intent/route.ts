import { NextResponse } from "next/server";
import { z } from "zod";
import { parseAgentIntent } from "@/lib/agent/intent/parse-intent";
import { normalizeProviderName } from "@/lib/llm/utils";

const intentSchema = z
  .object({
    message: z.string().trim().min(1, "message is required.").max(2000),
    workflowId: z.string().trim().min(1).max(200).optional(),
    provider: z.string().trim().min(1).max(80).optional(),
  })
  .passthrough();

function issueMessages(error: z.ZodError) {
  return error.issues.map((issue) => {
    const field = issue.path.join(".");
    if (field === "message") return "message is required.";
    return field ? `${field}: ${issue.message}` : issue.message;
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = intentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid intent request",
          issues: issueMessages(parsed.error),
        },
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

    const result = await parseAgentIntent({
      message: parsed.data.message,
      workflowId: parsed.data.workflowId,
      provider,
    });

    return NextResponse.json({
      ok: true,
      ...result.intent,
      parser: result.parser,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "WORKFLOW_NOT_FOUND") {
      return NextResponse.json(
        {
          ok: false,
          error: "Workflow run not found",
        },
        { status: 404 },
      );
    }

    console.error("POST /api/agent/intent failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to parse agent intent",
      },
      { status: 500 },
    );
  }
}
