export type AgentToolCategory =
  | "workflow"
  | "flows"
  | "klaviyo"
  | "playbooks"
  | "memory"
  | "brain";

export type AgentToolPermissionLevel =
  | "read"
  | "generate"
  | "external_draft"
  | "external_live_action";

export type AgentToolRiskLevel = "low" | "medium" | "high" | "critical";

export type AgentToolStatus = "available" | "planned" | "disabled";

export type AgentToolInputProperty = {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
  items?: string;
};

export type AgentToolInputSchema = {
  type: "object";
  description: string;
  required?: string[];
  properties: Record<string, AgentToolInputProperty>;
};

export type AgentToolDefinition = {
  name: string;
  description: string;
  category: AgentToolCategory;
  inputSchema: AgentToolInputSchema;
  outputDescription: string;
  permissionLevel: AgentToolPermissionLevel;
  requiresApproval: boolean;
  riskLevel: AgentToolRiskLevel;
  currentStatus: AgentToolStatus;
  backingRoute?: string;
  handlerReference?: string;
  notes?: string[];
};

export type AgentToolFilters = {
  category?: AgentToolCategory;
  permissionLevel?: AgentToolPermissionLevel;
  requiresApproval?: boolean;
};
