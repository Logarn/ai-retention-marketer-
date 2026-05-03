import { NextResponse } from "next/server";
import { z } from "zod";
import { POST as approveWorkflow } from "@/app/api/agent/commands/approve-workflow/route";
import {
  cleanWorkflowId,
  serializeWorkflowRun,
  serializeWorkflowRunSummary,
} from "@/app/api/agent/workflows/shared";
import { POST as planBriefQaWorkflow } from "@/app/api/agent/workflows/plan-brief-qa/route";
import { buildAgentContext } from "@/lib/agent/context/build-context";
import { parseAgentIntent } from "@/lib/agent/intent/parse-intent";
import { getAgentToolByName } from "@/lib/agent/tools/registry";
import { prisma } from "@/lib/prisma";
import { isPlaybookType, listPlaybooks } from "@/lib/playbooks";
import type { AgentContextResult } from "@/lib/agent/context/types";
import type { IntentParameters } from "@/lib/agent/intent/types";
import type { AgentToolDefinition } from "@/lib/agent/tools/types";
import type { PlaybookType, WorklinPlaybook } from "@/lib/playbooks";

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_WORKFLOW_LIMIT = 10;
const COMMAND_ORIGIN = "http://worklin.local";

const commandSchema = z
  .object({
    message: z.string().trim().min(1, "message is required.").max(MAX_MESSAGE_LENGTH),
    workflowId: z.string().trim().min(1).max(200).optional(),
  })
  .passthrough();

type CommandIntent =
  | "plan_brief_qa"
  | "approve_workflow"
  | "list_workflows"
  | "get_workflow"
  | "list_playbooks"
  | "clarify";

type ToolName =
  | "workflow.planBriefQa"
  | "workflow.approveAndCreateDrafts"
  | "workflow.list"
  | "workflow.get"
  | "playbooks.list";

type CommandResponseInput = {
  ok?: boolean;
  intent: CommandIntent;
  tool: ToolName | null;
  result?: unknown;
  message: string;
  status?: number;
  contextSummary?: CommandContextSummary | null;
};

type JsonPostHandler = (request: Request) => Promise<Response>;

type CommandContextSummary = {
  query: string;
  summary: string;
  missing: string[];
  brand: {
    name: string | null;
    rules: number;
    ctas: number;
    phrases: number;
  };
  signals: {
    approval: boolean;
    sendOrSchedule: boolean;
    planning: boolean;
    noDiscount: boolean;
    vip: boolean;
    flow: boolean;
    campaign: boolean;
  };
  playbooks: Array<{
    id: string;
    name: string;
    type: PlaybookType;
    permissionLevel: string;
  }>;
  recentWorkflows: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
  }>;
  recentEligibleWorkflows: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    summary: unknown;
    recommendedNextAction: unknown;
  }>;
  referencedWorkflow: {
    id: string;
    type: string;
    status: string;
    createdAt: string;
  } | null;
  recentDrafts: number;
  relevantBriefs: number;
  campaignMemory: {
    totalCampaigns: number;
    bestSegmentByRevenue: string | null;
    bestCampaignTypeByRevenue: string | null;
  };
};

function compactTool(tool: AgentToolDefinition | null) {
  if (!tool) return null;
  return {
    name: tool.name,
    category: tool.category,
    permissionLevel: tool.permissionLevel,
    requiresApproval: tool.requiresApproval,
    riskLevel: tool.riskLevel,
    currentStatus: tool.currentStatus,
    backingRoute: tool.backingRoute,
  };
}

function commandResponse({
  ok = true,
  intent,
  tool,
  result = {},
  message,
  status = 200,
  contextSummary,
}: CommandResponseInput) {
  const toolDefinition = tool ? getAgentToolByName(tool) : null;

  return NextResponse.json(
    {
      ok,
      intent,
      tool,
      toolMetadata: compactTool(toolDefinition),
      ...(contextSummary ? { contextSummary } : {}),
      result,
      message,
    },
    { status },
  );
}

