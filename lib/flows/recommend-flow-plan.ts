import type {
  DetectedFlow,
  FlowDetectionResult,
} from "@/lib/flows/detect-existing-flows";
import type { KlaviyoFlow } from "@/lib/klaviyo-flows";
import { flowPlaybooks } from "@/lib/playbooks/flows";
import type { FlowPlaybook, FlowSequenceStep } from "@/lib/playbooks/types";

export type FlowPlannerInput = {
  message?: string | null;
  goal?: string | null;
  constraints?: string[];
  limit?: number | null;
};

export type FlowRecommendationAction =
  | "build"
  | "audit"
  | "finish_or_activate"
  | "monitor_replacement"
  | "consolidate"
  | "classify"
  | "ignore_or_cleanup";

export type FlowRecommendationPriority = "high" | "medium" | "low";

export type FlowCurrentState =
  | "missing"
  | "active"
  | "draft"
  | "inactive"
  | "unknown"
  | "replacement_candidate"
  | "finish_or_activate_candidate"
  | "unconfigured_or_stale_draft"
  | "duplicate_or_consolidation_audit";

export type FlowRecommendation = {
  flowId: string;
  flowName: string;
  klaviyoFlowIds: string[];
  action: FlowRecommendationAction;
  priority: FlowRecommendationPriority;
  reason: string;
  currentState: FlowCurrentState;
  confidence: number;
  evidence: string[];
  trigger: string;
  flowFilters: string[];
  targetAudience: string;
  sequence: FlowSequenceStep[];
  timing: string[];
  requiredData: string[];
  qaRisks: string[];
  offerRules: string[];
  keyMetric: string;
  recommendedNextAction: string;
};

export type CoveredFlow = {
  flowId: string;
  flowName: string;
  klaviyoFlowIds: string[];
  status: "active";
  confidence: number;
  evidence: string[];
  keyMetric: string;
};

export type ClassifiedUnknownFlow = {
  flow: KlaviyoFlow;
  currentState: "unknown" | "unconfigured_or_stale_draft";
  action: "classify" | "ignore_or_cleanup";
  priority: FlowRecommendationPriority;
  confidence: number;
  evidence: string[];
};

