import {
  collectAuditChartHints,
  createAuditInsight,
  createChartHint,
  rankAuditInsights,
  summarizeAuditInsights,
} from "@/lib/audits/insights";
import type {
  AuditCaveat,
  AuditChartHint,
  AuditEvidence,
  AuditInsight,
  AuditInsightInput,
  AuditRecommendedAction,
} from "@/lib/audits/types";
import { detectExistingFlows, type DetectedFlow } from "@/lib/flows/detect-existing-flows";
import {
  getKlaviyoPerformanceConfig,
  KlaviyoPerformanceApiError,
  queryKlaviyoPerformance,
  type NormalizedKlaviyoPerformanceRow,
} from "@/lib/klaviyo-performance";
import type {
  KlaviyoFlow,
  KlaviyoFlowActionDetail,
  KlaviyoFlowConfig,
  KlaviyoFlowDetail,
} from "@/lib/klaviyo-flows";
import {
  getKlaviyoFlowDetail,
  listKlaviyoFlows,
} from "@/lib/klaviyo-flows";
import { flowPlaybooks } from "@/lib/playbooks/flows";
import type { FlowPlaybook } from "@/lib/playbooks/types";
import {
  getProductPerformanceIntelligence,
  type ProductPerformanceIntelligenceResult,
} from "@/lib/products/product-performance-intelligence";

export type FlowAuditInput = {
  flowId?: string | null;
  playbookId?: string | null;
  auditAll?: boolean;
  limit?: number | null;
};

export type FlowContentUnderstanding =
  | "metadata_only"
  | "html_available"
  | "image_or_asset_based"
  | "unknown";

export type FlowAuditFinding = {
  id: string;
  title: string;
  severity: AuditInsight["severity"];
  insightType: AuditInsight["insightType"];
  summary: string;
  evidence: AuditEvidence[];
  caveats: AuditCaveat[];
};

export type FlowAuditResult = {
  flowId: string;
  flowName: string;
  playbookId: string | null;
  playbookName: string | null;
  status: string | null;
  score: number;
  contentUnderstanding: FlowContentUnderstanding;
  summary: string;
  insights: AuditInsight[];
  findings: FlowAuditFinding[];
  chartHints: AuditChartHint[];
  recommendedNextActions: AuditRecommendedAction[];
  caveats: AuditCaveat[];
  structure: {
    triggerType: string | null;
    actionCount: number;
    messageCount: number;
    sendEmailActionCount: number;
    conditionalSplitCount: number;
    timeDelayCount: number;
    subjectLineCount: number;
    templateIds: string[];
    messageNames: string[];
    subjectLines: string[];
  };
  performance: {
    available: boolean;
    rows: NormalizedKlaviyoPerformanceRow[];
    caveats: AuditCaveat[];
  };
};

export type FlowAuditOutput = {
  ok: true;
  readOnly: true;
  audits: FlowAuditResult[];
  summary: {
    totalAudited: number;
    topIssues: AuditInsightSummaryItem[];
    topOpportunities: AuditInsightSummaryItem[];
    protectedFlows: AuditInsightSummaryItem[];
    needsPerformanceData: boolean;
  };
  workflowId?: string | null;
};

type AuditInsightSummaryItem = {
  id: string;
  title: string;
  flowId: string;
  flowName: string;
  severity: AuditInsight["severity"];
  confidence: AuditInsight["confidence"];
  priorityScore: number;
};

type FlowAuditTarget = {
  flow: KlaviyoFlow;
  detected: DetectedFlow | null;
  playbook: FlowPlaybook | null;
};

