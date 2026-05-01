import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  generatePlanArtifact,
  loadPlannerContext,
  serializePlan,
  validatePlannerGeneratePayload,
} from "@/app/api/planner/shared";
import {
  buildBriefSource,
  generateBriefArtifact,
  loadBriefContext,
  serializeBrief,
} from "@/app/api/briefs/shared";
import {
  briefQaInclude,
  loadBrainGuidance,
  runBriefQa,
  serializeBriefQaCheck,
} from "@/app/api/qa/shared";
import { toPrismaJson } from "@/app/api/agent/workflows/shared";

const MAX_PROMPT_LENGTH = 2000;
const DEFAULT_RANGE_DAYS = 7;
const WORKFLOW_TYPE = "plan-brief-qa";
const WORKFLOW_GENERATOR = "agent-orchestrator-v0";

const workflowSchema = z
  .object({
    prompt: z.string().trim().min(1, "prompt is required.").max(MAX_PROMPT_LENGTH),
    startDate: z.string().trim().optional().nullable(),
    endDate: z.string().trim().optional().nullable(),
    campaignCount: z.unknown().optional(),
    focus: z.string().trim().max(240).optional().nullable(),
    constraints: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  })
  .passthrough();

type WorkflowInput = z.infer<typeof workflowSchema>;

type CreatedPlan = Prisma.CampaignPlanGetPayload<{
  include: {
    items: {
      orderBy: { suggestedSendDate: "asc" };
    };
  };
}>;

type WorkflowRunRef = {
  id: string;
};

function tomorrowAtNoon() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(12, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(12, 0, 0, 0);
  return next;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeConstraints(value: WorkflowInput["constraints"]) {
  const rawItems = Array.isArray(value) ? value : value ? value.split(/[\n,]/) : [];
  return rawItems.map((item) => item.trim()).filter(Boolean);
}

function deriveCampaignCount(prompt: string) {
  const match = prompt.match(/\b(?:plan|create|generate)?\s*(\d{1,2})\s+(?:retention\s+)?campaigns?\b/i);
  if (!match) return undefined;
  return Number(match[1]);
}

function derivePromptConstraints(prompt: string) {
  const constraints: string[] = [];
  if (/\b(no|without|avoid)\b.*\b(discounts?|coupons?|sales?|markdowns?|promos?|promotions?)\b/i.test(prompt)) {
    constraints.push("no discounts");
  }
  if (/\b(vip|early access|loyalty)\b/i.test(prompt)) {
    constraints.push("include one VIP campaign");
  }
  if (/\b(no|without|avoid)\b.*\b(sms|text messages?)\b/i.test(prompt)) {
    constraints.push("email only");
  }
  return constraints;
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function createPlannerPayload(input: WorkflowInput) {
  const start = input.startDate ? null : tomorrowAtNoon();
  const end = input.endDate ? null : addDays(start ?? tomorrowAtNoon(), DEFAULT_RANGE_DAYS - 1);

  return {
    startDate: input.startDate ?? formatDateInput(start ?? tomorrowAtNoon()),
    endDate: input.endDate ?? formatDateInput(end ?? addDays(tomorrowAtNoon(), DEFAULT_RANGE_DAYS - 1)),
    campaignCount: input.campaignCount ?? deriveCampaignCount(input.prompt),
    focus: input.focus?.trim() || deriveFocus(input.prompt),
    constraints: uniqueStrings([...derivePromptConstraints(input.prompt), ...normalizeConstraints(input.constraints)]),
  };
}

function deriveFocus(prompt: string) {
  if (/\brepeat purchase|second purchase|buy again\b/i.test(prompt)) return "repeat purchase";
  if (/\bwinback|at[-\s]?risk|lapsed|churn\b/i.test(prompt)) return "winback";
  if (/\bvip|loyal|champions?\b/i.test(prompt)) return "loyalty";
  if (/\breplenish|restock\b/i.test(prompt)) return "replenishment";
  return "retention";
}

function parseWorkflowBody(input: unknown):
  | { ok: true; data: WorkflowInput }
  | { ok: false; issues: string[] } {
  const parsed = workflowSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => {
        const field = issue.path.join(".");
        if (field === "prompt") return "prompt is required.";
        return field ? `${field}: ${issue.message}` : issue.message;
      }),
    };
  }
  return { ok: true, data: parsed.data };
}