export type FlowPlanRecommendationResult = {
  summary: string;
  recommendations: FlowRecommendation[];
  coveredFlows: CoveredFlow[];
  missingCoreFlows: FlowRecommendation[];
  draftOrInactiveFlows: FlowRecommendation[];
  unknownFlows: ClassifiedUnknownFlow[];
};

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 12;

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function goalText(input: FlowPlannerInput) {
  return [input.message, input.goal, ...(input.constraints ?? [])]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function cleanLimit(value: number | null | undefined) {
  if (!value || !Number.isInteger(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

function playbookById(id: string) {
  return flowPlaybooks.find((playbook) => playbook.id === id) ?? null;
}

function playbookPriority(playbook: FlowPlaybook, input: FlowPlannerInput): FlowRecommendationPriority {
  const text = normalize(goalText(input));

  if (playbook.id === "checkout_abandon") return "high";
  if (playbook.id === "cart_abandon") return "high";

  if (playbook.id === "welcome_series") {
    return /\b(welcome|subscriber|signup|sign up|onboard|new subscriber|conversion)\b/.test(text)
      ? "high"
      : "medium";
  }

  if (playbook.id === "replenishment") {
    return /\b(repeat|restock|replenish|reorder|refill|subscription)\b/.test(text) ? "high" : "medium";
  }

  if (playbook.id === "winback") {
    return /\b(winback|win back|lapsed|at risk|churn|reactivat)\b/.test(text) ? "high" : "medium";
  }

  if (playbook.id === "browse_abandon" || playbook.id === "site_abandon") {
    return /\b(browse|site|top funnel|mid funnel|abandon|recover)\b/.test(text) ? "medium" : "low";
  }

  return "medium";
}

function priorityRank(priority: FlowRecommendationPriority) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function actionRank(action: FlowRecommendationAction) {
  switch (action) {
    case "build":
      return 7;
    case "finish_or_activate":
      return 6;
    case "consolidate":
      return 5;
    case "audit":
      return 4;
    case "classify":
      return 3;
    case "monitor_replacement":
      return 2;
    case "ignore_or_cleanup":
      return 1;
  }
}

function sortRecommendations(recommendations: FlowRecommendation[]) {
  return [...recommendations].sort((a, b) => {
    const priorityDelta = priorityRank(b.priority) - priorityRank(a.priority);
    if (priorityDelta) return priorityDelta;
    const actionDelta = actionRank(b.action) - actionRank(a.action);
    if (actionDelta) return actionDelta;
    return b.confidence - a.confidence;
  });
}

function isActiveFlow(flow: KlaviyoFlow) {
  if (flow.archived) return false;
  const status = normalize(flow.status);
  return status === "live" || status === "active" || status === "enabled";
}

function isDraftOrInactive(flow: KlaviyoFlow) {
  return !isActiveFlow(flow);
}

function isUnconfiguredFlow(flow: KlaviyoFlow) {
  const trigger = normalize(flow.triggerType);
  const definition = flow.definition ? JSON.stringify(flow.definition) : "";
  return !trigger || trigger === "unconfigured" || definition === "{}";
}

function hasMeaningfulTrigger(flow: KlaviyoFlow) {
  return !isUnconfiguredFlow(flow);
}

function detectedEvidence(detected: DetectedFlow) {
  return [
    `Klaviyo flow "${detected.flow.name}" has status "${detected.flow.status ?? "unknown"}".`,
    ...detected.reasons,
  ];
}

function recommendationBase(playbook: FlowPlaybook) {
  return {
    flowId: playbook.id,
    flowName: playbook.name,
    trigger: playbook.trigger,
    flowFilters: playbook.flowFilters,
    targetAudience: playbook.targetAudience,
    sequence: playbook.sequence,
    timing: playbook.timing,
    requiredData: playbook.requiredData,
    qaRisks: playbook.qaRisks,
    offerRules: playbook.offerRules,
    keyMetric: playbook.keyMetric,
  };
}

function buildRecommendation(playbook: FlowPlaybook, input: FlowPlannerInput): FlowRecommendation {
  return {
    ...recommendationBase(playbook),
    klaviyoFlowIds: [],
    action: "build",
    priority: playbookPriority(playbook, input),
    reason: `No active Klaviyo flow or credible draft candidate was detected for ${playbook.name}.`,
    currentState: "missing",
    confidence: 0.86,
    evidence: [
      "Flow detection found no active flow mapped to this playbook.",
      "Flow detection found no draft or inactive mapped candidate to finish first.",
    ],
    recommendedNextAction: `Build the ${playbook.name} playbook using its trigger, filters, timing, and QA risks before considering Klaviyo implementation.`,
  };
}

function finishRecommendation(
  playbook: FlowPlaybook,
  detected: DetectedFlow,
  input: FlowPlannerInput,
): FlowRecommendation {
  return {
    ...recommendationBase(playbook),
    klaviyoFlowIds: [detected.flow.id],
    action: "finish_or_activate",
    priority: playbookPriority(playbook, input),
    reason: `${playbook.name} appears to exist but is not active, so finishing or activating it is safer than recommending a rebuild.`,
    currentState: "finish_or_activate_candidate",
    confidence: clampConfidence(detected.confidence),
    evidence: detectedEvidence(detected),
    recommendedNextAction: `Audit the draft/inactive Klaviyo flow against the ${playbook.name} playbook, confirm trigger/filter configuration, then finish or activate if it is the intended lifecycle flow.`,
  };
}

function replacementRecommendation(
  playbook: FlowPlaybook,
  active: DetectedFlow,
  draft: DetectedFlow,
  input: FlowPlannerInput,
): FlowRecommendation {
  return {
    ...recommendationBase(playbook),
    klaviyoFlowIds: [active.flow.id, draft.flow.id],
    action: "monitor_replacement",
    priority: playbookPriority(playbook, input) === "high" ? "medium" : "low",
    reason: `An active ${playbook.name} flow already exists, and a draft/inactive flow also maps to the same playbook.`,
    currentState: "replacement_candidate",
    confidence: clampConfidence(Math.max(active.confidence, draft.confidence) - 0.1),
    evidence: [
      ...detectedEvidence(active),
      ...detectedEvidence(draft),
      "The draft may be a replacement, overhaul, clone, seasonal variant, or abandoned template.",
    ],
    recommendedNextAction: "Do not rebuild this flow. Compare the draft to the active flow and decide whether it is a planned replacement, an overhaul, or cleanup noise.",
  };
}

function duplicateRecommendation(
  playbook: FlowPlaybook,
  activeFlows: DetectedFlow[],
  input: FlowPlannerInput,
): FlowRecommendation {
  return {
    ...recommendationBase(playbook),
    klaviyoFlowIds: activeFlows.map((detected) => detected.flow.id),
    action: "consolidate",
    priority: playbookPriority(playbook, input) === "low" ? "medium" : playbookPriority(playbook, input),
    reason: `Multiple active Klaviyo flows map to ${playbook.name}, which may split logic, reporting, or audience controls.`,
    currentState: "duplicate_or_consolidation_audit",
    confidence: clampConfidence(Math.max(...activeFlows.map((detected) => detected.confidence))),
    evidence: activeFlows.flatMap(detectedEvidence),
    recommendedNextAction: `Audit the active ${playbook.name} flows for duplicate triggers, conflicting filters, and overlapping audiences before consolidating.`,
  };
}

function classifyUnknownFlow(flow: KlaviyoFlow): ClassifiedUnknownFlow {
  const draftLike = isDraftOrInactive(flow);
  const evidence = [
    `Klaviyo flow "${flow.name}" has status "${flow.status ?? "unknown"}".`,
    `Trigger type is "${flow.triggerType ?? "unknown"}".`,
    "No Worklin flow playbook match met the confidence threshold.",
  ];

  if (draftLike && isUnconfiguredFlow(flow)) {
    return {
      flow,
      currentState: "unconfigured_or_stale_draft",
      action: "ignore_or_cleanup",
      priority: "low",
      confidence: 0.62,
      evidence: [
        ...evidence,
        "The flow is draft/inactive and appears unconfigured, so it may be an abandoned template, clone, or stale recommendation.",
      ],
    };
  }

  return {
    flow,
    currentState: "unknown",
    action: "classify",
    priority: hasMeaningfulTrigger(flow) ? "medium" : "low",
    confidence: hasMeaningfulTrigger(flow) ? 0.42 : 0.3,
    evidence: [
      ...evidence,
      hasMeaningfulTrigger(flow)
        ? "The flow has a meaningful trigger and needs human classification before Worklin decides whether it overlaps a playbook."
        : "The flow lacks enough trigger detail for deterministic classification.",
    ],
  };
}

function unknownRecommendation(classified: ClassifiedUnknownFlow): FlowRecommendation {
  return {
    flowId: classified.flow.id,
    flowName: classified.flow.name,
    klaviyoFlowIds: [classified.flow.id],
    action: classified.action,
    priority: classified.priority,
    reason: classified.action === "ignore_or_cleanup"
      ? "This draft/inactive Klaviyo flow appears unconfigured or stale and does not match a Worklin playbook."
      : "This Klaviyo flow does not confidently map to a Worklin playbook and needs human classification.",
    currentState: classified.currentState,
    confidence: classified.confidence,
    evidence: classified.evidence,
    trigger: classified.flow.triggerType ?? "Unknown trigger",
    flowFilters: [],
    targetAudience: "Unknown until the flow is manually classified.",
    sequence: [],
    timing: [],
    requiredData: [],
    qaRisks: ["Manual classification is required before Worklin recommends build, activation, or cleanup."],
    offerRules: [],
    keyMetric: "manual_classification_required",
    recommendedNextAction: classified.action === "ignore_or_cleanup"
      ? "Confirm whether this is a stale template, duplicate, or abandoned draft before deleting or ignoring it."
      : "Inspect the Klaviyo trigger, filters, and messages, then map it to a Worklin playbook or mark it as custom.",
  };
}

function coveredFlow(detected: DetectedFlow): CoveredFlow | null {
  if (!detected.active) return null;
  return {
    flowId: detected.playbook.id,
    flowName: detected.playbook.name,
    klaviyoFlowIds: [detected.flow.id],
    status: "active",
    confidence: clampConfidence(detected.confidence),
    evidence: detectedEvidence(detected),
    keyMetric: detected.playbook.keyMetric,
  };
}

function summarize(result: {
  recommendations: FlowRecommendation[];
  coveredFlows: CoveredFlow[];
  missingCoreFlows: FlowRecommendation[];
  draftOrInactiveFlows: FlowRecommendation[];
  unknownFlows: ClassifiedUnknownFlow[];
}) {
  const high = result.recommendations.filter((recommendation) => recommendation.priority === "high").length;
  const build = result.recommendations.filter((recommendation) => recommendation.action === "build").length;
  const review = result.recommendations.length - build;

  return [
    `Flow Planner found ${result.coveredFlows.length} covered lifecycle playbook${result.coveredFlows.length === 1 ? "" : "s"}.`,
    `${build} flow${build === 1 ? "" : "s"} should be built, and ${review} existing flow${review === 1 ? "" : "s"} should be reviewed, finished, classified, consolidated, or cleaned up.`,
    high ? `${high} recommendation${high === 1 ? "" : "s"} are high priority.` : "No high-priority recommendation was produced.",
  ].join(" ");
}

export function recommendFlowPlan(
  detection: FlowDetectionResult,
  input: FlowPlannerInput = {},
): FlowPlanRecommendationResult {
  const limit = cleanLimit(input.limit);
  const detectedByPlaybook = new Map<string, DetectedFlow[]>();

  for (const detected of detection.detectedFlows) {
    const current = detectedByPlaybook.get(detected.playbook.id) ?? [];
    current.push(detected);
    detectedByPlaybook.set(detected.playbook.id, current);
  }

  const recommendations: FlowRecommendation[] = [];
  const auditRecommendations: FlowRecommendation[] = [];
  const coveredFlows: CoveredFlow[] = [];
  const missingCoreFlows: FlowRecommendation[] = [];
  const draftOrInactiveFlows: FlowRecommendation[] = [];

  for (const playbook of flowPlaybooks) {
    const matches = detectedByPlaybook.get(playbook.id) ?? [];
    const active = matches.filter((detected) => detected.active);
    const inactive = matches.filter((detected) => !detected.active);

    for (const detected of active) {
      const covered = coveredFlow(detected);
      if (covered) coveredFlows.push(covered);
    }

    if (active.length > 1) {
      auditRecommendations.push(duplicateRecommendation(playbook, active, input));
      continue;
    }

    if (active.length === 1 && inactive.length > 0) {
      draftOrInactiveFlows.push(replacementRecommendation(playbook, active[0], inactive[0], input));
      continue;
    }

    if (!active.length && inactive.length > 0) {
      draftOrInactiveFlows.push(finishRecommendation(playbook, inactive[0], input));
      continue;
    }

    if (!active.length && !inactive.length) {
      const build = buildRecommendation(playbook, input);
      missingCoreFlows.push(build);
    }
  }

  const unknownFlows = detection.unknownFlows.map(classifyUnknownFlow);
  const unknownRecommendations = unknownFlows.map(unknownRecommendation);
  const allRecommendations = sortRecommendations([
    ...missingCoreFlows,
    ...draftOrInactiveFlows,
    ...auditRecommendations,
    ...unknownRecommendations,
  ]);
  const limitedRecommendations = allRecommendations.slice(0, limit);
  const result = {
    summary: "",
    recommendations: limitedRecommendations,
    coveredFlows,
    missingCoreFlows,
    draftOrInactiveFlows,
    unknownFlows,
  };

  return {
    ...result,
    summary: summarize(result),
  };
}
