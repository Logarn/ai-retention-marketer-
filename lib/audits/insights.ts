import {
  AUDIT_CHART_HINT_TYPES,
  AUDIT_CONFIDENCE_LEVELS,
  AUDIT_DOMAINS,
  AUDIT_INSIGHT_TYPES,
  AUDIT_SEVERITIES,
  type AuditAffectedEntity,
  type AuditCaveat,
  type AuditChartHint,
  type AuditChartHintType,
  type AuditConfidence,
  type AuditDomain,
  type AuditEvidence,
  type AuditInsight,
  type AuditInsightInput,
  type AuditInsightSummary,
  type AuditInsightType,
  type AuditRecommendedAction,
  type AuditSeverity,
} from "@/lib/audits/types";

const SEVERITY_WEIGHT: Record<AuditSeverity, number> = {
  critical: 95,
  issue: 82,
  warning: 66,
  opportunity: 54,
  unknown: 42,
  good: 24,
};

const CONFIDENCE_WEIGHT: Record<AuditConfidence, number> = {
  strong: 8,
  directional: 0,
  weak: -10,
};

const INSIGHT_TYPE_WEIGHT: Record<AuditInsightType, number> = {
  build: 6,
  fix: 7,
  scale: 3,
  audit: 2,
  classify: 1,
  cleanup: 4,
  monitor: 0,
  pause: 5,
  protect: 4,
};

function includesValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function normalizeKey(value: unknown) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[_\s-]+/g, "_").trim()
    : "";
}

function clampPriority(value: number) {
  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72);
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function stableInsightId(input: {
  title: string;
  domain: AuditDomain;
  insightType: AuditInsightType;
}) {
  const slug = slugify(input.title) || "audit-insight";
  return `${input.domain}_${input.insightType}_${slug}_${stableHash(`${input.domain}:${input.insightType}:${input.title}`)}`;
}

function emptyDomainCounts(): Record<AuditDomain, number> {
  return Object.fromEntries(AUDIT_DOMAINS.map((domain) => [domain, 0])) as Record<AuditDomain, number>;
}

function emptySeverityCounts(): Record<AuditSeverity, number> {
  return Object.fromEntries(AUDIT_SEVERITIES.map((severity) => [severity, 0])) as Record<AuditSeverity, number>;
}

export function normalizeConfidence(
  value: AuditConfidence | string | null | undefined,
  fallback: AuditConfidence = "directional",
): AuditConfidence {
  const normalized = normalizeKey(value);
  return includesValue(AUDIT_CONFIDENCE_LEVELS, normalized) ? normalized : fallback;
}

export function normalizeSeverity(
  value: AuditSeverity | string | null | undefined,
  fallback: AuditSeverity = "unknown",
): AuditSeverity {
  const normalized = normalizeKey(value);
  return includesValue(AUDIT_SEVERITIES, normalized) ? normalized : fallback;
}

function normalizeDomain(value: AuditDomain | string | null | undefined): AuditDomain {
  const normalized = normalizeKey(value);
  return includesValue(AUDIT_DOMAINS, normalized) ? normalized : "lifecycle";
}

function normalizeInsightType(value: AuditInsightType | string | null | undefined): AuditInsightType {
  const normalized = normalizeKey(value);
  return includesValue(AUDIT_INSIGHT_TYPES, normalized) ? normalized : "audit";
}

function normalizeCreatedAt(value: string | Date | null | undefined) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function normalizeEvidence(evidence: AuditEvidence[] | undefined): AuditEvidence[] {
  return (evidence ?? []).filter((item) => item.label?.trim()).map((item) => ({
    ...item,
    type: item.type,
    label: item.label.trim(),
  }));
}

function normalizeCaveats(caveats: AuditCaveat[] | undefined): AuditCaveat[] {
  return (caveats ?? []).filter((item) => item.message?.trim()).map((item) => ({
    ...item,
    message: item.message.trim(),
    severity: item.severity ? normalizeSeverity(item.severity) : undefined,
  }));
}

function normalizeActions(actions: AuditRecommendedAction[] | undefined): AuditRecommendedAction[] {
  return (actions ?? []).filter((item) => item.label?.trim()).map((item) => ({
    ...item,
    label: item.label.trim(),
    actionType: item.actionType ? normalizeInsightType(item.actionType) : undefined,
  }));
}

function normalizeEntities(entities: AuditAffectedEntity[] | undefined): AuditAffectedEntity[] {
  return (entities ?? []).filter((item) => item.id?.trim() && item.name?.trim()).map((item) => ({
    ...item,
    id: item.id.trim(),
    name: item.name.trim(),
  }));
}

function normalizeChartHints(chartHints: AuditChartHint[] | undefined): AuditChartHint[] {
  return (chartHints ?? [])
    .filter((item) => includesValue(AUDIT_CHART_HINT_TYPES, item.type) && item.title?.trim())
    .map((item) => createChartHint(item));
}

