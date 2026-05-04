import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { toPrismaJson } from "@/app/api/agent/workflows/shared";
import {
  auditSegments,
  type SegmentAuditInput,
} from "@/lib/segments/audit-segments";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const WORKFLOW_TYPE = "segment-audit";
const WORKFLOW_GENERATOR = "segment-audience-audit-v0";

const segmentAuditSchema = z
  .object({
    timeframe: z.enum(["last_90_days", "last_180_days", "last_365_days"]).optional().nullable(),
    includeKlaviyo: z.boolean().optional(),
    includeLocal: z.boolean().optional(),
    limit: z.number().int().min(1).max(250).optional().nullable(),
  })
  .passthrough();

type SegmentAuditRequest = z.infer<typeof segmentAuditSchema>;

function issueMessages(error: z.ZodError) {
  return error.issues.map((issue) => {
    const field = issue.path.join(".");
    return field ? `${field}: ${issue.message}` : issue.message;
  });
}

async function persistWorkflowRun(input: SegmentAuditInput, output: unknown) {
  try {
    const workflow = await prisma.workflowRun.create({
      data: {
        type: WORKFLOW_TYPE,
        status: "completed",
        input: toPrismaJson(input),
        output: toPrismaJson(output),
        error: null,
        metadata: {
          generatedBy: WORKFLOW_GENERATOR,
          readOnly: true,
          completedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    return workflow.id;
  } catch (error) {
    console.warn("Segment audit WorkflowRun persistence skipped", error);
    return null;
  }
}

function safeSegmentAuditError(error: unknown) {
  console.error("POST /api/segments/audit failed", error);
  return NextResponse.json(
    {
      ok: false,
      readOnly: true,
      error: "Failed to audit segments and audiences",
      summary: null,
      insights: [],
      chartHints: [],
      caveats: [
        {
          message: "Segment audit failed unexpectedly. No Klaviyo writes were attempted.",
          evidenceType: "caveat",
          severity: "unknown",
        },
      ],
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = segmentAuditSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Invalid segment audit request",
        issues: issueMessages(parsed.error),
        insights: [],
        chartHints: [],
        caveats: [],
      },
      { status: 400 },
    );
  }

  const input: SegmentAuditRequest = parsed.data;
  const includeKlaviyo = input.includeKlaviyo !== false;
  const includeLocal = input.includeLocal !== false;
  if (!includeKlaviyo && !includeLocal) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Segment audit needs at least one data source",
        issues: ["includeKlaviyo and includeLocal cannot both be false."],
        insights: [],
        chartHints: [],
        caveats: [],
      },
      { status: 400 },
    );
  }

  try {
    const output = await auditSegments(input);
    const workflowId = await persistWorkflowRun(input, output);

    return NextResponse.json({
      ...output,
      workflowId,
      workflowPersistence: workflowId ? "persisted" : "skipped",
    });
  } catch (error) {
    return safeSegmentAuditError(error);
  }
}
