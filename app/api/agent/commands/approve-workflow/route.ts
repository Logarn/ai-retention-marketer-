import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createKlaviyoDraftForBrief,
  KlaviyoDraftConfigError,
} from "@/lib/klaviyo-draft-service";
import { KlaviyoDraftApiError } from "@/lib/klaviyo-drafts";

export const runtime = "nodejs";

const APPROVAL_INTENT = "approve_and_create_drafts";
const WORKFLOW_TYPE = "plan-brief-qa";

const commandSchema = z
  .object({
    message: z.string().trim().min(1, "message is required.").max(1000),
    workflowId: z.string().trim().min(1).max(200).optional(),
  })
  .passthrough();

type JsonRecord = Record<string, unknown>;

type DraftCandidate = Prisma.CampaignBriefGetPayload<{
  include: {
    sections: true;
  };
}>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function outputRecord(output: Prisma.JsonValue | null) {
  return isRecord(output) ? output : {};
}

function collectWorkflowBriefIds(output: JsonRecord) {
  const briefIds = new Set<string>();
  const briefs = Array.isArray(output.briefs) ? output.briefs : [];

  for (const brief of briefs) {
    if (!isRecord(brief)) continue;
    const id = asString(brief.id);
    if (id) briefIds.add(id);
  }

  return Array.from(briefIds);
}

function collectWorkflowPlanId(output: JsonRecord) {
  if (!isRecord(output.plan)) return null;
  return asString(output.plan.id);
}

function detectsSendOrScheduleIntent(message: string) {
  return /\b(send|sending|schedule|scheduled|scheduling|launch|launching)\b/i.test(message);
}

function detectsApprovalIntent(message: string) {
  return (
    /\bapproved?\b/i.test(message) ||
    /\blooks?\s+good\b/i.test(message) ||
    /\bgo\s+ahead\b/i.test(message) ||
    /\bapprove\s+(these|them|the\s+ready\s+ones|ready\s+ones)\b/i.test(message) ||
    /\bship\s+the\s+drafts?\b/i.test(message)
  );
}

function detectsIncludeWarnings(message: string) {
  return /\binclude\s+warnings?\b/i.test(message) || /\bapprove\s+warnings?\b/i.test(message);
}

function safeKlaviyoError(error: KlaviyoDraftApiError) {
  return {
    status: error.status,
    errors: error.errors,
  };
}