function calculatePriorityScore(input: {
  severity: AuditSeverity;
  confidence: AuditConfidence;
  insightType: AuditInsightType;
  evidence: AuditEvidence[];
  caveats: AuditCaveat[];
  recommendedActions: AuditRecommendedAction[];
}) {
  const evidenceBonus = Math.min(8, input.evidence.length * 1.5);
  const actionBonus = input.recommendedActions.length > 0 ? 3 : 0;
  const caveatPenalty = Math.min(6, input.caveats.length * 1.5);

  return clampPriority(
    SEVERITY_WEIGHT[input.severity] +
      CONFIDENCE_WEIGHT[input.confidence] +
      INSIGHT_TYPE_WEIGHT[input.insightType] +
      evidenceBonus +
      actionBonus -
      caveatPenalty,
  );
}

export function createChartHint(input: {
  type: AuditChartHintType | string;
  title: string;
  metricKeys?: string[];
  entityIds?: string[];
  description?: string;
}): AuditChartHint {
  const normalizedType = normalizeKey(input.type);
  const type = includesValue(AUDIT_CHART_HINT_TYPES, normalizedType) ? normalizedType : "table";

  return {
    type,
    title: input.title.trim(),
    metricKeys: (input.metricKeys ?? []).filter(Boolean),
    entityIds: (input.entityIds ?? []).filter(Boolean),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
  };
}

export function createAuditInsight(input: AuditInsightInput): AuditInsight {
  const domain = normalizeDomain(input.domain);
  const insightType = normalizeInsightType(input.insightType);
  const severity = normalizeSeverity(input.severity);
  const confidence = normalizeConfidence(input.confidence);
  const evidence = normalizeEvidence(input.evidence);
  const caveats = normalizeCaveats(input.caveats);
  const recommendedActions = normalizeActions(input.recommendedActions);
  const affectedEntities = normalizeEntities(input.affectedEntities);
  const chartHints = normalizeChartHints(input.chartHints);
  const priorityScore = input.priorityScore == null
    ? calculatePriorityScore({
      severity,
      confidence,
      insightType,
      evidence,
      caveats,
      recommendedActions,
    })
    : clampPriority(input.priorityScore);

  return {
    id: input.id?.trim() || stableInsightId({ title: input.title, domain, insightType }),
    title: input.title.trim(),
    summary: input.summary.trim(),
    domain,
    insightType,
    severity,
    confidence,
    priorityScore,
    evidence,
    caveats,
    recommendedActions,
    affectedEntities,
    chartHints,
    createdAt: normalizeCreatedAt(input.createdAt),
  };
}

export function rankAuditInsights(insights: AuditInsight[]) {
  return [...insights].sort((a, b) => {
    const priorityDelta = b.priorityScore - a.priorityScore;
    if (priorityDelta) return priorityDelta;

    const severityDelta = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (severityDelta) return severityDelta;

    const confidenceDelta = CONFIDENCE_WEIGHT[b.confidence] - CONFIDENCE_WEIGHT[a.confidence];
    if (confidenceDelta) return confidenceDelta;

    return a.title.localeCompare(b.title);
  });
}

export function groupAuditInsightsByDomain(insights: AuditInsight[]) {
  const grouped = {} as Record<AuditDomain, AuditInsight[]>;
  for (const domain of AUDIT_DOMAINS) {
    grouped[domain] = [];
  }

  for (const insight of insights) {
    grouped[insight.domain].push(insight);
  }

  return grouped;
}

export function summarizeAuditInsights(
  insights: AuditInsight[],
  options: { topLimit?: number } = {},
): AuditInsightSummary {
  const ranked = rankAuditInsights(insights);
  const byDomain = emptyDomainCounts();
  const bySeverity = emptySeverityCounts();
  const grouped = groupAuditInsightsByDomain(insights);

  for (const domain of AUDIT_DOMAINS) {
    byDomain[domain] = grouped[domain].length;
  }

  for (const insight of insights) {
    bySeverity[insight.severity] += 1;
  }

  const topPriorities = ranked.slice(0, options.topLimit ?? 5).map((insight) => ({
    id: insight.id,
    title: insight.title,
    domain: insight.domain,
    insightType: insight.insightType,
    severity: insight.severity,
    confidence: insight.confidence,
    priorityScore: insight.priorityScore,
  }));

  const urgentCount = bySeverity.critical + bySeverity.issue + bySeverity.warning;
  const opportunityCount = bySeverity.opportunity;
  const goodCount = bySeverity.good;
  const top = topPriorities[0];

  const executiveSummary = insights.length === 0
    ? "No audit insights were generated."
    : [
      `${insights.length} audit insights generated across ${Object.values(byDomain).filter(Boolean).length} domains.`,
      urgentCount > 0
        ? `${urgentCount} need attention before the next retention build.`
        : "No urgent issues were detected.",
      opportunityCount > 0 ? `${opportunityCount} are growth opportunities.` : null,
      goodCount > 0 ? `${goodCount} should be protected or monitored.` : null,
      top ? `Top priority: ${top.title}.` : null,
    ].filter(Boolean).join(" ");

  return {
    total: insights.length,
    byDomain,
    bySeverity,
    topPriorities,
    executiveSummary,
  };
}

export function collectAuditChartHints(insights: AuditInsight[]) {
  const seen = new Set<string>();
  const hints: AuditChartHint[] = [];

  for (const insight of rankAuditInsights(insights)) {
    for (const hint of insight.chartHints) {
      const key = `${hint.type}:${hint.title}:${hint.metricKeys.join(",")}:${hint.entityIds.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hints.push(hint);
    }
  }

  return hints;
}