type FlowStructureStats = FlowAuditResult["structure"] & {
  hasHtmlBody: boolean;
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

function cleanLimit(value: number | null | undefined) {
  if (!value || !Number.isInteger(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isActiveFlow(flow: KlaviyoFlow) {
  if (flow.archived) return false;
  const status = normalize(flow.status);
  return status === "live" || status === "active" || status === "enabled";
}

function playbookById(id: string | null | undefined) {
  if (!id) return null;
  return flowPlaybooks.find((playbook) => playbook.id === id) ?? null;
}

function detectFlow(flow: KlaviyoFlow) {
  return detectExistingFlows([flow]).detectedFlows[0] ?? null;
}

function looksLikeSendEmail(action: KlaviyoFlowActionDetail) {
  const text = normalize([
    action.type,
    action.actionType,
    action.channel,
    action.name,
    action.definition ? JSON.stringify(action.definition) : null,
  ].filter(Boolean).join(" "));

  return action.messages.length > 0 || /\b(email|send message|message)\b/.test(text);
}

function looksLikeSplit(action: KlaviyoFlowActionDetail) {
  const text = normalize([
    action.type,
    action.actionType,
    action.name,
    action.definition ? JSON.stringify(action.definition) : null,
  ].filter(Boolean).join(" "));

  return /\b(split|conditional|condition|branch|trigger split|random sample)\b/.test(text);
}

function hasDelay(action: KlaviyoFlowActionDetail) {
  const text = normalize([
    action.timing,
    action.delay ? JSON.stringify(action.delay) : null,
    action.definition ? JSON.stringify(action.definition) : null,
  ].filter(Boolean).join(" "));

  return Boolean(action.timing || action.delay || /\b(delay|wait|hour|day|minute|time)\b/.test(text));
}

function collectStringValues(value: unknown, matcher: (key: string, text: string) => boolean, limit = 24) {
  const found = new Set<string>();

  function visit(current: unknown, currentKey = "", depth = 0) {
    if (found.size >= limit || depth > 8) return;
    if (typeof current === "string") {
      const text = current.trim();
      if (text && matcher(currentKey, text)) found.add(text);
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current) visit(item, currentKey, depth + 1);
      return;
    }
    if (!isRecord(current)) return;
    for (const [key, nested] of Object.entries(current)) visit(nested, key, depth + 1);
  }

  visit(value);
  return Array.from(found);
}

function extractTemplateIds(flow: KlaviyoFlowDetail) {
  return Array.from(new Set(
    flow.actions.flatMap((action) => [
      ...Object.values(action.rawRelationshipIds ?? {}).flat(),
      ...collectStringValues(action.definition, (key) => /template/i.test(key)),
    ]),
  )).slice(0, 20);
}

function hasHtmlBody(flow: KlaviyoFlowDetail) {
  return flow.actions.some((action) =>
    collectStringValues(
      action.definition,
      (key, text) => /\b(html|body|content)\b/i.test(key) && /<\/?[a-z][\s\S]*>/i.test(text),
      1,
    ).length > 0,
  );
}

function structureStats(flow: KlaviyoFlowDetail): FlowStructureStats {
  const messages = flow.actions.flatMap((action) => action.messages);
  const subjectLines = messages
    .map((message) => message.subject)
    .filter((subject): subject is string => Boolean(subject));
  const messageNames = messages
    .map((message) => message.name ?? message.id)
    .filter((name): name is string => Boolean(name));

  return {
    triggerType: flow.triggerType,
    actionCount: flow.actions.length,
    messageCount: messages.length,
    sendEmailActionCount: flow.actions.filter(looksLikeSendEmail).length,
    conditionalSplitCount: flow.actions.filter(looksLikeSplit).length,
    timeDelayCount: flow.actions.filter(hasDelay).length,
    subjectLineCount: subjectLines.length,
    templateIds: extractTemplateIds(flow),
    messageNames,
    subjectLines,
    hasHtmlBody: hasHtmlBody(flow),
  };
}

function contentUnderstanding(stats: FlowStructureStats): FlowContentUnderstanding {
  if (stats.hasHtmlBody) return "html_available";
  if (stats.messageCount === 0) return "unknown";
  if (stats.subjectLineCount === 0 && stats.templateIds.length > 0) return "image_or_asset_based";
  if (stats.subjectLineCount === 0) return "image_or_asset_based";
  return "metadata_only";
}

function productEvidence(productIntelligence: ProductPerformanceIntelligenceResult | null, playbook: FlowPlaybook | null): AuditEvidence[] {
  if (!productIntelligence || !playbook) return [];

  if (playbook.id === "replenishment") {
    const candidates = productIntelligence.tiers.replenishmentCandidates.slice(0, 3);
    if (!candidates.length) return [];
    return [{
      type: "product",
      label: `${candidates.length} replenishment product candidates are available for flow context.`,
      value: candidates.map((candidate) => candidate.name).join(", "),
      source: "product_performance_intelligence",
      metricKey: "replenishmentCandidates",
    }];
  }

  if (playbook.id === "welcome_series" || playbook.id === "browse_abandon" || playbook.id === "winback") {
    const anchors = productIntelligence.tiers.revenueAnchors.slice(0, 3);
    if (!anchors.length) return [];
    return [{
      type: "product",
      label: `${anchors.length} revenue anchor products can inform product proof and lifecycle placement.`,
      value: anchors.map((candidate) => candidate.name).join(", "),
      source: "product_performance_intelligence",
      metricKey: "revenueAnchors",
    }];
  }

  if (playbook.id === "cart_abandon" || playbook.id === "checkout_abandon") {
    const addOns = productIntelligence.tiers.addOnBoosters.slice(0, 3);
    if (!addOns.length) return [];
    return [{
      type: "product",
      label: `${addOns.length} add-on products are available for post-purchase or cart/checkout context.`,
      value: addOns.map((candidate) => candidate.name).join(", "),
      source: "product_performance_intelligence",
      metricKey: "addOnBoosters",
    }];
  }

  return [];
}

function performanceCaveat(message: string): AuditCaveat {
  return {
    message,
    evidenceType: "performance",
    severity: "unknown",
  };
}

async function readFlowPerformance(flowId: string): Promise<FlowAuditResult["performance"]> {
  const configResult = getKlaviyoPerformanceConfig();
  if (!configResult.ok) {
    return {
      available: false,
      rows: [],
      caveats: [performanceCaveat(`Klaviyo performance read is not configured: ${configResult.missingConfig.join(", ")}.`)],
    };
  }

  if (!configResult.config.conversionMetricId) {
    return {
      available: false,
      rows: [],
      caveats: [performanceCaveat("Klaviyo flow performance metrics are unavailable because KLAVIYO_CONVERSION_METRIC_ID is not configured.")],
    };
  }

  try {
    const result = await queryKlaviyoPerformance(configResult.config, {
      type: "flow",
      timeframe: "last_90_days",
      ids: [flowId],
      statistics: [
        "recipients",
        "delivered",
        "click_rate",
        "conversion_rate",
        "conversion_value",
        "revenue_per_recipient",
      ],
    });

    return {
      available: result.rows.length > 0,
      rows: result.rows,
      caveats: result.rows.length
        ? []
        : [performanceCaveat("Klaviyo performance read returned no rows for this flow in the audit window.")],
    };
  } catch (error) {
    if (error instanceof KlaviyoPerformanceApiError) {
      const missingMetric = error.errors.some((item) => /conversion metric/i.test(`${item.title} ${item.detail ?? ""}`));
      return {
        available: false,
        rows: [],
        caveats: [performanceCaveat(
          missingMetric
            ? "Klaviyo flow performance metrics are unavailable because conversion metric configuration is missing or invalid."
            : "Klaviyo flow performance metrics are unavailable for this audit; structural and playbook checks were still completed.",
        )],
      };
    }

    return {
      available: false,
      rows: [],
      caveats: [performanceCaveat("Klaviyo flow performance metrics could not be read; structural and playbook checks were still completed.")],
    };
  }
}

function numericStat(rows: NormalizedKlaviyoPerformanceRow[], key: string) {
  const values = rows
    .map((row) => row.statistics[key])
    .map((value) => typeof value === "number" && Number.isFinite(value) ? value : null)
    .filter((value): value is number => value !== null);
  if (!values.length) return null;
  return Number(values.reduce((sum, value) => sum + value, 0).toFixed(4));
}

function performanceEvidence(performance: FlowAuditResult["performance"]): AuditEvidence[] {
  if (!performance.available) return [];
  const conversionValue = numericStat(performance.rows, "conversion_value");
  const revenuePerRecipient = numericStat(performance.rows, "revenue_per_recipient");
  const conversionRate = numericStat(performance.rows, "conversion_rate");

  const evidence: Array<AuditEvidence | null> = [
    conversionValue !== null
      ? {
        type: "performance",
        label: "Flow conversion value in the audit window.",
        value: conversionValue,
        metricKey: "conversion_value",
        source: "klaviyo_performance_read",
        timeframe: "last_90_days",
      }
      : null,
    revenuePerRecipient !== null
      ? {
        type: "performance",
        label: "Flow revenue per recipient in the audit window.",
        value: revenuePerRecipient,
        metricKey: "revenue_per_recipient",
        source: "klaviyo_performance_read",
        timeframe: "last_90_days",
      }
      : null,
    conversionRate !== null
      ? {
        type: "performance",
        label: "Flow conversion rate in the audit window.",
        value: conversionRate,
        metricKey: "conversion_rate",
        source: "klaviyo_performance_read",
        timeframe: "last_90_days",
      }
      : null,
  ];

  return evidence.filter((item): item is AuditEvidence => Boolean(item));
}

function flowEntity(flow: KlaviyoFlowDetail, playbook: FlowPlaybook | null) {
  return [
    {
      id: flow.id,
      type: "flow" as const,
      name: flow.name,
      source: "klaviyo_flow_detail",
      metadata: {
        status: flow.status,
        triggerType: flow.triggerType,
      },
    },
    ...(playbook
      ? [{
        id: playbook.id,
        type: "playbook" as const,
        name: playbook.name,
        source: "worklin_flow_playbook",
      }]
      : []),
  ];
}

function insightToFinding(insight: AuditInsight): FlowAuditFinding {
  return {
    id: insight.id,
    title: insight.title,
    severity: insight.severity,
    insightType: insight.insightType,
    summary: insight.summary,
    evidence: insight.evidence,
    caveats: insight.caveats,
  };
}

function buildInsights(input: {
  flow: KlaviyoFlowDetail;
  playbook: FlowPlaybook | null;
  detected: DetectedFlow | null;
  stats: FlowStructureStats;
  contentUnderstanding: FlowContentUnderstanding;
  productIntelligence: ProductPerformanceIntelligenceResult | null;
  performance: FlowAuditResult["performance"];
  score: number;
}) {
  const createdAt = new Date().toISOString();
  const insights: AuditInsightInput[] = [];
  const flow = input.flow;
  const playbook = input.playbook;
  const expectedMessages = playbook?.sequence.length ?? 0;
  const commonEvidence: AuditEvidence[] = [
    {
      type: "structure",
      label: `Flow has ${input.stats.actionCount} actions and ${input.stats.messageCount} messages.`,
      value: input.stats.messageCount,
      metricKey: "message_count",
      source: "klaviyo_flow_detail",
      entityId: flow.id,
    },
    ...(input.detected
      ? [{
        type: "playbook" as const,
        label: `Flow mapped to ${input.detected.playbook.name} with ${input.detected.confidence.toFixed(2)} confidence.`,
        value: input.detected.confidence,
        source: "flow_detection",
        entityId: input.detected.playbook.id,
      }]
      : []),
    ...productEvidence(input.productIntelligence, playbook),
    ...performanceEvidence(input.performance),
  ];
  const flowCaveats = [
    ...input.performance.caveats,
    ...(input.contentUnderstanding === "metadata_only"
      ? [{
        message: "Message HTML/template body was not available in the flow detail read; audit used metadata, sequence, subject lines, timing, and playbook signals.",
        evidenceType: "content" as const,
        severity: "unknown" as const,
      }]
      : []),
    ...(input.contentUnderstanding === "image_or_asset_based"
      ? [{
        message: "Flow content appears unavailable or image/asset based; audit does not assume readable HTML text exists.",
        evidenceType: "content" as const,
        severity: "unknown" as const,
      }]
      : []),
  ];

  if (!playbook) {
    insights.push({
      id: `flow_classify_${flow.id}`,
      title: `Classify ${flow.name}`,
      summary: "This Klaviyo flow could not be confidently mapped to a Worklin lifecycle playbook, so it needs classification before recommendations become specific.",
      domain: "flow",
      insightType: "classify",
      severity: "unknown",
      confidence: "weak",
      evidence: [
        {
          type: "structure",
          label: "Flow detection did not find a strong Worklin playbook match.",
          source: "flow_detection",
          entityId: flow.id,
        },
        ...commonEvidence,
      ],
      caveats: flowCaveats,
      recommendedActions: [{
        label: "Classify this flow by trigger, audience, lifecycle role, and overlap with existing playbooks.",
        actionType: "classify",
        priority: "medium",
        owner: "lifecycle",
      }],
      affectedEntities: flowEntity(flow, playbook),
      chartHints: [
        createChartHint({
          type: "table",
          title: "Unknown flow classification",
          metricKeys: ["flow_status", "trigger_type", "message_count", "last_updated"],
          entityIds: [flow.id],
          description: "Show metadata needed to classify unmapped flows safely.",
        }),
      ],
      createdAt,
    });
    return insights.map((insight) => createAuditInsight(insight));
  }

  if (input.stats.messageCount < Math.max(1, expectedMessages)) {
    insights.push({
      id: `flow_fix_sequence_${flow.id}`,
      title: `Fix ${playbook.name} sequence depth`,
      summary: `${flow.name} has fewer messages than the ${playbook.name} playbook expects, so it may be too shallow for the lifecycle moment.`,
      domain: "flow",
      insightType: "fix",
      severity: input.stats.messageCount <= 1 ? "issue" : "warning",
      confidence: "strong",
      evidence: [
        ...commonEvidence,
        {
          type: "playbook",
          label: `${playbook.name} expects ${expectedMessages} sequence steps.`,
          value: expectedMessages,
          metricKey: "expected_sequence_steps",
          source: "flow_playbook",
          entityId: playbook.id,
        },
      ],
      caveats: flowCaveats,
      recommendedActions: [{
        label: `Audit and extend the ${playbook.name} sequence before considering flow creation or rebuild work.`,
        actionType: "fix",
        priority: input.stats.messageCount <= 1 ? "high" : "medium",
        owner: "lifecycle",
      }],
      affectedEntities: flowEntity(flow, playbook),
      chartHints: [
        createChartHint({
          type: "bar",
          title: `${playbook.name} sequence depth`,
          metricKeys: ["message_count", "expected_sequence_steps"],
          entityIds: [flow.id, playbook.id],
          description: "Compare actual message count to playbook sequence expectations.",
        }),
      ],
      createdAt,
    });
  }

  if (expectedMessages > 1 && input.stats.timeDelayCount < expectedMessages - 1) {
    insights.push({
      id: `flow_audit_timing_${flow.id}`,
      title: `Audit ${playbook.name} timing`,
      summary: `${flow.name} may not have enough visible timing or delay metadata for the expected ${playbook.name} cadence.`,
      domain: "flow",
      insightType: "audit",
      severity: "warning",
      confidence: "directional",
      evidence: [
        ...commonEvidence,
        {
          type: "structure",
          label: `Detected ${input.stats.timeDelayCount} timing/delay markers against ${expectedMessages} expected steps.`,
          value: input.stats.timeDelayCount,
          metricKey: "time_delay_count",
          source: "klaviyo_flow_detail",
          entityId: flow.id,
        },
      ],
      caveats: flowCaveats,
      recommendedActions: [{
        label: `Compare visible Klaviyo delays against expected timing: ${playbook.timing.join(", ")}.`,
        actionType: "audit",
        priority: "medium",
        owner: "lifecycle",
      }],
      affectedEntities: flowEntity(flow, playbook),
      chartHints: [
        createChartHint({
          type: "table",
          title: `${playbook.name} timing coverage`,
          metricKeys: ["time_delay_count", "expected_sequence_steps"],
          entityIds: [flow.id, playbook.id],
          description: "Render visible timing markers next to playbook timing expectations.",
        }),
      ],
      createdAt,
    });
  }

  if (input.stats.sendEmailActionCount > 0 && input.stats.subjectLineCount < input.stats.sendEmailActionCount) {
    insights.push({
      id: `flow_audit_subjects_${flow.id}`,
      title: `Audit ${playbook.name} subject-line coverage`,
      summary: "Some email actions do not expose subject lines in the detail read, so creative QA needs message-level review.",
      domain: "creative",
      insightType: "audit",
      severity: "opportunity",
      confidence: "directional",
      evidence: [
        ...commonEvidence,
        {
          type: "content",
          label: `${input.stats.subjectLineCount} subject lines were visible for ${input.stats.sendEmailActionCount} send-email actions.`,
          value: input.stats.subjectLineCount,
          metricKey: "subject_line_count",
          source: "klaviyo_flow_detail",
          entityId: flow.id,
        },
      ],
      caveats: flowCaveats,
      recommendedActions: [{
        label: "Review message-level subject lines, preview text, and creative assets before rewriting content.",
        actionType: "audit",
        priority: "medium",
        owner: "creative",
      }],
      affectedEntities: flowEntity(flow, playbook),
      chartHints: [
        createChartHint({
          type: "scorecard",
          title: `${playbook.name} creative metadata`,
          metricKeys: ["send_email_action_count", "subject_line_count", "message_count"],
          entityIds: [flow.id],
          description: "Show available message metadata without assuming readable template body text.",
        }),
      ],
      createdAt,
    });
  }

  if (!input.performance.available) {
    insights.push({
      id: `flow_monitor_performance_data_${flow.id}`,
      title: `Add performance data for ${playbook.name}`,
      summary: "The flow can be structurally audited, but performance metrics are unavailable, so revenue and conversion conclusions stay directional.",
      domain: "revenue",
      insightType: "monitor",
      severity: "unknown",
      confidence: "weak",
      evidence: commonEvidence,
      caveats: flowCaveats,
      recommendedActions: [{
        label: "Configure Klaviyo conversion metric reporting and rerun the flow audit for performance-backed prioritization.",
        actionType: "monitor",
        priority: "medium",
        owner: "analytics",
      }],
      affectedEntities: flowEntity(flow, playbook),
      chartHints: [
        createChartHint({
          type: "line",
          title: `${playbook.name} performance trend placeholder`,
          metricKeys: ["conversion_value", "revenue_per_recipient", "conversion_rate"],
          entityIds: [flow.id],
          description: "Use once Klaviyo flow performance rows are available.",
        }),
      ],
      createdAt,
    });
  }

  if (input.score >= 78 && input.stats.messageCount >= Math.max(1, expectedMessages) && input.stats.sendEmailActionCount > 0) {
    insights.push({
      id: `flow_protect_${flow.id}`,
      title: `Protect ${playbook.name} structure`,
      summary: `${flow.name} has a strong visible structure for the ${playbook.name} playbook and should be protected from unnecessary rebuilds.`,
      domain: "flow",
      insightType: "protect",
      severity: "good",
      confidence: input.performance.available ? "strong" : "directional",
      evidence: commonEvidence,
      caveats: flowCaveats,
      recommendedActions: [{
        label: "Monitor this flow and avoid replacing it without performance or QA evidence.",
        actionType: "protect",
        priority: "medium",
        owner: "retention",
      }],
      affectedEntities: flowEntity(flow, playbook),
      chartHints: [
        createChartHint({
          type: "scorecard",
          title: `${playbook.name} structure score`,
          metricKeys: ["flow_audit_score", "message_count", "time_delay_count"],
          entityIds: [flow.id, playbook.id],
          description: "Show whether this flow should be protected or audited deeper.",
        }),
      ],
      createdAt,
    });
  }

  if (!insights.length) {
    insights.push({
      id: `flow_audit_${flow.id}`,
      title: `Audit ${playbook.name}`,
      summary: `${flow.name} has enough visible structure to warrant a deeper message-level audit before recommending major changes.`,
      domain: "flow",
      insightType: "audit",
      severity: "opportunity",
      confidence: "directional",
      evidence: commonEvidence,
      caveats: flowCaveats,
      recommendedActions: [{
        label: "Review trigger, filters, message sequence, offer rules, and QA risks against the playbook.",
        actionType: "audit",
        priority: "medium",
        owner: "lifecycle",
      }],
      affectedEntities: flowEntity(flow, playbook),
      chartHints: [
        createChartHint({
          type: "table",
          title: `${playbook.name} audit checklist`,
          metricKeys: ["trigger_type", "message_count", "time_delay_count", "subject_line_count"],
          entityIds: [flow.id, playbook.id],
          description: "Render the structural audit checklist for deeper review.",
        }),
      ],
      createdAt,
    });
  }

  return rankAuditInsights(insights.map((insight) => createAuditInsight(insight)));
}

function scoreFlowAudit(input: {
  flow: KlaviyoFlowDetail;
  playbook: FlowPlaybook | null;
  stats: FlowStructureStats;
  performance: FlowAuditResult["performance"];
}) {
  let score = 78;
  const expectedMessages = input.playbook?.sequence.length ?? 2;

  if (!isActiveFlow(input.flow)) score -= 12;
  if (!input.playbook) score -= 18;
  if (!input.stats.triggerType) score -= 8;
  if (input.stats.messageCount === 0) score -= 25;
  if (input.stats.messageCount > 0 && input.stats.messageCount < expectedMessages) {
    score -= input.stats.messageCount <= 1 ? 18 : 10;
  }
  if (expectedMessages > 1 && input.stats.timeDelayCount < expectedMessages - 1) score -= 8;
  if (input.stats.sendEmailActionCount > 0 && input.stats.subjectLineCount === 0) score -= 8;
  if (!input.performance.available) score -= 3;
  if (input.stats.messageCount >= expectedMessages && input.stats.timeDelayCount >= Math.max(0, expectedMessages - 1)) score += 10;
  if (input.performance.available) score += 5;

  return clampScore(score);
}

function auditSummary(input: {
  flow: KlaviyoFlowDetail;
  playbook: FlowPlaybook | null;
  score: number;
  contentUnderstanding: FlowContentUnderstanding;
  stats: FlowStructureStats;
}) {
  const playbookText = input.playbook ? ` against the ${input.playbook.name} playbook` : " as an unmapped lifecycle flow";
  return `${input.flow.name} scored ${input.score}/100${playbookText}. The audit used ${input.stats.messageCount} messages, ${input.stats.timeDelayCount} visible timing markers, ${input.stats.subjectLineCount} subject lines, and content understanding: ${input.contentUnderstanding}.`;
}

function recommendedNextActions(insights: AuditInsight[]) {
  const seen = new Set<string>();
  const actions: AuditRecommendedAction[] = [];
  for (const insight of insights) {
    for (const action of insight.recommendedActions) {
      if (seen.has(action.label)) continue;
      seen.add(action.label);
      actions.push(action);
    }
  }
  return actions;
}

function collectFlowCaveats(insights: AuditInsight[], performance: FlowAuditResult["performance"]) {
  const seen = new Set<string>();
  const caveats: AuditCaveat[] = [];

  for (const caveat of performance.caveats) {
    if (seen.has(caveat.message)) continue;
    seen.add(caveat.message);
    caveats.push(caveat);
  }

  for (const insight of insights) {
    for (const caveat of insight.caveats) {
      if (seen.has(caveat.message)) continue;
      seen.add(caveat.message);
      caveats.push(caveat);
    }
  }

  return caveats;
}

async function auditOneFlow(input: {
  config: KlaviyoFlowConfig;
  target: FlowAuditTarget;
  productIntelligence: ProductPerformanceIntelligenceResult | null;
}) {
  const detail = await getKlaviyoFlowDetail(input.config, input.target.flow.id);
  const detected = input.target.detected ?? detectFlow(detail);
  const playbook = input.target.playbook ?? playbookById(detected?.playbook.id);
  const stats = structureStats(detail);
  const understanding = contentUnderstanding(stats);
  const performance = await readFlowPerformance(detail.id);
  const score = scoreFlowAudit({ flow: detail, playbook, stats, performance });
  const insights = buildInsights({
    flow: detail,
    playbook,
    detected,
    stats,
    contentUnderstanding: understanding,
    productIntelligence: input.productIntelligence,
    performance,
    score,
  });
  const publicStats = {
    triggerType: stats.triggerType,
    actionCount: stats.actionCount,
    messageCount: stats.messageCount,
    sendEmailActionCount: stats.sendEmailActionCount,
    conditionalSplitCount: stats.conditionalSplitCount,
    timeDelayCount: stats.timeDelayCount,
    subjectLineCount: stats.subjectLineCount,
    templateIds: stats.templateIds,
    messageNames: stats.messageNames,
    subjectLines: stats.subjectLines,
  };

  return {
    flowId: detail.id,
    flowName: detail.name,
    playbookId: playbook?.id ?? null,
    playbookName: playbook?.name ?? null,
    status: detail.status,
    score,
    contentUnderstanding: understanding,
    summary: auditSummary({ flow: detail, playbook, score, contentUnderstanding: understanding, stats }),
    insights,
    findings: insights.map(insightToFinding),
    chartHints: collectAuditChartHints(insights),
    recommendedNextActions: recommendedNextActions(insights),
    caveats: collectFlowCaveats(insights, performance),
    structure: publicStats,
    performance,
  } satisfies FlowAuditResult;
}

function selectAuditTargets(flows: KlaviyoFlow[], input: FlowAuditInput) {
  const limit = cleanLimit(input.limit);
  const detection = detectExistingFlows(flows);
  const requestedPlaybook = playbookById(input.playbookId);
  const detectedByFlowId = new Map(detection.detectedFlows.map((detected) => [detected.flow.id, detected]));
  const knownTargets: FlowAuditTarget[] = detection.detectedFlows
    .filter((detected) => detected.active)
    .filter((detected) => !requestedPlaybook || detected.playbook.id === requestedPlaybook.id)
    .map((detected) => ({
      flow: detected.flow,
      detected,
      playbook: playbookById(detected.playbook.id),
    }));
  const unknownActiveTargets: FlowAuditTarget[] = detection.unknownFlows
    .filter(isActiveFlow)
    .filter(() => !requestedPlaybook)
    .map((flow) => ({
      flow,
      detected: detectedByFlowId.get(flow.id) ?? null,
      playbook: null,
    }));

  return [...knownTargets, ...unknownActiveTargets].slice(0, limit);
}

export async function auditKlaviyoFlows(
  config: KlaviyoFlowConfig,
  input: FlowAuditInput,
): Promise<Omit<FlowAuditOutput, "workflowId">> {
  const productIntelligence = await getProductPerformanceIntelligence({ limit: 5 }).catch(() => null);
  let targets: FlowAuditTarget[];

  if (input.flowId) {
    const flow = await getKlaviyoFlowDetail(config, input.flowId);
    const detected = detectFlow(flow);
    const requestedPlaybook = playbookById(input.playbookId);
    targets = [{
      flow,
      detected,
      playbook: requestedPlaybook ?? playbookById(detected?.playbook.id),
    }];
  } else {
    const flows = await listKlaviyoFlows(config);
    targets = selectAuditTargets(flows, input);
  }

  const audits: FlowAuditResult[] = [];
  for (const target of targets) {
    audits.push(await auditOneFlow({ config, target, productIntelligence }));
  }

  const allInsights = rankAuditInsights(audits.flatMap((audit) => audit.insights));
  const insightSummary = summarizeAuditInsights(allInsights);
  const topItem = (insight: AuditInsight): AuditInsightSummaryItem => {
    const audit = audits.find((item) => item.insights.some((candidate) => candidate.id === insight.id));
    return {
      id: insight.id,
      title: insight.title,
      flowId: audit?.flowId ?? "unknown",
      flowName: audit?.flowName ?? "Unknown flow",
      severity: insight.severity,
      confidence: insight.confidence,
      priorityScore: insight.priorityScore,
    };
  };

  return {
    ok: true,
    readOnly: true,
    audits,
    summary: {
      totalAudited: audits.length,
      topIssues: allInsights
        .filter((insight) => insight.severity === "critical" || insight.severity === "issue" || insight.severity === "warning")
        .slice(0, 5)
        .map(topItem),
      topOpportunities: allInsights
        .filter((insight) => insight.severity === "opportunity")
        .slice(0, 5)
        .map(topItem),
      protectedFlows: allInsights
        .filter((insight) => insight.insightType === "protect" || insight.severity === "good")
        .slice(0, 5)
        .map(topItem),
      needsPerformanceData: audits.some((audit) => !audit.performance.available) || insightSummary.bySeverity.unknown > 0,
    },
  };
}
