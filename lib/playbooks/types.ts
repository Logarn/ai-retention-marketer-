export type PlaybookType = "flow" | "campaign";

export type PermissionLevel = "manual" | "copilot" | "draft_only";

export type FlowPlaybookCategory = "core" | "secondary" | "conditional" | "infrastructure";

export type FlowPlaybookDetailLevel = "full" | "partial" | "placeholder";

export type FlowPlaybookPriorityDefault = "high" | "medium" | "low" | "conditional";

export type FlowPlannerMatch = {
  aliases: string[];
  triggerKeywords?: string[];
};

export type FlowSequenceStep = {
  step: number;
  name: string;
  timing: string;
  objective: string;
  contentAngle: string;
};

export type CampaignPlaybook = {
  id: string;
  name: string;
  type: "campaign";
  campaignType: string;
  description: string;
  objective: string;
  targetAudience: string;
  contentSuggestions: string[];
  keyMetric: string;
  offerRules: string[];
  qaRisks: string[];
  requiredData: string[];
  permissionLevel: PermissionLevel;
  plannerMatch: {
    campaignTypes: string[];
    titleKeywords?: string[];
    requiresNoDiscount?: boolean;
  };
};

export type FlowPlaybook = {
  id: string;
  name: string;
  type: "flow";
  category: FlowPlaybookCategory;
  detailLevel: FlowPlaybookDetailLevel;
  priorityDefault: FlowPlaybookPriorityDefault;
  trigger: string;
  flowFilters: string[];
  description: string;
  objective: string;
  targetAudience: string;
  sequence: FlowSequenceStep[];
  timing: string[];
  contentSuggestions: string[];
  keyMetric: string;
  offerRules: string[];
  qaRisks: string[];
  requiredData: string[];
  permissionLevel: PermissionLevel;
  recommendedWhen: string[];
  conditionalRequirements: string[];
  plannerMatch: FlowPlannerMatch;
};

export type WorklinPlaybook = CampaignPlaybook | FlowPlaybook;
