import { Prisma } from "@prisma/client";
import { DEFAULT_STORE_ID } from "@/app/api/brain/profile/store";
import { prisma } from "@/lib/prisma";
import {
  getPlaybookById,
  listPlaybooks,
  type PlaybookType,
  type WorklinPlaybook,
} from "@/lib/playbooks";
import type {
  AgentContextPackage,
  AgentContextRequest,
  AgentContextResult,
  BrandContextSnippet,
  CampaignMemoryContext,
  CompactCampaignMemory,
  KlaviyoDraftContext,
  ReferencedWorkflowContext,
  RelevantBriefContext,
  WorkflowContextSummary,
} from "@/lib/agent/context/types";

const DEFAULT_CONTEXT_LIMIT = 5;
const MAX_CONTEXT_LIMIT = 20;

type MemoryRow = Awaited<ReturnType<typeof prisma.campaignMemory.findMany>>[number];
type WorkflowRow = Awaited<ReturnType<typeof prisma.workflowRun.findMany>>[number];
type WorkflowSingle = Awaited<ReturnType<typeof prisma.workflowRun.findUnique>>;
type DraftRow = Prisma.KlaviyoDraftGetPayload<{
  include: {
    brief: {
      select: {
        title: true;
      };
    };
  };
}>;
type BriefRow = Prisma.CampaignBriefGetPayload<{
  include: {
    planItem: {
      select: {
        planId: true;
      };
    };
    qaChecks: {
      orderBy: {
        createdAt: "desc";
      };
      take: 1;
      select: {
        id: true;
        status: true;
        score: true;
        createdAt: true;
      };
    };
  };
}>;

