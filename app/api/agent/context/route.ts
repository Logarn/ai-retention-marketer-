import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAgentContext } from "@/lib/agent/context/build-context";

const contextSchema = z
  .object({
    message: z.string().trim().min(1, "message is required.").max(2000),
    workflowId: z.string().trim().min(1).max(200).optional(),
    limit: z.unknown().optional(),
  })
  .passthrough();

function parseLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return Number.NaN;
  return parsed;
}

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
    const parsed = contextSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid context request",
          issues: issueMessages(parsed.error),
        },
        { status: 400 },
      );
    }

    const limit = parseLimit(parsed.data.limit);
    if (Number.isNaN(limit)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid context request",
          issues: ["limit must be a positive whole number."],
        },
        { status: 400 },
      );
    }

    const result = await buildAgentContext({
      message: parsed.data.message,
      workflowId: parsed.data.workflowId,
      limit,
    });

    return NextResponse.json(result);
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

    console.error("POST /api/agent/context failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to build agent context",
      },
      { status: 500 },
    );
  }
}
