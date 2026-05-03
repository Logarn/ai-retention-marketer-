export const AUDIT_INSIGHT_TYPES = [
  "build",
  "fix",
  "scale",
  "audit",
  "classify",
  "cleanup",
  "monitor",
  "pause",
  "protect",
] as const;

export const AUDIT_SEVERITIES = [
  "good",
  "opportunity",
  "warning",
  "issue",
  "critical",
  "unknown",
] as const;

export const AUDIT_CONFIDENCE_LEVELS = [
  "strong",
  "directional",
  "weak",
] as const;

export const AUDIT_DOMAINS = [
  "product",
  "campaign",
  "flow",
  "segment",
  "lifecycle",
  "deliverability",
  "creative",
  "offer",
  "revenue",
] as const;

export const AUDIT_EVIDENCE_TYPES = [
  "metric",
  "sample_size",
  "playbook",
  "structure",
  "performance",
  "product",
  "segment",
  "content",
  "caveat",
] as const;

export const AUDIT_CHART_HINT_TYPES = [
  "bar",
  "line",
  "table",
  "scorecard",
  "funnel",
  "heatmap",
  "pie",
] as const;

export type AuditInsightType = (typeof AUDIT_INSIGHT_TYPES)[number];
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];
export type AuditConfidence = (typeof AUDIT_CONFIDENCE_LEVELS)[number];
export type AuditDomain = (typeof AUDIT_DOMAINS)[number];
export type AuditEvidenceType = (typeof AUDIT_EVIDENCE_TYPES)[number];
export type AuditChartHintType = (typeof AUDIT_CHART_HINT_TYPES)[number];

export type AuditEvidence = {
  id?: string;
  type: AuditEvidenceType;
  label: string;
  value?: string | number | boolean | null;
  metricKey?: string;
  entityId?: string;
  source?: string;
  timeframe?: string;
  weight?: number;
  description?: string;
};

export type AuditCaveat = {
  message: string;
  evidenceType?: AuditEvidenceType;
  severity?: AuditSeverity;
};

export type AuditRecommendedAction = {
  id?: string;
  label: string;
  description?: string;
  actionType?: AuditInsightType;
  owner?: string;
  priority?: "high" | "medium" | "low";
  estimatedImpact?: string;
  requiresApproval?: boolean;
};

export type AuditAffectedEntity = {
  id: string;
  type:
    | "product"
    | "campaign"
    | "flow"
    | "segment"
    | "message"
    | "playbook"
    | "workflow"
    | "metric"
    | "unknown";
  name: string;
  source?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type AuditChartHint = {
  type: AuditChartHintType;
  title: string;
  metricKeys: string[];
  entityIds: string[];
  description?: string;
};

export type AuditInsight = {
  id: string;
  title: string;
  summary: string;
  domain: AuditDomain;
  insightType: AuditInsightType;
  severity: AuditSeverity;
  confidence: AuditConfidence;
  priorityScore: number;
  evidence: AuditEvidence[];
  caveats: AuditCaveat[];
  recommendedActions: AuditRecommendedAction[];
  affectedEntities: AuditAffectedEntity[];
  chartHints: AuditChartHint[];
  createdAt: string;
};

export type AuditInsightInput = {
  id?: string;
  title: string;
  summary: string;
  domain?: AuditDomain | string | null;
  insightType?: AuditInsightType | string | null;
  severity?: AuditSeverity | string | null;
  confidence?: AuditConfidence | string | null;
  priorityScore?: number | null;
  evidence?: AuditEvidence[];
  caveats?: AuditCaveat[];
  recommendedActions?: AuditRecommendedAction[];
  affectedEntities?: AuditAffectedEntity[];
  chartHints?: AuditChartHint[];
  createdAt?: string | Date | null;
};

export type AuditInsightSummary = {
  total: number;
  byDomain: Record<AuditDomain, number>;
  bySeverity: Record<AuditSeverity, number>;
  topPriorities: Array<{
    id: string;
    title: string;
    domain: AuditDomain;
    insightType: AuditInsightType;
    severity: AuditSeverity;
    confidence: AuditConfidence;
    priorityScore: number;
  }>;
  executiveSummary: string;
};