function normalizeLimit(value: number | null | undefined) {
  if (!value || !Number.isInteger(value) || value < 1) return DEFAULT_CONTEXT_LIMIT;
  return Math.min(value, MAX_CONTEXT_LIMIT);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[’']/g, "'").trim();
}

function average(values: number[]) {
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

function sum(values: number[]) {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(2));
}

function topBy<T>(items: T[], getValue: (item: T) => number | null | undefined) {
  return items.reduce<T | null>((best, current) => {
    const value = getValue(current);
    if (value === null || value === undefined || !Number.isFinite(value)) return best;
    if (!best) return current;
    const bestValue = getValue(best);
    return bestValue === null || bestValue === undefined || value > bestValue ? current : best;
  }, null);
}

function groupByRevenue(memories: MemoryRow[], key: "segment" | "campaignType") {
  const groups = new Map<string, { key: string; revenue: number; campaigns: number }>();
  for (const memory of memories) {
    const groupKey = memory[key] || "unknown";
    const current = groups.get(groupKey) ?? { key: groupKey, revenue: 0, campaigns: 0 };
    current.revenue += memory.revenue;
    current.campaigns += 1;
    groups.set(groupKey, current);
  }

  const ranked = Array.from(groups.values())
    .map((group) => ({ ...group, revenue: Number(group.revenue.toFixed(2)) }))
    .sort((a, b) => b.revenue - a.revenue);

  return ranked[0] ?? null;
}

function compactCampaign(memory: MemoryRow | null): CompactCampaignMemory | null {
  if (!memory) return null;
  return {
    id: memory.id,
    campaignId: memory.campaignId,
    name: memory.name,
    campaignType: memory.campaignType,
    segment: memory.segment,
    subjectLine: memory.subjectLine,
    sentAt: memory.sentAt.toISOString(),
    openRate: memory.openRate,
    clickRate: memory.clickRate,
    conversionRate: memory.conversionRate,
    revenue: memory.revenue,
    orders: memory.orders,
    winningInsight: memory.winningInsight,
  };
}

function safeRecord(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function serializeWorkflowSummary(workflow: WorkflowRow | NonNullable<WorkflowSingle>): WorkflowContextSummary {
  const output = safeRecord(workflow.output);
  return {
    id: workflow.id,
    type: workflow.type,
    status: workflow.status,
    error: workflow.error,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
    summary: output.summary,
    recommendedNextAction: output.recommendedNextAction,
  };
}

function serializeReferencedWorkflow(workflow: NonNullable<WorkflowSingle>): ReferencedWorkflowContext {
  return {
    ...serializeWorkflowSummary(workflow),
    input: workflow.input,
    output: workflow.output,
  };
}

function serializeDraft(draft: DraftRow): KlaviyoDraftContext {
  return {
    id: draft.id,
    briefId: draft.briefId,
    klaviyoCampaignId: draft.klaviyoCampaignId,
    klaviyoTemplateId: draft.klaviyoTemplateId,
    klaviyoMessageId: draft.klaviyoMessageId,
    campaignName: draft.campaignName,
    status: draft.status,
    createdAt: draft.createdAt.toISOString(),
    briefTitle: draft.brief?.title ?? null,
  };
}

function serializeBrief(brief: BriefRow): RelevantBriefContext {
  const latestQa = brief.qaChecks[0] ?? null;
  return {
    id: brief.id,
    planItemId: brief.planItemId,
    planId: brief.planItem?.planId ?? null,
    title: brief.title,
    campaignType: brief.campaignType,
    segment: brief.segment,
    goal: brief.goal,
    status: brief.status,
    primaryProduct: brief.primaryProduct,
    cta: brief.cta,
    createdAt: brief.createdAt.toISOString(),
    updatedAt: brief.updatedAt.toISOString(),
    latestQa: latestQa
      ? {
          id: latestQa.id,
          status: latestQa.status,
          score: latestQa.score,
          createdAt: latestQa.createdAt.toISOString(),
        }
      : null,
  };
}

function hasAny(message: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(message));
}

function maybeAddPlaybook(playbooks: Map<string, WorklinPlaybook>, id: string) {
  const playbook = getPlaybookById(id);
  if (playbook) playbooks.set(playbook.id, playbook);
}

function relevantPlaybooksForMessage(message: string, limit: number) {
  const text = normalizeText(message);
  const selected = new Map<string, WorklinPlaybook>();
  const mentionsFlow = hasAny(text, [/\bflows?\b/, /\blifecycle\b/, /\bautomation\b/]);
  const mentionsCampaign = hasAny(text, [/\bcampaigns?\b/, /\bemails?\b/, /\bretention\b/]);
  let matchedSpecificFlow = false;
  let matchedSpecificCampaign = false;

  if (/\bwelcome\b/.test(text)) {
    maybeAddPlaybook(selected, "welcome_series");
    matchedSpecificFlow = true;
  }
  if (/\bsite\s+abandon|site\s+abandonment\b/.test(text)) {
    maybeAddPlaybook(selected, "site_abandon");
    matchedSpecificFlow = true;
  }
  if (/\bbrowse\s+abandon|browse\s+abandonment\b/.test(text)) {
    maybeAddPlaybook(selected, "browse_abandon");
    matchedSpecificFlow = true;
  }
  if (/\bcart\b/.test(text)) {
    maybeAddPlaybook(selected, "cart_abandon");
    matchedSpecificFlow = true;
  }
  if (/\bcheckout\b/.test(text)) {
    maybeAddPlaybook(selected, "checkout_abandon");
    matchedSpecificFlow = true;
  }
  if (/\breplenish|replenishment|restock\b/.test(text)) {
    maybeAddPlaybook(selected, "replenishment");
    matchedSpecificFlow = true;
  }
  if (/\bwinback|win\s+back|at[-\s]?risk|lapsed|churn\b/.test(text)) {
    maybeAddPlaybook(selected, "winback");
    maybeAddPlaybook(selected, "at_risk_winback");
    matchedSpecificFlow = true;
    matchedSpecificCampaign = true;
  }
  if (/\bvip|early\s+access|loyal|champions?\b/.test(text)) {
    maybeAddPlaybook(selected, "vip_early_access");
    matchedSpecificCampaign = true;
  }
  if (/\bproduct|spotlight|merchandise|sku\b/.test(text)) {
    maybeAddPlaybook(selected, "product_spotlight");
    matchedSpecificCampaign = true;
  }
  if (/\bno\s+discount|without\s+discount|avoid\s+discount|education|educational\b/.test(text)) {
    maybeAddPlaybook(selected, "no_discount_education");
    matchedSpecificCampaign = true;
  }

  if (mentionsFlow && !matchedSpecificFlow) {
    for (const playbook of listPlaybooks("flow")) selected.set(playbook.id, playbook);
  }
  if (mentionsCampaign && !matchedSpecificCampaign) {
    for (const playbook of listPlaybooks("campaign")) selected.set(playbook.id, playbook);
  }

  return Array.from(selected.values()).slice(0, limit);
}

function briefWhereForMessage(message: string): Prisma.CampaignBriefWhereInput | null {
  const text = normalizeText(message);
  const OR: Prisma.CampaignBriefWhereInput[] = [];

  if (/\bvip|early\s+access|loyal|champions?\b/.test(text)) {
    OR.push({ campaignType: { contains: "vip", mode: "insensitive" } });
    OR.push({ segment: { contains: "champion", mode: "insensitive" } });
  }
  if (/\bproduct|spotlight|sku|merchandise\b/.test(text)) {
    OR.push({ campaignType: { contains: "product", mode: "insensitive" } });
  }
  if (/\bat[-\s]?risk|winback|win\s+back|lapsed|churn\b/.test(text)) {
    OR.push({ campaignType: { contains: "winback", mode: "insensitive" } });
    OR.push({ segment: { contains: "risk", mode: "insensitive" } });
  }
  if (/\bdraft|klaviyo|approval|approve|approved\b/.test(text)) {
    OR.push({ klaviyoDrafts: { some: {} } });
  }

  if (OR.length) return { OR };
  if (/\bbriefs?|campaigns?|emails?|drafts?|klaviyo|approval|approve|approved\b/.test(text)) {
    return {};
  }
  return null;
}

function summaryForContext(context: AgentContextPackage) {
  const parts = [
    context.brand.profile?.brandName
      ? `Brand context loaded for ${context.brand.profile.brandName}.`
      : "Brand profile is not configured.",
    `${context.playbooks.length} relevant playbook${context.playbooks.length === 1 ? "" : "s"} selected.`,
    `${context.recentWorkflows.length} recent workflow${context.recentWorkflows.length === 1 ? "" : "s"} included.`,
    context.referencedWorkflow ? "Referenced workflow included." : "No referenced workflow included.",
    `${context.recentDrafts.length} recent Klaviyo draft${context.recentDrafts.length === 1 ? "" : "s"} included.`,
    `${context.relevantBriefs.length} relevant brief${context.relevantBriefs.length === 1 ? "" : "s"} included.`,
  ];
  return parts.join(" ");
}

async function loadBrandContext(missing: string[]): Promise<BrandContextSnippet> {
  const profile = await prisma.brandProfile.findUnique({
    where: { storeId: DEFAULT_STORE_ID },
    select: {
      id: true,
      storeId: true,
      brandName: true,
      tagline: true,
      industry: true,
      niche: true,
      usp: true,
      voiceDescription: true,
      preferredLength: true,
      discountPhilosophy: true,
    },
  });

  const [rules, ctas, phrases] = await Promise.all([
    prisma.brandRule.findMany({
      where: { storeId: DEFAULT_STORE_ID },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        rule: true,
        type: true,
        priority: true,
      },
    }),
    prisma.brandCTA.findMany({
      where: { storeId: DEFAULT_STORE_ID },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        text: true,
        isPreferred: true,
      },
    }),
    prisma.brandPhrase.findMany({
      where: { storeId: DEFAULT_STORE_ID },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        phrase: true,
        type: true,
      },
    }),
  ]);

  if (!profile) missing.push("brand.profile");

  return {
    profile,
    rules,
    ctas,
    phrases,
  };
}

