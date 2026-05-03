import { campaignPlaybooks } from "@/lib/playbooks/campaigns";
import { flowPlaybooks } from "@/lib/playbooks/flows";
import type { CampaignPlaybook, PlaybookType, WorklinPlaybook } from "@/lib/playbooks/types";

export { campaignPlaybooks } from "@/lib/playbooks/campaigns";
export { flowPlaybooks } from "@/lib/playbooks/flows";
export type {
  CampaignPlaybook,
  FlowPlannerMatch,
  FlowPlaybook,
  FlowPlaybookCategory,
  FlowPlaybookDetailLevel,
  FlowPlaybookPriorityDefault,
  FlowSequenceStep,
  PermissionLevel,
  PlaybookType,
  WorklinPlaybook,
} from "@/lib/playbooks/types";

export const playbooks: WorklinPlaybook[] = [...flowPlaybooks, ...campaignPlaybooks];

function normalize(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function listPlaybooks(type?: PlaybookType) {
  return type ? playbooks.filter((playbook) => playbook.type === type) : playbooks;
}

export function getPlaybookById(id: string) {
  const normalizedId = normalize(id);
  return playbooks.find((playbook) => normalize(playbook.id) === normalizedId) ?? null;
}

export function isPlaybookType(value: string | null): value is PlaybookType {
  return value === "flow" || value === "campaign";
}

export function findCampaignPlaybookForRecommendation(input: {
  campaignType: string;
  title: string;
  metadata?: Record<string, unknown>;
}) {
  const campaignType = normalize(input.campaignType);
  const title = normalize(input.title);
  const noDiscount = input.metadata?.noDiscount === true;

  return campaignPlaybooks.find((playbook: CampaignPlaybook) => {
    if (playbook.plannerMatch.requiresNoDiscount && !noDiscount) return false;

    const typeMatches = playbook.plannerMatch.campaignTypes.some((type) => normalize(type) === campaignType);
    if (typeMatches) return true;

    return playbook.plannerMatch.titleKeywords?.some((keyword) => title.includes(normalize(keyword))) ?? false;
  }) ?? null;
}
