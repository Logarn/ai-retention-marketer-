import type { KlaviyoFlow } from "@/lib/klaviyo-flows";
import { flowPlaybooks, isCoreRequiredFlowPlaybook } from "@/lib/playbooks/flows";
import type { FlowPlaybook } from "@/lib/playbooks/types";

export type DetectedFlow = {
  flow: KlaviyoFlow;
  playbook: {
    id: string;
    name: string;
    type: "flow";
    category: FlowPlaybook["category"];
    detailLevel: FlowPlaybook["detailLevel"];
    priorityDefault: FlowPlaybook["priorityDefault"];
    keyMetric: string;
    permissionLevel: FlowPlaybook["permissionLevel"];
  };
  confidence: number;
  reasons: string[];
  active: boolean;
  auditPriority: "ok" | "inactive" | "archived";
};

export type MissingCoreFlow = {
  playbookId: string;
  playbookName: string;
  category: FlowPlaybook["category"];
  detailLevel: FlowPlaybook["detailLevel"];
  priorityDefault: FlowPlaybook["priorityDefault"];
  keyMetric: string;
  reason: string;
};

export type DraftOrInactiveFlow = {
  flow: KlaviyoFlow;
  playbook: DetectedFlow["playbook"] | null;
  confidence: number | null;
  reasons: string[];
  active: false;
  auditPriority: "inactive" | "archived";
};