async function createPlan(input: WorkflowInput) {
  const plannerPayload = createPlannerPayload(input);
  const validation = validatePlannerGeneratePayload(plannerPayload);

  if (!validation.ok) {
    return { ok: false as const, issues: validation.issues };
  }

  const context = await loadPlannerContext();
  const generated = generatePlanArtifact(validation.data, context);

  const plan = await prisma.campaignPlan.create({
    data: {
      name: generated.name,
      dateRangeStart: generated.dateRangeStart,
      dateRangeEnd: generated.dateRangeEnd,
      status: generated.status,
      summary: generated.summary,
      strategyNotes: generated.strategyNotes,
      metadata: {
        ...generated.metadata,
        workflow: {
          type: WORKFLOW_TYPE,
          prompt: input.prompt,
          generatedBy: WORKFLOW_GENERATOR,
        },
      } as Prisma.InputJsonValue,
      items: {
        create: generated.items.map((item) => ({
          title: item.title,
          campaignType: item.campaignType,
          goal: item.goal,
          segment: item.segment,
          suggestedSendDate: item.suggestedSendDate,
          subjectLineAngle: item.subjectLineAngle,
          primaryProduct: item.primaryProduct,
          why: item.why,
          confidenceScore: item.confidenceScore,
          status: item.status,
          metadata: item.metadata as Prisma.InputJsonValue,
        })),
      },
    },
    include: {
      items: {
        orderBy: { suggestedSendDate: "asc" },
      },
    },
  });

  return { ok: true as const, plan };
}