async function loadCampaignMemoryContext(): Promise<CampaignMemoryContext> {
  const memories = await prisma.campaignMemory.findMany({
    orderBy: { sentAt: "desc" },
    take: 500,
  });

  const totalRevenue = sum(memories.map((memory) => memory.revenue));
  const totalOrders = memories.reduce((count, memory) => count + (memory.orders ?? 0), 0);
  const topClickCampaign = topBy(memories, (memory) => memory.clickRate);
  const topRevenueCampaign = topBy(memories, (memory) => memory.revenue);
  const mostRecentLesson =
    memories.find((memory) => memory.winningInsight || memory.notes) ?? null;

  return {
    summary: {
      totalCampaigns: memories.length,
      totalRevenue,
      totalOrders,
      averageOpenRate: average(
        memories
          .map((memory) => memory.openRate)
          .filter((rate): rate is number => typeof rate === "number"),
      ),
      averageClickRate: average(
        memories
          .map((memory) => memory.clickRate)
          .filter((rate): rate is number => typeof rate === "number"),
      ),
      averageConversionRate: average(
        memories
          .map((memory) => memory.conversionRate)
          .filter((rate): rate is number => typeof rate === "number"),
      ),
    },
    bestSegmentByRevenue: groupByRevenue(memories, "segment"),
    bestCampaignTypeByRevenue: groupByRevenue(memories, "campaignType"),
    topCampaignByClickRate: compactCampaign(topClickCampaign),
    topCampaignByRevenue: compactCampaign(topRevenueCampaign),
    mostRecentLesson: mostRecentLesson
      ? {
          id: mostRecentLesson.id,
          campaignId: mostRecentLesson.campaignId,
          name: mostRecentLesson.name,
          sentAt: mostRecentLesson.sentAt.toISOString(),
          lesson: mostRecentLesson.winningInsight ?? mostRecentLesson.notes,
        }
      : null,
  };
}