function normalized(message: string) {
  return message.toLowerCase().replace(/[’']/g, "'").trim();
}

function detectsSendOrScheduleIntent(message: string) {
  return /\b(send|sending|sent|schedule|scheduled|scheduling|launch|launching|go\s+live)\b/i.test(message);
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

function detectsPlanBriefQaIntent(message: string) {
  return (
    /\b(plan|prep|prepare|create|generate|build)\b.*\b(campaign|campaigns|retention|email|emails|flow|flows|lifecycle)\b/i.test(message) ||
    /\b(campaign|campaigns|retention\s+campaigns?)\b.*\b(next\s+week|tomorrow|this\s+week|no\s+discounts?)\b/i.test(message)
  );
}

function detectsListWorkflowIntent(message: string) {
  return (
    /\b(show|list|open|view|what)\b.*\b(recent|previous|past|workflow|workflows|runs?|made|created|yesterday)\b/i.test(message) ||
    /\bwhat\s+did\s+you\s+(make|create)\b/i.test(message)
  );
}

function detectsGetWorkflowIntent(message: string) {
  return /\b(open|show|view|get)\b.*\b(this\s+)?(workflow|run)\b/i.test(message);
}

function detectsListPlaybooksIntent(message: string) {
  return /\b(playbook|playbooks)\b/i.test(message);
}

function inferPlaybookType(message: string): PlaybookType | undefined {
  const text = normalized(message);
  if (/\bflows?\b/.test(text)) return "flow";
  if (/\bcampaigns?\b/.test(text)) return "campaign";
  return undefined;
}

function inferIntent(message: string, workflowId?: string): CommandIntent {
  if (detectsSendOrScheduleIntent(message)) return "clarify";
  if (detectsApprovalIntent(message)) return workflowId ? "approve_workflow" : "clarify";
  if (detectsListPlaybooksIntent(message)) return "list_playbooks";
  if (workflowId && detectsGetWorkflowIntent(message)) return "get_workflow";
  if (detectsListWorkflowIntent(message)) return "list_workflows";
  if (detectsPlanBriefQaIntent(message)) return "plan_brief_qa";
  return "clarify";
}

function detectsNoDiscountSignal(message: string, playbooks: WorklinPlaybook[] = []) {
  return (
    /\b(no|without|avoid)\b.*\b(discounts?|coupons?|sales?|markdowns?|promos?|promotions?|offers?)\b/i.test(message) ||
    playbooks.some((playbook) => playbook.id === "no_discount_education")
  );
}

function detectsVipSignal(message: string, playbooks: WorklinPlaybook[] = []) {
  return /\b(vip|early\s+access|loyalty|loyal|champions?)\b/i.test(message) ||
    playbooks.some((playbook) => playbook.id === "vip_early_access");
}

function detectsFlowSignal(message: string, playbooks: WorklinPlaybook[] = []) {
  return /\b(flows?|lifecycle|automation|welcome|abandon|cart|checkout|replenish|replenishment|winback|win\s+back)\b/i.test(message) ||
    playbooks.some((playbook) => playbook.type === "flow");
}

function detectsCampaignSignal(message: string, playbooks: WorklinPlaybook[] = []) {
  return /\b(campaigns?|emails?|retention)\b/i.test(message) ||
    playbooks.some((playbook) => playbook.type === "campaign");
}

function compactPlaybook(playbook: WorklinPlaybook) {
  return {
    id: playbook.id,
    name: playbook.name,
    type: playbook.type,
    permissionLevel: playbook.permissionLevel,
  };
}

function isRecentEligibleWorkflow(workflow: AgentContextResult["context"]["recentWorkflows"][number]) {
  return workflow.type === "plan-brief-qa" && workflow.status === "completed";
}

function compactContextSummary(result: AgentContextResult): CommandContextSummary {
  const context = result.context;
  const playbooks = context.playbooks.map(compactPlaybook);
  const recentWorkflows = context.recentWorkflows.slice(0, DEFAULT_WORKFLOW_LIMIT).map((workflow) => ({
    id: workflow.id,
    type: workflow.type,
    status: workflow.status,
    createdAt: workflow.createdAt,
  }));
  const recentEligibleWorkflows = context.recentWorkflows
    .filter(isRecentEligibleWorkflow)
    .map((workflow) => ({
      id: workflow.id,
      type: workflow.type,
      status: workflow.status,
      createdAt: workflow.createdAt,
      summary: workflow.summary ?? null,
      recommendedNextAction: workflow.recommendedNextAction ?? null,
    }));

  return {
    query: result.query,
    summary: result.summary,
    missing: result.missing,
    brand: {
      name: context.brand.profile?.brandName ?? null,
      rules: context.brand.rules.length,
      ctas: context.brand.ctas.length,
      phrases: context.brand.phrases.length,
    },
    signals: {
      approval: detectsApprovalIntent(result.query),
      sendOrSchedule: detectsSendOrScheduleIntent(result.query),
      planning: detectsPlanBriefQaIntent(result.query),
      noDiscount: detectsNoDiscountSignal(result.query, context.playbooks),
      vip: detectsVipSignal(result.query, context.playbooks),
      flow: detectsFlowSignal(result.query, context.playbooks),
      campaign: detectsCampaignSignal(result.query, context.playbooks),
    },
    playbooks,
    recentWorkflows,
    recentEligibleWorkflows,
    referencedWorkflow: context.referencedWorkflow
      ? {
          id: context.referencedWorkflow.id,
          type: context.referencedWorkflow.type,
          status: context.referencedWorkflow.status,
          createdAt: context.referencedWorkflow.createdAt,
        }
      : null,
    recentDrafts: context.recentDrafts.length,
    relevantBriefs: context.relevantBriefs.length,
    campaignMemory: {
      totalCampaigns: context.campaignMemory.summary.totalCampaigns,
      bestSegmentByRevenue: context.campaignMemory.bestSegmentByRevenue?.key ?? null,
      bestCampaignTypeByRevenue: context.campaignMemory.bestCampaignTypeByRevenue?.key ?? null,
    },
  };
}

function contextPlanningConstraints(contextSummary: CommandContextSummary) {
  const constraints = [];
  if (contextSummary.signals.noDiscount) constraints.push("no discounts");
  if (contextSummary.signals.vip) constraints.push("include one VIP campaign");

  for (const playbook of contextSummary.playbooks) {
    if (playbook.type === "flow") constraints.push(`consider ${playbook.name} flow playbook`);
    if (playbook.type === "campaign") constraints.push(`consider ${playbook.name} campaign playbook`);
  }

  return Array.from(new Set(constraints));
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

async function callJsonRoute(handler: JsonPostHandler, path: string, payload: unknown) {
  const response = await handler(
    new Request(`${COMMAND_ORIGIN}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function routePlanBriefQa(
  message: string,
  contextSummary: CommandContextSummary,
  parameters: IntentParameters = {},
) {
  const constraints = uniqueStrings([
    ...contextPlanningConstraints(contextSummary),
    ...(parameters.constraints ?? []),
  ]);
  const { response, data } = await callJsonRoute(
    planBriefQaWorkflow,
    "/api/agent/workflows/plan-brief-qa",
    {
      prompt: message,
      constraints,
      ...(parameters.campaignCount ? { campaignCount: parameters.campaignCount } : {}),
      ...(parameters.focus ? { focus: parameters.focus } : {}),
    },
  );

  return commandResponse({
    ok: response.ok && data?.ok !== false,
    intent: "plan_brief_qa",
    tool: "workflow.planBriefQa",
    result: data,
    message: response.ok
      ? "I created a Plan -> Brief -> QA workflow from your request."
      : "I could not create the Plan -> Brief -> QA workflow.",
    status: response.status,
    contextSummary,
  });
}

async function routeApproveWorkflow(message: string, workflowId: string, contextSummary: CommandContextSummary) {
  const { response, data } = await callJsonRoute(
    approveWorkflow,
    "/api/agent/commands/approve-workflow",
    { message, workflowId },
  );

  return commandResponse({
    ok: response.ok && data?.ok !== false,
    intent: "approve_workflow",
    tool: "workflow.approveAndCreateDrafts",
    result: data,
    message: response.ok
      ? "I routed your approval to draft creation for the eligible briefs. Nothing was scheduled or sent."
      : "I could not approve this workflow for draft creation.",
    status: response.status,
    contextSummary,
  });
}

async function routeListWorkflows(contextSummary: CommandContextSummary) {
  const workflows = await prisma.workflowRun.findMany({
    orderBy: { createdAt: "desc" },
    take: DEFAULT_WORKFLOW_LIMIT,
  });

  return commandResponse({
    intent: "list_workflows",
    tool: "workflow.list",
    result: {
      workflows: workflows.map(serializeWorkflowRunSummary),
      count: workflows.length,
    },
    message: workflows.length
      ? `Here are the ${workflows.length} most recent workflow runs.`
      : "There are no saved workflow runs yet.",
    contextSummary,
  });
}

async function routeGetWorkflow(workflowId: string, contextSummary: CommandContextSummary) {
  const id = cleanWorkflowId(workflowId);
  if (!id) {
    return commandResponse({
      intent: "clarify",
      tool: "workflow.get",
      result: { workflowId: null },
      message: "Which workflow should I open? Pass a workflowId.",
      contextSummary,
    });
  }

  const workflow = await prisma.workflowRun.findUnique({
    where: { id },
  });

  if (!workflow) {
    return commandResponse({
      ok: false,
      intent: "get_workflow",
      tool: "workflow.get",
      result: { workflowId: id },
      message: "Workflow run not found.",
      status: 404,
      contextSummary,
    });
  }

  return commandResponse({
    intent: "get_workflow",
    tool: "workflow.get",
    result: {
      workflow: serializeWorkflowRun(workflow),
    },
    message: "Here is the saved workflow run.",
    contextSummary,
  });
}

function routeListPlaybooks(
  message: string,
  contextSummary: CommandContextSummary,
  contextResult: AgentContextResult,
  playbookType?: PlaybookType,
) {
  const requestedType = playbookType ?? inferPlaybookType(message);
  const type = requestedType && isPlaybookType(requestedType) ? requestedType : undefined;
  const contextPlaybooks = contextResult.context.playbooks;
  const playbooks = contextPlaybooks.length ? contextPlaybooks : listPlaybooks(type);

  return commandResponse({
    intent: "list_playbooks",
    tool: "playbooks.list",
    result: {
      playbooks,
      count: playbooks.length,
      filters: type ? { type } : {},
      source: contextPlaybooks.length ? "agent_context" : "registry",
    },
    message: type
      ? `Here are the registered ${type} playbooks.`
      : "Here are the registered Worklin playbooks.",
    contextSummary,
  });
}

function routeClarify(message: string, contextSummary: CommandContextSummary, workflowId?: string) {
  if (detectsSendOrScheduleIntent(message)) {
    return commandResponse({
      intent: "clarify",
      tool: null,
      result: {
        reason: "draft_only_refusal",
        workflowId: workflowId ?? null,
      },
      message:
        "I cannot send or schedule campaigns from this command. Worklin is in draft-only mode; I can create Klaviyo drafts only after clear approval.",
      contextSummary,
    });
  }

  if (detectsApprovalIntent(message) && !workflowId) {
    return commandResponse({
      intent: "clarify",
      tool: "workflow.approveAndCreateDrafts",
      result: {
        reason: "missing_workflow_context",
        workflowId: null,
        recentEligibleWorkflows: contextSummary.recentEligibleWorkflows,
      },
      message:
        "Which completed workflow should I approve? Pass a workflowId so I create drafts for the right briefs.",
      contextSummary,
    });
  }

  if (detectsGetWorkflowIntent(message) && !workflowId) {
    return commandResponse({
      intent: "clarify",
      tool: "workflow.get",
      result: {
        reason: "missing_workflow_id",
        workflowId: null,
      },
      message: "Which workflow should I open? Pass a workflowId.",
      contextSummary,
    });
  }

  return commandResponse({
    intent: "clarify",
    tool: null,
    result: {
      supportedIntents: [
        "plan_brief_qa",
        "approve_workflow",
        "list_workflows",
        "get_workflow",
        "list_playbooks",
      ],
    },
    message:
      "I am not sure which Worklin action you want. Try asking me to plan campaigns, approve a workflow, show recent workflows, open a workflow, or list playbooks.",
    contextSummary,
  });
}

export async function POST(request: Request) {
  let parsedMessage: string | null = null;
  let parsedWorkflowId: string | undefined;

  try {
    const body = await request.json().catch(() => null);
    const parsed = commandSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          intent: "invalid_command",
          tool: null,
          result: {
            issues: parsed.error.issues.map((issue) => issue.message),
          },
          message: "message is required.",
        },
        { status: 400 },
      );
    }

    const { message, workflowId } = parsed.data;
    parsedMessage = message;
    parsedWorkflowId = workflowId;

    const contextResult = await buildAgentContext({
      message,
      workflowId,
      limit: DEFAULT_WORKFLOW_LIMIT,
    });
    const contextSummary = compactContextSummary(contextResult);
    const parsedIntentResult = await parseAgentIntent({
      message,
      workflowId,
      contextResult,
    });
    const parsedIntent = parsedIntentResult.intent;
    const resolvedWorkflowId = parsedIntent.parameters.workflowId ?? contextSummary.referencedWorkflow?.id ?? workflowId;
    const deterministicIntent = inferIntent(message, resolvedWorkflowId);
    const intent =
      parsedIntent.intent === "clarify" && deterministicIntent !== "clarify"
        ? deterministicIntent
        : parsedIntent.intent;

    if (parsedIntent.safety.sendOrScheduleRequested || detectsSendOrScheduleIntent(message)) {
      return routeClarify(message, contextSummary, resolvedWorkflowId);
    }

    if (intent === "plan_brief_qa") return routePlanBriefQa(message, contextSummary, parsedIntent.parameters);
    if (intent === "approve_workflow" && resolvedWorkflowId) {
      return routeApproveWorkflow(message, resolvedWorkflowId, contextSummary);
    }
    if (intent === "list_workflows") return routeListWorkflows(contextSummary);
    if (intent === "get_workflow" && resolvedWorkflowId) return routeGetWorkflow(resolvedWorkflowId, contextSummary);
    if (intent === "list_playbooks") {
      return routeListPlaybooks(message, contextSummary, contextResult, parsedIntent.parameters.playbookType);
    }

    return routeClarify(message, contextSummary, resolvedWorkflowId);
  } catch (error) {
    if (error instanceof Error && error.message === "WORKFLOW_NOT_FOUND") {
      const intent = parsedMessage ? inferIntent(parsedMessage, parsedWorkflowId) : "get_workflow";

      return commandResponse({
        ok: false,
        intent: intent === "approve_workflow" ? "approve_workflow" : "get_workflow",
        tool: intent === "approve_workflow" ? "workflow.approveAndCreateDrafts" : "workflow.get",
        result: {
          workflowId: parsedWorkflowId ?? null,
        },
        message: "Workflow run not found.",
        status: 404,
      });
    }

    console.error("POST /api/agent/command failed", error);
    return NextResponse.json(
      {
        ok: false,
        intent: "command_failed",
        tool: null,
        result: {},
        message: "Failed to route agent command",
      },
      { status: 500 },
    );
  }
}
