import type { WorklinPlaybook } from "@/lib/playbooks";

export type AgentContextRequest = {
  message: string;
  workflowId?: string | null;
  limit?: number;
};

export type BrandContextSnippet = {
  profile: {
    id: string;
    storeId: string;
    brandName: string | null;
    tagline: string | null;
    industry: string | null;
    niche: string | null;
    usp: string | null;
    voiceDescription: string | null;
    preferredLength: string | null;
    discountPhilosophy: string | null;
  } | null;
  rules: Array<{
    id: string;
    rule: string;
    type: string;
    priority: string;
  }>;
  ctas: Array<{
    id: string;
    text: string;
    isPreferred: boolean;
  }>;
  phrases: Array<{
    id: string;
    phrase: string;
    type: string;
  }>;
};

export type CampaignMemoryContext = {
  summary: {
    totalCampaigns: number;
    totalRevenue: number;
    totalOrders: number;
    averageOpenRate: number | null;
    averageClickRate: number | null;
    averageConversionRate: number | null;
  };
  bestSegmentByRevenue: { key: string; revenue: number; campaigns: number } | null;
  bestCampaignTypeByRevenue: { key: string; revenue: number; campaigns: number } | null;
  topCampaignByClickRate: CompactCampaignMemory | null;
  topCampaignByRevenue: CompactCampaignMemory | null;
  mostRecentLesson: {
    id: string;
    campaignId: string;
    name: string;
    sentAt: string;
    lesson: string | null;
  } | null;
};

export type CompactCampaignMemory = {
  id: string;
  campaignId: string;
  name: string;
  campaignType: string | null;
  segment: string | null;
  subjectLine: string | null;
  sentAt: string;
  openRate: number | null;
  clickRate: number | null;
  conversionRate: number | null;
  revenue: number;
  orders: number | null;
  winningInsight: string | null;
};

export type WorkflowContextSummary = {
  id: string;
  type: string;
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  summary?: unknown;
  recommendedNextAction?: unknown;
};

export type ReferencedWorkflowContext = WorkflowContextSummary & {
  input: unknown;
  output: unknown;
};

export type KlaviyoDraftContext = {
  id: string;
  briefId: string;
  klaviyoCampaignId: string;
  klaviyoTemplateId: string;
  klaviyoMessageId: string | null;
  campaignName: string;
  status: string;
  createdAt: string;
  briefTitle: string | null;
};

export type RelevantBriefContext = {
  id: string;
  planItemId: string | null;
  planId: string | null;
  title: string;
  campaignType: string;
  segment: string;
  goal: string;
  status: string;
  primaryProduct: string | null;
  cta: string | null;
  createdAt: string;
  updatedAt: string;
  latestQa: {
    id: string;
    status: string;
    score: number;
    createdAt: string;
  } | null;
};

export type AgentContextPackage = {
  brand: BrandContextSnippet;
  playbooks: WorklinPlaybook[];
  campaignMemory: CampaignMemoryContext;
  recentWorkflows: WorkflowContextSummary[];
  referencedWorkflow: ReferencedWorkflowContext | null;
  recentDrafts: KlaviyoDraftContext[];
  relevantBriefs: RelevantBriefContext[];
};

export type AgentContextResult = {
  ok: true;
  query: string;
  context: AgentContextPackage;
  summary: string;
  missing: string[];
};