async function createBriefs(plan: CreatedPlan) {
  const context = await loadBriefContext();
  const briefs = [];

  for (const item of plan.items) {
    const source = buildBriefSource(
      {
        planItemId: item.id,
        title: null,
        campaignType: null,
        segment: null,
        goal: null,
        subjectLineAngle: null,
        primaryProduct: null,
        angle: null,
        cta: null,
        designNotes: null,
        metadata: {
          workflow: {
            type: WORKFLOW_TYPE,
            generatedBy: WORKFLOW_GENERATOR,
          },
        },
      },
      item,
    );
    const generated = generateBriefArtifact(source, context);
    const brief = await prisma.campaignBrief.create({
      data: {
        planItemId: generated.planItemId,
        title: generated.title,
        campaignType: generated.campaignType,
        segment: generated.segment,
        goal: generated.goal,
        subjectLines: generated.subjectLines as Prisma.InputJsonValue,
        previewTexts: generated.previewTexts as Prisma.InputJsonValue,
        angle: generated.angle,
        primaryProduct: generated.primaryProduct,
        status: generated.status,
        designNotes: generated.designNotes,
        cta: generated.cta,
        metadata: {
          ...generated.metadata,
          workflow: {
            type: WORKFLOW_TYPE,
            generatedBy: WORKFLOW_GENERATOR,
            planId: plan.id,
            planItemId: item.id,
          },
        } as Prisma.InputJsonValue,
        sections: {
          create: generated.sections.map((section) => ({
            type: section.type,
            heading: section.heading,
            body: section.body,
            sortOrder: section.sortOrder,
            metadata: section.metadata as Prisma.InputJsonValue,
          })),
        },
      },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    briefs.push(brief);
  }

  return briefs;
}

async function runQaForBriefs(briefIds: string[]) {
  const brainGuidance = await loadBrainGuidance();
  const qaResults = [];

  for (const briefId of briefIds) {
    const brief = await prisma.campaignBrief.findUnique({
      where: { id: briefId },
      include: briefQaInclude,
    });

    if (!brief) continue;

    const result = runBriefQa(brief, brainGuidance);
    const qaCheck = await prisma.briefQaCheck.create({
      data: {
        briefId,
        status: result.status,
        score: result.score,
        issues: result.issues as Prisma.InputJsonValue,
        warnings: result.warnings as Prisma.InputJsonValue,
        passedChecks: result.passedChecks as Prisma.InputJsonValue,
        metadata: {
          ...result.metadata,
          workflow: {
            type: WORKFLOW_TYPE,
            generatedBy: WORKFLOW_GENERATOR,
          },
        } as Prisma.InputJsonValue,
      },
    });
    qaResults.push(qaCheck);
  }

  return qaResults;
}

function workflowSummary(plan: CreatedPlan, qaResults: Array<{ status: string; score: number }>) {
  const failed = qaResults.filter((result) => result.status === "failed").length;
  const warnings = qaResults.filter((result) => result.status === "warning").length;
  const passed = qaResults.filter((result) => result.status === "passed").length;
  const averageScore = qaResults.length
    ? Math.round(qaResults.reduce((sum, result) => sum + result.score, 0) / qaResults.length)
    : 0;

  return {
    text: `Created one campaign plan with ${plan.items.length} plan items, generated ${qaResults.length} briefs, and ran QA on each brief.`,
    planItems: plan.items.length,
    briefsGenerated: qaResults.length,
    qa: {
      passed,
      warning: warnings,
      failed,
      averageScore,
    },
  };
}

function recommendedNextAction(qaResults: Array<{ status: string }>) {
  if (qaResults.some((result) => result.status === "failed")) {
    return "Resolve failed QA issues in the generated briefs, then rerun QA before moving toward scheduling.";
  }
  if (qaResults.some((result) => result.status === "warning")) {
    return "Review QA warnings with a human editor, make any needed brief edits, then rerun QA.";
  }
  return "All generated briefs passed QA. Review the plan and briefs, then move approved items toward scheduling.";
}

async function createWorkflowRun(input: WorkflowInput) {
  return prisma.workflowRun.create({
    data: {
      type: WORKFLOW_TYPE,
      status: "running",
      input: toPrismaJson(input),
      metadata: {
        generatedBy: WORKFLOW_GENERATOR,
        startedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

async function markWorkflowCompleted(workflowId: string, output: unknown) {
  await prisma.workflowRun.update({
    where: { id: workflowId },
    data: {
      status: "completed",
      output: toPrismaJson(output),
      error: null,
      metadata: {
        generatedBy: WORKFLOW_GENERATOR,
        completedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

async function markWorkflowFailed(
  workflowId: string,
  error: string,
  output: unknown,
) {
  await prisma.workflowRun.update({
    where: { id: workflowId },
    data: {
      status: "failed",
      output: toPrismaJson(output),
      error,
      metadata: {
        generatedBy: WORKFLOW_GENERATOR,
        failedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

export async function POST(request: Request) {
  let workflowRun: WorkflowRunRef | null = null;

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseWorkflowBody(body);

    if (!parsed.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid workflow request",
          issues: parsed.issues,
        },
        { status: 400 },
      );
    }

    workflowRun = await createWorkflowRun(parsed.data);
    const planResult = await createPlan(parsed.data);

    if (!planResult.ok) {
      const output = {
        ok: false,
        workflowId: workflowRun.id,
        error: "Invalid planner request",
        issues: planResult.issues,
      };
      await markWorkflowFailed(workflowRun.id, "Invalid planner request", output);

      return NextResponse.json(output, { status: 400 });
    }

    const briefs = await createBriefs(planResult.plan);
    const qaResults = await runQaForBriefs(briefs.map((brief) => brief.id));
    const summary = workflowSummary(planResult.plan, qaResults);
    const responsePayload = {
      ok: true,
      workflowId: workflowRun.id,
      plan: serializePlan(planResult.plan),
      briefs: briefs.map(serializeBrief),
      qaResults: qaResults.map(serializeBriefQaCheck),
      summary,
      recommendedNextAction: recommendedNextAction(qaResults),
    };

    await markWorkflowCompleted(workflowRun.id, responsePayload);

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (error) {
    console.error("POST /api/agent/workflows/plan-brief-qa failed", error);
    const output = {
      ok: false,
      workflowId: workflowRun?.id ?? null,
      error: "Failed to run Plan -> Brief -> QA workflow",
    };

    if (workflowRun) {
      await markWorkflowFailed(
        workflowRun.id,
        "Failed to run Plan -> Brief -> QA workflow",
        output,
      ).catch(() => {
        console.error("Failed to persist WorkflowRun failure state");
      });
    }

    return NextResponse.json(
      output,
      { status: 500 },
    );
  }
}
