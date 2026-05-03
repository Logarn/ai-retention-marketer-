import { NextResponse } from "next/server";
import { z } from "zod";
import { POST as approveWorkflow } from "@/app/api/agent/commands/approve-workflow/route";
import {
  cleanWorkflowId,
  serializeWorkflowRun,
  serializeWorkflowRunSummary,
} from "@/app/api/agent/workflows/shared";
import { POST as planBriefQaWorkflow } from "@/app/api/agent/workflows/plan-brief-qa/route";
import { getAgentToolByName } from "@/lib/agent/tools/registry";
import { prisma } from "@/lib/prisma";
import { isPlaybookType, listPlaybooks } from "@/lib/playbooks";
import type { AgentToolDefinition } from "@/lib/agent/tools/types";
import type { PlaybookType } from "@/lib/playbooks";

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
};

type JsonPostHandler = (request: Request) => Promise<Response>;

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
}: CommandResponseInput) {
  const toolDefinition = tool ? getAgentToolByName(tool) : null;

  return NextResponse.json(
    {
      ok,
      intent,
      tool,
      toolMetadata: compactTool(toolDefinition),
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
    /\b(plan|prep|prepare|create|generate|build)\b.*\b(campaign|campaigns|retention|email|emails)\b/i.test(message) ||
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

async function routePlanBriefQa(message: string) {
  const { response, data } = await callJsonRoute(
    planBriefQaWorkflow,
    "/api/agent/workflows/plan-brief-qa",
    { prompt: message },
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
  });
}

async function routeApproveWorkflow(message: string, workflowId: string) {
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
  });
}

async function routeListWorkflows() {
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
  });
}

async function routeGetWorkflow(workflowId: string) {
  const id = cleanWorkflowId(workflowId);
  if (!id) {
    return commandResponse({
      intent: "clarify",
      tool: "workflow.get",
      result: { workflowId: null },
      message: "Which workflow should I open? Pass a workflowId.",
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
    });
  }

  return commandResponse({
    intent: "get_workflow",
    tool: "workflow.get",
    result: {
      workflow: serializeWorkflowRun(workflow),
    },
    message: "Here is the saved workflow run.",
  });
}

function routeListPlaybooks(message: string) {
  const requestedType = inferPlaybookType(message);
  const type = requestedType && isPlaybookType(requestedType) ? requestedType : undefined;
  const playbooks = listPlaybooks(type);

  return commandResponse({
    intent: "list_playbooks",
    tool: "playbooks.list",
    result: {
      playbooks,
      count: playbooks.length,
      filters: type ? { type } : {},
    },
    message: type
      ? `Here are the registered ${type} playbooks.`
      : "Here are the registered Worklin playbooks.",
  });
}

function routeClarify(message: string, workflowId?: string) {
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
    });
  }

  if (detectsApprovalIntent(message) && !workflowId) {
    return commandResponse({
      intent: "clarify",
      tool: "workflow.approveAndCreateDrafts",
      result: {
        reason: "missing_workflow_context",
        workflowId: null,
      },
      message:
        "Which completed workflow should I approve? Pass a workflowId so I create drafts for the right briefs.",
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
  });
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
    const intent = inferIntent(message, workflowId);

    if (intent === "plan_brief_qa") return routePlanBriefQa(message);
    if (intent === "approve_workflow" && workflowId) return routeApproveWorkflow(message, workflowId);
    if (intent === "list_workflows") return routeListWorkflows();
    if (intent === "get_workflow" && workflowId) return routeGetWorkflow(workflowId);
    if (intent === "list_playbooks") return routeListPlaybooks(message);

    return routeClarify(message, workflowId);
  } catch (error) {
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