export type FlowDetectionResult = {
  detectedFlows: DetectedFlow[];
  unknownFlows: KlaviyoFlow[];
  missingCoreFlows: MissingCoreFlow[];
  draftOrInactiveFlows: DraftOrInactiveFlow[];
  summary: {
    totalFlows: number;
    detectedCount: number;
    unknownCount: number;
    activeDetectedCount: number;
    missingCoreCount: number;
    draftOrInactiveCount: number;
    coveredPlaybooks: string[];
    missingPlaybooks: string[];
    detectedByCategory: Record<FlowPlaybook["category"], number>;
    missingCorePlaybooks: string[];
  };
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function flowSearchText(flow: KlaviyoFlow) {
  return [
    flow.name,
    flow.status,
    flow.triggerType,
    flow.definition ? JSON.stringify(flow.definition) : null,
    ...(flow.actions ?? []).flatMap((action) => [
      action.name,
      action.status,
      action.actionType,
      action.definition ? JSON.stringify(action.definition) : null,
    ]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function isActiveFlow(flow: KlaviyoFlow) {
  if (flow.archived) return false;
  const status = normalize(flow.status ?? "");
  return status === "live" || status === "active" || status === "enabled";
}

function auditPriority(flow: KlaviyoFlow): DetectedFlow["auditPriority"] {
  if (flow.archived) return "archived";
  return isActiveFlow(flow) ? "ok" : "inactive";
}

function inactiveAuditPriority(flow: KlaviyoFlow): DraftOrInactiveFlow["auditPriority"] {
  return flow.archived ? "archived" : "inactive";
}

function escapedRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesPhrase(normalizedText: string, phrase: string) {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return false;
  return new RegExp(`\\b${escapedRegExp(normalizedPhrase).replace(/\s+/g, "\\s+")}\\b`).test(normalizedText);
}

function minimumConfidence(playbook: FlowPlaybook) {
  if (playbook.detailLevel === "placeholder") return 0.7;
  if (playbook.category === "infrastructure") return 0.62;
  if (playbook.category === "conditional" || playbook.category === "secondary") return 0.52;
  return 0.35;
}

function scorePlaybook(playbook: FlowPlaybook, text: string) {
  const normalizedText = normalize(text);
  const reasons: string[] = [];
  let score = 0;

  if (includesPhrase(normalizedText, playbook.name) || includesPhrase(normalizedText, playbook.id)) {
    score += playbook.category === "core" ? 0.75 : 0.68;
    reasons.push(`Matched Worklin playbook name "${playbook.name}".`);
  }

  for (const alias of playbook.plannerMatch.aliases) {
    if (!includesPhrase(normalizedText, alias)) continue;
    const weight = normalize(alias).includes(" ") ? 0.62 : 0.48;
    score += weight;
    reasons.push(`Matched flow alias "${alias}" for ${playbook.name}.`);
  }

  let triggerKeywordScore = 0;
  for (const keyword of playbook.plannerMatch.triggerKeywords ?? []) {
    if (!includesPhrase(normalizedText, keyword)) continue;
    triggerKeywordScore += 0.18;
    reasons.push(`Trigger or definition includes "${keyword}".`);
  }

  score += Math.min(triggerKeywordScore, 0.36);

  return {
    playbook,
    score: Math.min(score, 1),
    reasons: Array.from(new Set(reasons)),
  };
}

function scoreFlow(flow: KlaviyoFlow) {
  const text = flowSearchText(flow);
  const candidates = flowPlaybooks.map((playbook) => scorePlaybook(playbook, text));

  const best = candidates.sort((a, b) => b.score - a.score)[0] ?? null;
  if (!best || best.score < minimumConfidence(best.playbook)) return null;
  return best;
}

export function detectExistingFlows(flows: KlaviyoFlow[]): FlowDetectionResult {
  const detectedFlows: DetectedFlow[] = [];
  const unknownFlows: KlaviyoFlow[] = [];

  for (const flow of flows) {
    const match = scoreFlow(flow);
    if (!match) {
      unknownFlows.push(flow);
      continue;
    }

    detectedFlows.push({
      flow,
      playbook: {
        id: match.playbook.id,
        name: match.playbook.name,
        type: "flow",
        category: match.playbook.category,
        detailLevel: match.playbook.detailLevel,
        priorityDefault: match.playbook.priorityDefault,
        keyMetric: match.playbook.keyMetric,
        permissionLevel: match.playbook.permissionLevel,
      },
      confidence: match.score,
      reasons: match.reasons,
      active: isActiveFlow(flow),
      auditPriority: auditPriority(flow),
    });
  }

  const activePlaybookIds = new Set(
    detectedFlows
      .filter((detected) => detected.active)
      .map((detected) => detected.playbook.id),
  );
  const draftOrInactiveFlows: DraftOrInactiveFlow[] = [
    ...detectedFlows
      .filter((detected) => !detected.active)
      .map((detected) => ({
        flow: detected.flow,
        playbook: detected.playbook,
        confidence: detected.confidence,
        reasons: detected.reasons,
        active: false as const,
        auditPriority: inactiveAuditPriority(detected.flow),
      })),
    ...unknownFlows
      .filter((flow) => !isActiveFlow(flow))
      .map((flow) => ({
        flow,
        playbook: null,
        confidence: null,
        reasons: ["Flow is draft, inactive, or archived but did not match a Worklin playbook."],
        active: false as const,
        auditPriority: inactiveAuditPriority(flow),
      })),
  ];
  const missingCoreFlows = flowPlaybooks
    .filter(isCoreRequiredFlowPlaybook)
    .filter((playbook) => !activePlaybookIds.has(playbook.id))
    .map((playbook) => ({
      playbookId: playbook.id,
      playbookName: playbook.name,
      category: playbook.category,
      detailLevel: playbook.detailLevel,
      priorityDefault: playbook.priorityDefault,
      keyMetric: playbook.keyMetric,
      reason: "No active Klaviyo flow was detected for this core Worklin flow playbook.",
    }));
  const detectedByCategory = detectedFlows.reduce<Record<FlowPlaybook["category"], number>>((counts, detected) => {
    counts[detected.playbook.category] += 1;
    return counts;
  }, {
    core: 0,
    secondary: 0,
    conditional: 0,
    infrastructure: 0,
  });

  return {
    detectedFlows,
    unknownFlows,
    missingCoreFlows,
    draftOrInactiveFlows,
    summary: {
      totalFlows: flows.length,
      detectedCount: detectedFlows.length,
      unknownCount: unknownFlows.length,
      activeDetectedCount: detectedFlows.filter((detected) => detected.active).length,
      missingCoreCount: missingCoreFlows.length,
      draftOrInactiveCount: draftOrInactiveFlows.length,
      coveredPlaybooks: Array.from(activePlaybookIds),
      missingPlaybooks: missingCoreFlows.map((flow) => flow.playbookId),
      detectedByCategory,
      missingCorePlaybooks: missingCoreFlows.map((flow) => flow.playbookId),
    },
  };
}