async function loadReferencedWorkflow(workflowId: string | null | undefined) {
  const cleaned = workflowId?.trim();
  if (!cleaned) return null;
  return prisma.workflowRun.findUnique({
    where: { id: cleaned },
  });
}

function relevantWorkflowType(message: string) {
  return /\bworkflow|workflows|runs?|made|created|approval|approve|draft|klaviyo\b/i.test(message);
}

async function loadRecentWorkflows(message: string, limit: number) {
  const shouldLoad = relevantWorkflowType(message) || /\bplan|campaign|brief|qa\b/i.test(message);
  if (!shouldLoad) return [];

  const workflows = await prisma.workflowRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return workflows.map(serializeWorkflowSummary);
}

async function loadRecentDrafts(message: string, limit: number) {
  if (!/\bdrafts?|klaviyo|approval|approve|approved|ship\b/i.test(message)) return [];

  const drafts = await prisma.klaviyoDraft.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      brief: {
        select: {
          title: true,
        },
      },
    },
  });
  return drafts.map(serializeDraft);
}

async function loadRelevantBriefs(message: string, limit: number) {
  const where = briefWhereForMessage(message);
  if (!where) return [];

  const briefs = await prisma.campaignBrief.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      planItem: {
        select: {
          planId: true,
        },
      },
      qaChecks: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          status: true,
          score: true,
          createdAt: true,
        },
      },
    },
  });
  return briefs.map(serializeBrief);
}

function missingForEmptyContext(context: AgentContextPackage, missing: string[]) {
  if (!context.playbooks.length) missing.push("playbooks.relevant");
  if (context.campaignMemory.summary.totalCampaigns === 0) missing.push("campaignMemory.records");
  if (!context.recentWorkflows.length) missing.push("recentWorkflows");
  if (!context.recentDrafts.length) missing.push("recentDrafts");
  if (!context.relevantBriefs.length) missing.push("relevantBriefs");
  return Array.from(new Set(missing));
}

export async function buildAgentContext(input: AgentContextRequest): Promise<AgentContextResult> {
  const query = input.message.trim();
  const limit = normalizeLimit(input.limit);
  const missing: string[] = [];
  const referencedWorkflowRow = await loadReferencedWorkflow(input.workflowId);

  if (input.workflowId && !referencedWorkflowRow) {
    throw new Error("WORKFLOW_NOT_FOUND");
  }

  const [brand, campaignMemory, recentWorkflows, recentDrafts, relevantBriefs] = await Promise.all([
    loadBrandContext(missing),
    loadCampaignMemoryContext(),
    loadRecentWorkflows(query, limit),
    loadRecentDrafts(query, limit),
    loadRelevantBriefs(query, limit),
  ]);
  const playbooks = relevantPlaybooksForMessage(query, limit);
  const referencedWorkflow = referencedWorkflowRow
    ? serializeReferencedWorkflow(referencedWorkflowRow)
    : null;
  const context: AgentContextPackage = {
    brand,
    playbooks,
    campaignMemory,
    recentWorkflows,
    referencedWorkflow,
    recentDrafts,
    relevantBriefs,
  };

  return {
    ok: true,
    query,
    context,
    summary: summaryForContext(context),
    missing: missingForEmptyContext(context, missing),
  };
}
