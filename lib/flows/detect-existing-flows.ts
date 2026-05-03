import type { KlaviyoFlow } from "@/lib/klaviyo-flows";
import { flowPlaybooks } from "@/lib/playbooks/flows";
import type { FlowPlaybook } from "@/lib/playbooks/types";

type DetectionRule = {
  playbookId: string;
  patterns: Array<{ pattern: RegExp; reason: string; weight: number }>;
};

export type DetectedFlow = {
  flow: KlaviyoFlow;
  playbook: {
    id: string;
    name: string;
    type: "flow";
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
  };
};

const DETECTION_RULES: DetectionRule[] = [
  {
    playbookId: "welcome_series",
    patterns: [
      { pattern: /\bwelcome\b/i, reason: "Name or definition mentions welcome.", weight: 0.7 },
      { pattern: /\b(subscriber|subscribe|signup|sign up|joins? list|newsletter)\b/i, reason: "Trigger resembles a subscriber/list join.", weight: 0.35 },
    ],
  },
  {
    playbookId: "site_abandon",
    patterns: [
      { pattern: /\bsite abandon(?:ment)?\b/i, reason: "Name or definition mentions site abandon.", weight: 0.75 },
      { pattern: /\b(active on site|site visit|visited site|visits? website)\b/i, reason: "Trigger resembles a site visit.", weight: 0.45 },
    ],
  },
  {
    playbookId: "browse_abandon",
    patterns: [
      { pattern: /\bbrowse abandon(?:ment)?\b/i, reason: "Name or definition mentions browse abandon.", weight: 0.75 },
      { pattern: /\b(viewed product|product viewed|viewed collection|browse)\b/i, reason: "Trigger resembles product or collection browsing.", weight: 0.45 },
    ],
  },
  {
    playbookId: "cart_abandon",
    patterns: [
      { pattern: /\bcart abandon(?:ment)?\b/i, reason: "Name or definition mentions cart abandon.", weight: 0.75 },
      { pattern: /\b(added to cart|add to cart|cart reminder|started cart)\b/i, reason: "Trigger resembles add-to-cart behavior.", weight: 0.45 },
    ],
  },
  {
    playbookId: "checkout_abandon",
    patterns: [
      { pattern: /\bcheckout abandon(?:ment)?\b/i, reason: "Name or definition mentions checkout abandon.", weight: 0.8 },
      { pattern: /\b(started checkout|checkout started|checkout reminder)\b/i, reason: "Trigger resembles checkout start behavior.", weight: 0.5 },
    ],
  },
  {
    playbookId: "replenishment",
    patterns: [
      { pattern: /\breplenish(?:ment)?\b/i, reason: "Name or definition mentions replenishment.", weight: 0.8 },
      { pattern: /\b(restock|reorder|refill|running low|repeat purchase)\b/i, reason: "Flow resembles a restock or reorder lifecycle.", weight: 0.45 },
    ],
  },
  {
    playbookId: "winback",
    patterns: [
      { pattern: /\bwin\s?back\b/i, reason: "Name or definition mentions winback.", weight: 0.8 },
      { pattern: /\b(lapsed|reactivat|at risk|churn|sunset|wake up)\b/i, reason: "Flow resembles lapsed or reactivation lifecycle.", weight: 0.45 },
    ],
  },
];

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

function playbookById(id: string) {
  return flowPlaybooks.find((playbook) => playbook.id === id) ?? null;
}

function scoreFlow(flow: KlaviyoFlow) {
  const text = flowSearchText(flow);
  const candidates = DETECTION_RULES.map((rule) => {
    const playbook = playbookById(rule.playbookId);
    if (!playbook) return null;

    const reasons: string[] = [];
    let score = 0;
    const normalizedName = normalize(playbook.name);
    const normalizedId = normalize(playbook.id);
    const normalizedText = normalize(text);

    if (normalizedText.includes(normalizedName) || normalizedText.includes(normalizedId)) {
      score += 0.75;
      reasons.push(`Matched Worklin playbook name "${playbook.name}".`);
    }

    for (const matcher of rule.patterns) {
      if (matcher.pattern.test(text)) {
        score += matcher.weight;
        reasons.push(matcher.reason);
      }
    }

    return {
      playbook,
      score: Math.min(score, 1),
      reasons,
    };
  }).filter((candidate): candidate is { playbook: FlowPlaybook; score: number; reasons: string[] } => Boolean(candidate));

  const best = candidates.sort((a, b) => b.score - a.score)[0] ?? null;
  if (!best || best.score < 0.35) return null;
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
    .filter((playbook) => !activePlaybookIds.has(playbook.id))
    .map((playbook) => ({
      playbookId: playbook.id,
      playbookName: playbook.name,
      keyMetric: playbook.keyMetric,
      reason: "No active Klaviyo flow was detected for this Worklin flow playbook.",
    }));

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
    },
  };
}