async function loadWorkflowBriefs(workflowId: string, output: JsonRecord) {
  const briefIds = collectWorkflowBriefIds(output);
  const planId = collectWorkflowPlanId(output);
  const where: Prisma.CampaignBriefWhereInput[] = [];

  if (briefIds.length) {
    where.push({ id: { in: briefIds } });
  }
  if (planId) {
    where.push({ planItem: { is: { planId } } });
  }

  if (!where.length) return [];

  return prisma.campaignBrief.findMany({
    where: {
      OR: where,
    },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function latestQaForBrief(briefId: string) {
  return prisma.briefQaCheck.findFirst({
    where: { briefId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      score: true,
      createdAt: true,
    },
  });
}

async function existingDraftForBrief(briefId: string) {
  return prisma.klaviyoDraft.findFirst({
    where: { briefId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      klaviyoCampaignId: true,
      klaviyoTemplateId: true,
      klaviyoMessageId: true,
      campaignName: true,
      status: true,
      createdAt: true,
    },
  });
}

function heldBrief(brief: DraftCandidate, reason: string, qaCheck?: Awaited<ReturnType<typeof latestQaForBrief>>) {
  return {
    briefId: brief.id,
    title: brief.title,
    reason,
    qaCheck: qaCheck
      ? {
          id: qaCheck.id,
          status: qaCheck.status,
          score: qaCheck.score,
          createdAt: qaCheck.createdAt.toISOString(),
        }
      : null,
  };
}

function skippedExistingDraft(brief: DraftCandidate, draft: NonNullable<Awaited<ReturnType<typeof existingDraftForBrief>>>) {
  return {
    briefId: brief.id,
    title: brief.title,
    reason: "existing_klaviyo_draft",
    draftId: draft.id,
    klaviyoCampaignId: draft.klaviyoCampaignId,
    klaviyoTemplateId: draft.klaviyoTemplateId,
    klaviyoMessageId: draft.klaviyoMessageId,
    campaignName: draft.campaignName,
    status: draft.status,
  };
}

function successMessage(created: number, held: number, skipped: number) {
  if (created > 0) {
    return `Created ${created} Klaviyo draft${created === 1 ? "" : "s"}. ${held} held, ${skipped} skipped. Nothing was scheduled or sent.`;
  }
  return `No new Klaviyo drafts were created. ${held} held, ${skipped} skipped. Nothing was scheduled or sent.`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = commandSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          intent: "invalid_command",
          error: "Invalid approval command",
          issues: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const { message, workflowId } = parsed.data;

    if (detectsSendOrScheduleIntent(message)) {
      return NextResponse.json({
        ok: true,
        intent: "draft_only_refusal",
        workflowId: workflowId ?? null,
        draftsCreated: [],
        held: [],
        skipped: [],
        message: "I cannot send or schedule campaigns from this command. Worklin is in draft-only mode; say \"approve the ready ones\" with a workflowId to create Klaviyo drafts only.",
      });
    }

    if (!detectsApprovalIntent(message)) {
      return NextResponse.json(
        {
          ok: false,
          intent: "clarification_needed",
          workflowId: workflowId ?? null,
          draftsCreated: [],
          held: [],
          skipped: [],
          message: "I did not detect an approval intent. Try \"approved\", \"looks good\", \"go ahead\", or \"approve the ready ones\".",
        },
        { status: 400 },
      );
    }

    if (!workflowId) {
      return NextResponse.json(
        {
          ok: false,
          intent: "clarification_needed",
          workflowId: null,
          draftsCreated: [],
          held: [],
          skipped: [],
          message: "Which completed workflow should I approve? Pass a workflowId so I can create drafts for the right briefs.",
        },
        { status: 400 },
      );
    }

    const workflow = await prisma.workflowRun.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      return NextResponse.json(
        {
          ok: false,
          intent: APPROVAL_INTENT,
          workflowId,
          draftsCreated: [],
          held: [],
          skipped: [],
          error: "Workflow run not found",
        },
        { status: 404 },
      );
    }

    if (workflow.type !== WORKFLOW_TYPE || workflow.status !== "completed") {
      return NextResponse.json(
        {
          ok: false,
          intent: APPROVAL_INTENT,
          workflowId,
          draftsCreated: [],
          held: [],
          skipped: [],
          message: "Only completed Plan -> Brief -> QA workflows can be approved for draft creation.",
        },
        { status: 400 },
      );
    }

    const includeWarnings = detectsIncludeWarnings(message);
    const briefs = await loadWorkflowBriefs(workflow.id, outputRecord(workflow.output));

    if (!briefs.length) {
      return NextResponse.json({
        ok: true,
        intent: APPROVAL_INTENT,
        workflowId,
        draftsCreated: [],
        held: [],
        skipped: [],
        message: "No campaign briefs were found for this workflow, so no Klaviyo drafts were created.",
      });
    }

    const draftsCreated = [];
    const held = [];
    const skipped = [];

    for (const brief of briefs) {
      const [latestQa, existingDraft] = await Promise.all([
        latestQaForBrief(brief.id),
        existingDraftForBrief(brief.id),
      ]);

      if (existingDraft) {
        skipped.push(skippedExistingDraft(brief, existingDraft));
        continue;
      }

      if (!latestQa) {
        held.push(heldBrief(brief, "missing_qa"));
        continue;
      }

      if (latestQa.status === "failed") {
        held.push(heldBrief(brief, "failed_qa", latestQa));
        continue;
      }

      if (latestQa.status === "warning" && !includeWarnings) {
        held.push(heldBrief(brief, "warning_qa_requires_explicit_include_warnings", latestQa));
        continue;
      }

      try {
        const draft = await createKlaviyoDraftForBrief({
          brief,
          latestQa,
        });
        draftsCreated.push({
          briefId: brief.id,
          title: brief.title,
          draftId: draft.draftId,
          klaviyoCampaignId: draft.klaviyoCampaignId,
          klaviyoTemplateId: draft.klaviyoTemplateId,
          klaviyoMessageId: draft.klaviyoMessageId,
          campaignName: draft.campaignName,
          status: draft.status,
          urls: draft.urls,
        });
      } catch (error) {
        if (error instanceof KlaviyoDraftConfigError) {
          return NextResponse.json(
            {
              ok: false,
              intent: APPROVAL_INTENT,
              workflowId,
              draftsCreated,
              held,
              skipped,
              error: "Klaviyo draft creation is not configured",
              missingConfig: error.missingConfig,
            },
            { status: 400 },
          );
        }

        if (error instanceof KlaviyoDraftApiError) {
          held.push({
            briefId: brief.id,
            title: brief.title,
            reason: "klaviyo_api_error",
            klaviyo: safeKlaviyoError(error),
          });
          continue;
        }

        throw error;
      }
    }

    return NextResponse.json({
      ok: true,
      intent: APPROVAL_INTENT,
      workflowId,
      draftsCreated,
      held,
      skipped,
      message: successMessage(draftsCreated.length, held.length, skipped.length),
    });
  } catch (error) {
    console.error("POST /api/agent/commands/approve-workflow failed", error);
    return NextResponse.json(
      {
        ok: false,
        intent: "approve_workflow_failed",
        error: "Failed to approve workflow and create Klaviyo drafts",
      },
      { status: 500 },
    );
  }
}
