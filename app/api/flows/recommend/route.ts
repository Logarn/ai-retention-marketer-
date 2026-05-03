import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { detectExistingFlows } from "@/lib/flows/detect-existing-flows";
import { recommendFlowPlan } from "@/lib/flows/recommend-flow-plan";
import {
  getKlaviyoFlowConfig,
  KlaviyoFlowApiError,
  listKlaviyoFlows,
} from "@/lib/klaviyo-flows";
import { toPrismaJson } from "@/app/api/agent/workflows/shared";

export const runtime = "nodejs";

const WORKFLOW_TYPE = "flow-recommendation";
const WORKFLOW_GENERATOR = "flow-planner-v0";

const recommendSchema = z
  .object({
    message: z.string().trim().max(2000).optional().nullable(),
    goal: z.string().trim().max(500).optional().nullable(),
    constraints: z.array(z.string().trim().min(1).max(240)).max(12).optional(),
    limit: z.number().int().min(1).max(12).optional().nullable(),
  })
  .passthrough();

type RecommendInput = z.infer<typeof recommendSchema>;

function issueMessages(error: z.ZodError) {
  return error.issues.map((issue) => {
    const field = issue.path.join(".");
    return field ? `${field}: ${issue.message}` : issue.message;
  });
}

function safeFlowRecommendationError(error: unknown) {
  if (error instanceof KlaviyoFlowApiError) {
    const status = error.status === 401 || error.status === 403 ? 400 : 502;
    return NextResponse.json(
      {
        ok: false,
        error: status === 400
          ? "Klaviyo flows read is not available. Check API key permissions for flows:read."
          : "Failed to recommend lifecycle flows",
        klaviyoStatus: error.status,
        klaviyoErrors: error.errors,
      },
      { status },
    );
  }

  console.error("POST /api/flows/recommend failed", error);
  return NextResponse.json(
    {
      ok: false,
      error: "Failed to recommend lifecycle flows",
    },
    { status: 500 },
  );
}

async function persistWorkflowRun(input: RecommendInput, output: unknown) {
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
    console.warn("Flow recommendation WorkflowRun persistence skipped", error);
    return null;
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = recommendSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid flow recommendation request",
        issues: issueMessages(parsed.error),
      },
      { status: 400 },
    );
  }

  const configResult = getKlaviyoFlowConfig();
  if (!configResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Klaviyo flows read is not configured",
        missingConfig: configResult.missingConfig,
      },
      { status: 400 },
    );
  }

  try {
    const flows = await listKlaviyoFlows(configResult.config);
    const detection = detectExistingFlows(flows);
    const plan = recommendFlowPlan(detection, parsed.data);
    const output = {
      ok: true,
      readOnly: true,
      ...plan,
    };
    const workflowId = await persistWorkflowRun(parsed.data, output);

    return NextResponse.json({
      ...output,
      workflowId,
      workflowPersistence: workflowId ? "persisted" : "skipped",
    });
  } catch (error) {
    return safeFlowRecommendationError(error);
  }
}
