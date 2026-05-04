import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auditKlaviyoCampaigns } from "@/lib/campaigns/audit-campaigns";
import {
  getKlaviyoCampaignConfig,
  KlaviyoCampaignApiError,
} from "@/lib/klaviyo-campaigns";
import { toPrismaJson } from "@/app/api/agent/workflows/shared";

export const runtime = "nodejs";

const WORKFLOW_TYPE = "campaign-audit";
const WORKFLOW_GENERATOR = "campaign-audit-v0";

const campaignAuditSchema = z
  .object({
    timeframe: z.enum(["last_30_days", "last_90_days", "last_365_days", "lifetime", "custom"]).optional().nullable(),
    startDate: z.string().trim().min(1).max(80).optional().nullable(),
    endDate: z.string().trim().min(1).max(80).optional().nullable(),
    limit: z.number().int().min(1).max(50).optional().nullable(),
    includeDrafts: z.boolean().optional(),
  })
  .passthrough();

type CampaignAuditRequest = z.infer<typeof campaignAuditSchema>;

function issueMessages(error: z.ZodError) {
  return error.issues.map((issue) => {
    const field = issue.path.join(".");
    return field ? `${field}: ${issue.message}` : issue.message;
  });
}

function safeCampaignAuditError(error: unknown) {
  if (error instanceof KlaviyoCampaignApiError) {
    const status = error.status === 400 || error.status === 401 || error.status === 403 ? 400 : 502;
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: status === 400
          ? "Klaviyo campaign audit is not available. Check campaign read scopes, request fields, and API key permissions."
          : "Failed to audit Klaviyo campaigns",
        klaviyoStatus: error.status,
        klaviyoErrors: error.errors,
        campaigns: [],
        insights: [],
        chartHints: [],
        caveats: [],
      },
      { status },
    );
  }

  console.error("POST /api/campaigns/audit failed", error);
  return NextResponse.json(
    {
      ok: false,
      readOnly: true,
      error: "Failed to audit Klaviyo campaigns",
      campaigns: [],
      insights: [],
      chartHints: [],
      caveats: [],
    },
    { status: 500 },
  );
}

async function persistWorkflowRun(input: CampaignAuditRequest, output: unknown) {
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
    console.warn("Campaign audit WorkflowRun persistence skipped", error);
    return null;
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = campaignAuditSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Invalid campaign audit request",
        issues: issueMessages(parsed.error),
        campaigns: [],
        insights: [],
        chartHints: [],
        caveats: [],
      },
      { status: 400 },
    );
  }

  const configResult = getKlaviyoCampaignConfig();
  if (!configResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Klaviyo campaign read is not configured",
        missingConfig: configResult.missingConfig,
        campaigns: [],
        insights: [],
        chartHints: [],
        caveats: [],
      },
      { status: 400 },
    );
  }

  try {
    const output = await auditKlaviyoCampaigns(configResult.config, parsed.data);
    const workflowId = await persistWorkflowRun(parsed.data, output);

    return NextResponse.json({
      ...output,
      workflowId,
      workflowPersistence: workflowId ? "persisted" : "skipped",
    });
  } catch (error) {
    return safeCampaignAuditError(error);
  }
}
