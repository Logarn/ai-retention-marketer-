import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auditKlaviyoFlows } from "@/lib/flows/audit-flow";
import {
  getKlaviyoFlowConfig,
  KlaviyoFlowApiError,
} from "@/lib/klaviyo-flows";
import { toPrismaJson } from "@/app/api/agent/workflows/shared";

export const runtime = "nodejs";

const WORKFLOW_TYPE = "flow-audit";
const WORKFLOW_GENERATOR = "flow-audit-v0";

const FLOW_ID_PATTERN = /^[A-Za-z0-9]+$/;

const flowAuditSchema = z
  .object({
    flowId: z.string().trim().min(1).max(160).regex(FLOW_ID_PATTERN).optional().nullable(),
    playbookId: z.string().trim().min(1).max(120).optional().nullable(),
    auditAll: z.boolean().optional(),
    limit: z.number().int().min(1).max(10).optional().nullable(),
  })
  .passthrough();

type FlowAuditRequest = z.infer<typeof flowAuditSchema>;

function issueMessages(error: z.ZodError) {
  return error.issues.map((issue) => {
    const field = issue.path.join(".");
    return field ? `${field}: ${issue.message}` : issue.message;
  });
}

function safeFlowAuditError(error: unknown) {
  if (error instanceof KlaviyoFlowApiError) {
    const notFound = error.status === 404;
    const invalidRequest = error.status === 400;
    const permissionProblem = error.status === 401 || error.status === 403;
    const status = notFound ? 404 : invalidRequest || permissionProblem ? 400 : 502;

    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: notFound
          ? "Klaviyo flow not found"
          : invalidRequest
            ? "Invalid Klaviyo flow audit request."
            : permissionProblem
            ? "Klaviyo flows read is not available. Check API key permissions for flows:read."
            : "Failed to audit Klaviyo flows",
        klaviyoStatus: error.status,
        klaviyoErrors: error.errors,
        audits: [],
      },
      { status },
    );
  }

  console.error("POST /api/flows/audit failed", error);
  return NextResponse.json(
    {
      ok: false,
      readOnly: true,
      error: "Failed to audit Klaviyo flows",
      audits: [],
    },
    { status: 500 },
  );
}

async function persistWorkflowRun(input: FlowAuditRequest, output: unknown) {
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
    console.warn("Flow audit WorkflowRun persistence skipped", error);
    return null;
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = flowAuditSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Invalid flow audit request",
        issues: issueMessages(parsed.error),
        audits: [],
      },
      { status: 400 },
    );
  }

  const configResult = getKlaviyoFlowConfig();
  if (!configResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Klaviyo flows read is not configured",
        missingConfig: configResult.missingConfig,
        audits: [],
      },
      { status: 400 },
    );
  }

  try {
    const output = await auditKlaviyoFlows(configResult.config, parsed.data);
    const workflowId = await persistWorkflowRun(parsed.data, output);

    return NextResponse.json({
      ...output,
      workflowId,
      workflowPersistence: workflowId ? "persisted" : "skipped",
    });
  } catch (error) {
    return safeFlowAuditError(error);
  }
}
