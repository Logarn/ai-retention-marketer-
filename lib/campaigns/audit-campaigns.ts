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
import type {
  KlaviyoCampaign,
  KlaviyoCampaignConfig,
} from "@/lib/klaviyo-campaigns";
import { listKlaviyoCampaigns } from "@/lib/klaviyo-campaigns";
import {
  getKlaviyoPerformanceConfig,
  KlaviyoPerformanceApiError,
  type KlaviyoPerformanceTimeframe,
  type NormalizedKlaviyoPerformanceRow,
  queryKlaviyoPerformance,
} from "@/lib/klaviyo-performance";
import { campaignPlaybooks } from "@/lib/playbooks/campaigns";
import type { CampaignPlaybook } from "@/lib/playbooks/types";
import {
  getProductPerformanceIntelligence,
  type ProductPerformanceIntelligenceResult,
} from "@/lib/products/product-performance-intelligence";

export type CampaignAuditInput = {
  timeframe?: KlaviyoPerformanceTimeframe | null;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number | null;
  includeDrafts?: boolean;
};

export type CampaignTheme =
  | "faq_objection"
  | "gift_self_gift"
  | "product_spotlight"
  | "fandom_category_product_specific"
  | "generic_broad_blast"
  | "vip_early_access"
  | "winback"
  | "unknown";

export type SubjectPattern = {
  hasEmoji: boolean;
  plainHuman: boolean;
  genericTopPicks: boolean;
  faqObjection: boolean;
  giftSelfGift: boolean;
  productStory: boolean;
  vipEarlyAccess: boolean;
};

export type CampaignPerformanceMetrics = {
  recipients: number | null;
  delivered: number | null;
  clickRate: number | null;
  conversionRate: number | null;
  conversionValue: number | null;
  revenuePerRecipient: number | null;
  unsubscribeRate: number | null;
  spamComplaintRate: number | null;
};

export type AuditedCampaign = {
  id: string;
  name: string;
  status: string | null;
  channel: string | null;
  subject: string | null;
  messageLabel: string | null;
  sendTime: string | null;
  created: string | null;
  updated: string | null;
  archived: boolean;
  deleted: boolean;
  draft: boolean;
  audienceIds: string[];
  listIds: string[];
  segmentIds: string[];
  playbookId: string | null;
  playbookName: string | null;
  theme: CampaignTheme;
  subjectPatterns: SubjectPattern;
  sendDay: string | null;
  sendHour: number | null;
  performance: {
    available: boolean;
    metrics: CampaignPerformanceMetrics;
    rowCount: number;
  };
  caveats: AuditCaveat[];
};

export type CampaignAuditOutput = {
  ok: true;
  readOnly: true;
  summary: {
    campaignsAnalyzed: number;
    timeframe: {
      requested: KlaviyoPerformanceTimeframe;
      startDate: string | null;
      endDate: string | null;
    };
    needsPerformanceData: boolean;
    executiveSummary: string;
    topIssues: CampaignInsightSummaryItem[];
    topOpportunities: CampaignInsightSummaryItem[];
    protectedPatterns: CampaignInsightSummaryItem[];
  };
  campaigns: AuditedCampaign[];
  insights: AuditInsight[];
  chartHints: AuditChartHint[];
  caveats: AuditCaveat[];
  workflowId?: string | null;
};

type CampaignInsightSummaryItem = {
  id: string;
  title: string;
  severity: AuditInsight["severity"];
  confidence: AuditInsight["confidence"];
  priorityScore: number;
};

type PerformanceReadResult = {
  available: boolean;
  rows: NormalizedKlaviyoPerformanceRow[];
  caveats: AuditCaveat[];
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function cleanLimit(value: number | null | undefined) {
  if (!value || !Number.isInteger(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function money(value: number) {
  return Number(value.toFixed(2));
}

function rate(value: number | null) {
  return value === null ? null : Number(value.toFixed(4));
}

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function caveat(message: string, evidenceType: AuditCaveat["evidenceType"] = "caveat"): AuditCaveat {
  return {
    message,
    evidenceType,
    severity: "unknown",
  };
}

function numericStat(rows: NormalizedKlaviyoPerformanceRow[], key: string) {
  const values = rows
    .map((row) => row.statistics[key])
    .map((value) => typeof value === "number" && Number.isFinite(value) ? value : null)
    .filter((value): value is number => value !== null);
  if (!values.length) return null;
  return Number(values.reduce((sum, value) => sum + value, 0).toFixed(4));
}

function metricFromRows(rows: NormalizedKlaviyoPerformanceRow[]): CampaignPerformanceMetrics {
  const recipients = numericStat(rows, "recipients");
  const delivered = numericStat(rows, "delivered");
  const conversionValue = numericStat(rows, "conversion_value");
  const conversions = numericStat(rows, "conversions");
  const clicks = numericStat(rows, "clicks");
  const unsubscribes = numericStat(rows, "unsubscribes") ?? numericStat(rows, "unsubscribe_uniques");
  const spamComplaints = numericStat(rows, "spam_complaints");

  return {
    recipients,
    delivered,
    clickRate: delivered && clicks !== null ? rate(clicks / delivered) : rate(numericStat(rows, "click_rate")),
    conversionRate: delivered && conversions !== null ? rate(conversions / delivered) : rate(numericStat(rows, "conversion_rate")),
    conversionValue: conversionValue === null ? null : money(conversionValue),
    revenuePerRecipient: recipients && conversionValue !== null ? money(conversionValue / recipients) : moneyOrNull(numericStat(rows, "revenue_per_recipient")),
    unsubscribeRate: delivered && unsubscribes !== null ? rate(unsubscribes / delivered) : rate(numericStat(rows, "unsubscribe_rate")),
    spamComplaintRate: delivered && spamComplaints !== null ? rate(spamComplaints / delivered) : rate(numericStat(rows, "spam_complaint_rate")),
  };
}

function moneyOrNull(value: number | null) {
  return value === null ? null : money(value);
}

function campaignText(campaign: KlaviyoCampaign) {
  return [
    campaign.name,
    campaign.subject,
    campaign.messageLabel,
    campaign.status,
    campaign.channel,
    ...(campaign.messages ?? []).flatMap((message) => [
      message.name,
      message.label,
      message.subject,
      message.previewText,
      message.channel,
    ]),
  ].filter(Boolean).join(" ");
}

function channel(campaign: KlaviyoCampaign, rows: NormalizedKlaviyoPerformanceRow[]) {
  const rowChannel = rows.map((row) => row.channel).find(Boolean) ?? null;
  const text = normalize(`${campaign.channel ?? ""} ${campaignText(campaign)} ${rowChannel ?? ""}`);
  if (/\b(sms|text message|mms)\b/.test(text)) return "sms";
  if (/\b(email|mail)\b/.test(text)) return "email";
  return campaign.channel ?? rowChannel;
}

function subject(campaign: KlaviyoCampaign) {
  return campaign.subject ?? campaign.messages?.map((message) => message.subject).find(Boolean) ?? null;
}

function subjectPatterns(subjectLine: string | null, text: string): SubjectPattern {
  const normalized = normalize(`${subjectLine ?? ""} ${text}`);
  const subjectOnly = subjectLine ?? "";
  const plainHuman =
    Boolean(subjectLine) &&
    subjectOnly.length <= 70 &&
    !/[!?]{2,}|%|FREE|SALE|NOW/.test(subjectOnly) &&
    /\b(you|your|we|our|here|this|a note)\b/i.test(subjectOnly);

  return {
    hasEmoji: /\p{Extended_Pictographic}/u.test(subjectOnly),
    plainHuman,
    genericTopPicks: /\b(top picks|our picks|favorites|faves|best sellers?|just for you|shop now)\b/.test(normalized),
    faqObjection: /\b(faq|question|questions|how to|why|what|guide|tips|myth|mistake|concern|objection)\b/.test(normalized),
    giftSelfGift: /\b(gift|gifting|self gift|self-gift|treat yourself|for them|for you)\b/.test(normalized),
    productStory: /\b(product|spotlight|story|behind|made|meet|introducing|launch|new|collection|category)\b/.test(normalized),
    vipEarlyAccess: /\b(vip|early access|preview|exclusive|first look)\b/.test(normalized),
  };
}

function themeForCampaign(campaign: KlaviyoCampaign, patterns: SubjectPattern): CampaignTheme {
  const text = normalize(campaignText(campaign));
  if (patterns.vipEarlyAccess) return "vip_early_access";
  if (/\b(winback|win back|come back|at risk|lapsed|miss you)\b/.test(text)) return "winback";
  if (patterns.faqObjection) return "faq_objection";
  if (patterns.giftSelfGift) return "gift_self_gift";
  if (patterns.productStory) return "product_spotlight";
  if (/\b(category|collection|fandom|fan|routine|skincare|apparel|shoe|bag|watch)\b/.test(text)) return "fandom_category_product_specific";
  if (patterns.genericTopPicks || /\b(blast|newsletter|promo|sale|top picks)\b/.test(text)) return "generic_broad_blast";
  return "unknown";
}

function playbookForCampaign(campaign: KlaviyoCampaign, theme: CampaignTheme): CampaignPlaybook | null {
  const text = normalize(campaignText(campaign));

  if (theme === "vip_early_access") return campaignPlaybooks.find((playbook) => playbook.id === "vip_early_access") ?? null;
  if (theme === "winback") return campaignPlaybooks.find((playbook) => playbook.id === "at_risk_winback") ?? null;
  if (theme === "faq_objection") return campaignPlaybooks.find((playbook) => playbook.id === "no_discount_education") ?? null;
  if (theme === "product_spotlight" || theme === "fandom_category_product_specific") {
    return campaignPlaybooks.find((playbook) => playbook.id === "product_spotlight") ?? null;
  }

  return campaignPlaybooks.find((playbook) =>
    playbook.plannerMatch.titleKeywords?.some((keyword) => text.includes(normalize(keyword))) ??
    false,
  ) ?? null;
}

function sendTiming(campaign: KlaviyoCampaign) {
  const value = campaign.sendTime ?? campaign.scheduledAt ?? campaign.created;
  if (!value) return { sendDay: null, sendHour: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { sendDay: null, sendHour: null };
  return {
    sendDay: date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    sendHour: date.getUTCHours(),
  };
}

async function readPerformance(input: {
  campaignIds: string[];
  timeframe: KlaviyoPerformanceTimeframe;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<PerformanceReadResult> {
  const configResult = getKlaviyoPerformanceConfig();
  if (!configResult.ok) {
    return {
      available: false,
      rows: [],
      caveats: [caveat(`Klaviyo campaign performance read is not configured: ${configResult.missingConfig.join(", ")}.`, "performance")],
    };
  }

  if (!configResult.config.conversionMetricId) {
    return {
      available: false,
      rows: [],
      caveats: [caveat("Klaviyo campaign performance metrics are unavailable because KLAVIYO_CONVERSION_METRIC_ID is not configured.", "performance")],
    };
  }

  if (input.timeframe === "custom" && (!input.startDate || !input.endDate)) {
    return {
      available: false,
      rows: [],
      caveats: [caveat("Custom campaign performance windows require startDate and endDate; metadata audit continued without performance rows.", "performance")],
    };
  }

  try {
    const result = await queryKlaviyoPerformance(configResult.config, {
      type: "campaign",
      timeframe: input.timeframe,
      startDate: input.startDate ?? undefined,
      endDate: input.endDate ?? undefined,
      ids: input.campaignIds,
      statistics: [
        "recipients",
        "delivered",
        "clicks",
        "click_rate",
        "conversions",
        "conversion_rate",
        "conversion_value",
        "revenue_per_recipient",
        "unsubscribes",
        "unsubscribe_uniques",
        "unsubscribe_rate",
        "spam_complaints",
        "spam_complaint_rate",
      ],
    });

    return {
      available: result.rows.length > 0,
      rows: result.rows,
      caveats: result.rows.length
        ? []
        : [caveat("Klaviyo campaign performance read returned no rows for the selected campaigns/timeframe.", "performance")],
    };
  } catch (error) {
    if (error instanceof KlaviyoPerformanceApiError) {
      return {
        available: false,
        rows: [],
        caveats: [caveat(
          error.errors.some((item) => /conversion metric/i.test(`${item.title} ${item.detail ?? ""}`))
            ? "Klaviyo campaign performance metrics are unavailable because conversion metric configuration is missing or invalid."
            : "Klaviyo campaign performance metrics are unavailable; metadata and playbook checks were still completed.",
          "performance",
        )],
      };
    }

    return {
      available: false,
      rows: [],
      caveats: [caveat("Klaviyo campaign performance metrics could not be read; metadata and playbook checks were still completed.", "performance")],
    };
  }
}

function rowsByCampaign(rows: NormalizedKlaviyoPerformanceRow[]) {
  const grouped = new Map<string, NormalizedKlaviyoPerformanceRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.id) ?? [];
    current.push(row);
    grouped.set(row.id, current);
  }
  return grouped;
}

function productEvidence(productIntelligence: ProductPerformanceIntelligenceResult | null): AuditEvidence[] {
  const anchors = productIntelligence?.tiers.revenueAnchors.slice(0, 3) ?? [];
  if (!anchors.length) return [];

  return [{
    type: "product",
    label: `${anchors.length} revenue anchor products can inform product spotlight and VIP campaign scaling.`,
    value: anchors.map((item) => item.name).join(", "),
    source: "product_performance_intelligence",
    metricKey: "revenueAnchors",
  }];
}

function auditCampaign(campaign: KlaviyoCampaign, rows: NormalizedKlaviyoPerformanceRow[]): AuditedCampaign {
  const text = campaignText(campaign);
  const subjectLine = subject(campaign);
  const patterns = subjectPatterns(subjectLine, text);
  const theme = themeForCampaign(campaign, patterns);
  const playbook = playbookForCampaign(campaign, theme);
  const timing = sendTiming(campaign);
  const metrics = metricFromRows(rows);

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    channel: channel(campaign, rows),
    subject: subjectLine,
    messageLabel: campaign.messageLabel,
    sendTime: campaign.sendTime,
    created: campaign.created,
    updated: campaign.updated,
    archived: campaign.archived,
    deleted: campaign.deleted,
    draft: campaign.draft,
    audienceIds: campaign.audienceIds,
    listIds: campaign.listIds,
    segmentIds: campaign.segmentIds,
    playbookId: playbook?.id ?? null,
    playbookName: playbook?.name ?? null,
    theme,
    subjectPatterns: patterns,
    sendDay: timing.sendDay,
    sendHour: timing.sendHour,
    performance: {
      available: rows.length > 0,
      metrics,
      rowCount: rows.length,
    },
    caveats: [],
  };
}

function campaignEntity(campaign: AuditedCampaign) {
  return [{
    id: campaign.id,
    type: "campaign" as const,
    name: campaign.name,
    source: "klaviyo_campaign_read",
    metadata: {
      status: campaign.status,
      channel: campaign.channel,
      theme: campaign.theme,
      playbookId: campaign.playbookId,
    },
  }];
}

function commonEvidence(campaigns: AuditedCampaign[]): AuditEvidence[] {
  return [
    {
      type: "sample_size",
      label: `${campaigns.length} campaign metadata records were analyzed.`,
      value: campaigns.length,
      metricKey: "campaigns_analyzed",
      source: "klaviyo_campaign_read",
    },
  ];
}

function buildNoCampaignInsight(caveats: AuditCaveat[]) {
  return createAuditInsight({
    id: "campaign_monitor_no_campaigns_available",
    title: "Connect campaign history before campaign audit",
    summary: "No Klaviyo campaigns were available for the selected request, so Worklin cannot identify campaign winners, weak patterns, or channel efficiency yet.",
    domain: "campaign",
    insightType: "monitor",
    severity: "unknown",
    confidence: "weak",
    evidence: [],
    caveats,
    recommendedActions: [{
      label: "Confirm Klaviyo campaign read scopes and campaign history, then rerun the campaign audit.",
      actionType: "monitor",
      priority: "medium",
      owner: "retention",
    }],
    chartHints: [
      createChartHint({
        type: "table",
        title: "Campaign metadata availability",
        metricKeys: ["campaigns_analyzed", "campaign_status", "send_time"],
        entityIds: [],
        description: "Show whether campaign metadata exists before deeper audit.",
      }),
    ],
  });
}

function buildInsights(input: {
  campaigns: AuditedCampaign[];
  performance: PerformanceReadResult;
  productIntelligence: ProductPerformanceIntelligenceResult | null;
}) {
  const campaigns = input.campaigns;
  const insights: AuditInsightInput[] = [];
  const metadataEvidence = commonEvidence(campaigns);
  const performanceCaveats = input.performance.caveats;
  const performanceAvailable = campaigns.some((campaign) => campaign.performance.available);
  const productContext = productEvidence(input.productIntelligence);

  if (!campaigns.length) return [buildNoCampaignInsight(performanceCaveats)];

  if (!performanceAvailable) {
    insights.push({
      id: "campaign_monitor_performance_data",
      title: "Add campaign performance data",
      summary: "Campaign metadata is available, but performance rows are unavailable, so revenue, RPR, channel efficiency, and weak-campaign conclusions remain limited.",
      domain: "revenue",
      insightType: "monitor",
      severity: "unknown",
      confidence: "weak",
      evidence: metadataEvidence,
      caveats: performanceCaveats,
      recommendedActions: [{
        label: "Configure Klaviyo conversion metric reporting and rerun the campaign audit for performance-backed prioritization.",
        actionType: "monitor",
        priority: "medium",
        owner: "analytics",
      }],
      chartHints: [
        createChartHint({
          type: "scorecard",
          title: "Campaign performance availability",
          metricKeys: ["campaigns_analyzed", "conversion_value", "revenue_per_recipient"],
          entityIds: campaigns.map((campaign) => campaign.id).slice(0, 12),
          description: "Display metadata availability and missing performance coverage.",
        }),
      ],
    });
  }

  const genericCampaigns = campaigns.filter((campaign) => campaign.theme === "generic_broad_blast");
  if (genericCampaigns.length >= Math.max(2, Math.ceil(campaigns.length * 0.35))) {
    insights.push({
      id: "campaign_fix_generic_broad_blasts",
      title: "Fix generic broad-blast campaign pattern",
      summary: "A meaningful share of recent campaigns looks generic or broad, which weakens audience fit and future learning unless segmentation and angles become more specific.",
      domain: "campaign",
      insightType: "fix",
      severity: "warning",
      confidence: "directional",
      evidence: [
        ...metadataEvidence,
        {
          type: "content",
          label: `${genericCampaigns.length} campaigns matched generic broad-blast subject/name patterns.`,
          value: genericCampaigns.length,
          metricKey: "generic_broad_blast_count",
          source: "klaviyo_campaign_read",
        },
      ],
      caveats: performanceCaveats,
      recommendedActions: [{
        label: "Segment harder and replace generic campaign angles with product, objection, VIP, winback, or audience-specific themes.",
        actionType: "fix",
        priority: "high",
        owner: "retention",
      }],
      affectedEntities: genericCampaigns.slice(0, 6).flatMap(campaignEntity),
      chartHints: [
        createChartHint({
          type: "pie",
          title: "Campaign theme mix",
          metricKeys: ["campaign_theme", "campaign_count"],
          entityIds: genericCampaigns.map((campaign) => campaign.id).slice(0, 12),
          description: "Show generic campaigns against more specific themes.",
        }),
      ],
    });
  }

  const faqCampaigns = campaigns.filter((campaign) => campaign.theme === "faq_objection");
  if (faqCampaigns.length) {
    insights.push({
      id: "campaign_scale_faq_objection_angles",
      title: "Scale FAQ and objection-handling campaign angles",
      summary: "FAQ, guide, or objection-handling angles appear in campaign metadata and are useful patterns to test across product and lifecycle segments.",
      domain: "creative",
      insightType: "scale",
      severity: "opportunity",
      confidence: performanceAvailable ? "directional" : "weak",
      evidence: [
        ...metadataEvidence,
        {
          type: "content",
          label: `${faqCampaigns.length} campaigns used FAQ, guide, or objection-handling signals.`,
          value: faqCampaigns.length,
          metricKey: "faq_objection_campaign_count",
          source: "klaviyo_campaign_read",
        },
        ...productContext,
      ],
      caveats: performanceCaveats,
      recommendedActions: [{
        label: "Create a follow-up FAQ/objection campaign around the highest-confidence product or segment.",
        actionType: "scale",
        priority: "medium",
        owner: "creative",
      }],
      affectedEntities: faqCampaigns.slice(0, 6).flatMap(campaignEntity),
      chartHints: [
        createChartHint({
          type: "bar",
          title: "FAQ and objection campaign coverage",
          metricKeys: ["campaign_theme", "campaign_count", "click_rate"],
          entityIds: faqCampaigns.map((campaign) => campaign.id).slice(0, 12),
          description: "Compare FAQ/objection campaigns with other campaign themes.",
        }),
      ],
    });
  }

  const productCampaigns = campaigns.filter((campaign) => campaign.theme === "product_spotlight" || campaign.theme === "fandom_category_product_specific");
  if (productCampaigns.length && productContext.length) {
    insights.push({
      id: "campaign_scale_product_truth",
      title: "Scale campaigns around proven product truth",
      summary: "Product-themed campaigns can be anchored to revenue-winning products from Product Performance Intelligence instead of broad merchandising guesses.",
      domain: "product",
      insightType: "scale",
      severity: "opportunity",
      confidence: "directional",
      evidence: [
        ...metadataEvidence,
        ...productContext,
      ],
      caveats: performanceCaveats,
      recommendedActions: [{
        label: "Use revenue anchors or add-on boosters as the product spine for the next product spotlight, VIP, or winback campaign.",
        actionType: "scale",
        priority: "medium",
        owner: "retention",
      }],
      affectedEntities: productCampaigns.slice(0, 6).flatMap(campaignEntity),
      chartHints: [
        createChartHint({
          type: "table",
          title: "Campaign-product opportunity map",
          metricKeys: ["campaign_theme", "revenueAnchors", "addOnBoosters"],
          entityIds: productCampaigns.map((campaign) => campaign.id).slice(0, 12),
          description: "Map product-themed campaigns to product intelligence tiers.",
        }),
      ],
    });
  }

  const smsRiskCampaigns = campaigns.filter((campaign) =>
    normalize(campaign.channel) === "sms" &&
    ((campaign.performance.metrics.unsubscribeRate ?? 0) >= 0.02 ||
      (campaign.performance.metrics.spamComplaintRate ?? 0) >= 0.002),
  );
  if (smsRiskCampaigns.length) {
    insights.push({
      id: "campaign_pause_sms_pressure",
      title: "Pause or tighten SMS campaigns with risk pressure",
      summary: "SMS campaigns showing unsubscribe or complaint pressure should be paused, segmented harder, or rewritten before increasing volume.",
      domain: "deliverability",
      insightType: "pause",
      severity: "issue",
      confidence: "strong",
      evidence: smsRiskCampaigns.flatMap((campaign): AuditEvidence[] => [
        {
          type: "performance",
          label: `${campaign.name} SMS unsubscribe rate.`,
          value: campaign.performance.metrics.unsubscribeRate,
          metricKey: "unsubscribe_rate",
          source: "klaviyo_performance_read",
          entityId: campaign.id,
        },
      ]),
      caveats: [],
      recommendedActions: [{
        label: "Pause risky SMS expansion until segment quality, consent source, and message pressure are audited.",
        actionType: "pause",
        priority: "high",
        owner: "retention",
      }],
      affectedEntities: smsRiskCampaigns.flatMap(campaignEntity),
      chartHints: [
        createChartHint({
          type: "bar",
          title: "SMS risk pressure",
          metricKeys: ["unsubscribe_rate", "spam_complaint_rate"],
          entityIds: smsRiskCampaigns.map((campaign) => campaign.id),
          description: "Compare SMS unsubscribe and complaint pressure by campaign.",
        }),
      ],
    });
  }

  if (performanceAvailable) {
    const values = campaigns
      .map((campaign) => campaign.performance.metrics.conversionValue)
      .filter((value): value is number => value !== null);
    const rprs = campaigns
      .map((campaign) => campaign.performance.metrics.revenuePerRecipient)
      .filter((value): value is number => value !== null);
    const delivered = campaigns
      .map((campaign) => campaign.performance.metrics.delivered)
      .filter((value): value is number => value !== null);
    const medianRevenue = median(values);
    const medianRpr = median(rprs);
    const medianDelivered = median(delivered);
    const topCampaigns = campaigns
      .filter((campaign) =>
        (campaign.performance.metrics.conversionValue ?? 0) > 0 &&
        ((campaign.performance.metrics.conversionValue ?? 0) >= medianRevenue ||
          (campaign.performance.metrics.revenuePerRecipient ?? 0) >= medianRpr),
      )
      .sort((a, b) =>
        (b.performance.metrics.conversionValue ?? 0) - (a.performance.metrics.conversionValue ?? 0) ||
        (b.performance.metrics.revenuePerRecipient ?? 0) - (a.performance.metrics.revenuePerRecipient ?? 0),
      )
      .slice(0, 3);
    const weakCampaigns = campaigns
      .filter((campaign) =>
        (campaign.performance.metrics.delivered ?? 0) >= Math.max(250, medianDelivered) &&
        (campaign.performance.metrics.conversionValue ?? 0) <= medianRevenue &&
        (campaign.performance.metrics.revenuePerRecipient ?? 0) <= medianRpr,
      )
      .slice(0, 5);

    if (topCampaigns.length) {
      insights.push({
        id: "campaign_protect_top_revenue_patterns",
        title: "Protect top campaign revenue patterns",
        summary: "The strongest campaign patterns should be protected and reused as a controlled testing spine before chasing net-new campaign ideas.",
        domain: "revenue",
        insightType: "protect",
        severity: "good",
        confidence: campaigns.length >= 5 ? "strong" : "directional",
        evidence: topCampaigns.flatMap((campaign): AuditEvidence[] => [
          {
            type: "performance",
            label: `${campaign.name} conversion value.`,
            value: campaign.performance.metrics.conversionValue,
            metricKey: "conversion_value",
            source: "klaviyo_performance_read",
            entityId: campaign.id,
          },
          {
            type: "performance",
            label: `${campaign.name} revenue per recipient.`,
            value: campaign.performance.metrics.revenuePerRecipient,
            metricKey: "revenue_per_recipient",
            source: "klaviyo_performance_read",
            entityId: campaign.id,
          },
        ]),
        caveats: campaigns.length < 5 ? [caveat("Small campaign sample; treat protected pattern conclusions as directional.", "sample_size")] : [],
        recommendedActions: [{
          label: "Reuse the winning campaign theme, audience, and product angle as a benchmark for the next campaign test.",
          actionType: "protect",
          priority: "medium",
          owner: "retention",
        }],
        affectedEntities: topCampaigns.flatMap(campaignEntity),
        chartHints: [
          createChartHint({
            type: "bar",
            title: "Top campaigns by revenue and RPR",
            metricKeys: ["conversion_value", "revenue_per_recipient"],
            entityIds: topCampaigns.map((campaign) => campaign.id),
            description: "Rank top campaign patterns by revenue and efficiency.",
          }),
        ],
      });
    }

    if (weakCampaigns.length) {
      insights.push({
        id: "campaign_fix_large_audience_low_revenue",
        title: "Fix large-audience campaigns with weak revenue efficiency",
        summary: "Some campaigns appear to have enough audience volume but weak revenue efficiency, so the next step is audience and angle cleanup before repeating them.",
        domain: "revenue",
        insightType: "fix",
        severity: "warning",
        confidence: campaigns.length >= 5 ? "strong" : "directional",
        evidence: weakCampaigns.flatMap((campaign): AuditEvidence[] => [
          {
            type: "performance",
            label: `${campaign.name} delivered audience.`,
            value: campaign.performance.metrics.delivered,
            metricKey: "delivered",
            source: "klaviyo_performance_read",
            entityId: campaign.id,
          },
          {
            type: "performance",
            label: `${campaign.name} revenue per recipient.`,
            value: campaign.performance.metrics.revenuePerRecipient,
            metricKey: "revenue_per_recipient",
            source: "klaviyo_performance_read",
            entityId: campaign.id,
          },
        ]),
        caveats: campaigns.length < 5 ? [caveat("Small campaign sample; weak-campaign conclusions are directional.", "sample_size")] : [],
        recommendedActions: [{
          label: "Segment harder, clarify the campaign promise, and avoid repeating broad low-efficiency blasts without a new test hypothesis.",
          actionType: "fix",
          priority: "high",
          owner: "retention",
        }],
        affectedEntities: weakCampaigns.flatMap(campaignEntity),
        chartHints: [
          createChartHint({
            type: "scatter",
            title: "Audience volume vs revenue efficiency",
            metricKeys: ["delivered", "revenue_per_recipient", "conversion_value"],
            entityIds: weakCampaigns.map((campaign) => campaign.id),
            description: "Future UI can render as scatter; v0 falls back to table if scatter is unsupported.",
          }),
        ],
      });
    }

    const timingCampaigns = campaigns.filter((campaign) => campaign.sendDay && campaign.performance.metrics.conversionValue !== null);
    if (timingCampaigns.length >= 5) {
      const byDay = new Map<string, number>();
      for (const campaign of timingCampaigns) {
        byDay.set(campaign.sendDay!, (byDay.get(campaign.sendDay!) ?? 0) + (campaign.performance.metrics.conversionValue ?? 0));
      }
      const bestDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
      if (bestDay) {
        insights.push({
          id: "campaign_monitor_send_timing",
          title: "Monitor campaign send timing signals",
          summary: `${bestDay[0]} has the strongest observed conversion value in this small timing read, but timing needs controlled testing before becoming a rule.`,
          domain: "campaign",
          insightType: "monitor",
          severity: "opportunity",
          confidence: "directional",
          evidence: [{
            type: "metric",
            label: `${bestDay[0]} conversion value across analyzed campaigns.`,
            value: money(bestDay[1]),
            metricKey: "conversion_value_by_send_day",
            source: "klaviyo_campaign_read",
          }],
          caveats: [caveat("Campaign timing signal is observational and may be confounded by audience, offer, and product mix.", "sample_size")],
          recommendedActions: [{
            label: "Use timing as a test hypothesis, not a fixed send rule.",
            actionType: "monitor",
            priority: "low",
            owner: "retention",
          }],
          chartHints: [
            createChartHint({
              type: "heatmap",
              title: "Send day and hour signal",
              metricKeys: ["send_day", "send_hour", "conversion_value"],
              entityIds: timingCampaigns.map((campaign) => campaign.id).slice(0, 20),
              description: "Visualize send timing against campaign outcomes.",
            }),
          ],
        });
      }
    }
  }

  if (!insights.length) {
    insights.push({
      id: "campaign_audit_metadata_only",
      title: "Audit campaign metadata before deeper recommendations",
      summary: "Campaign metadata is available, but Worklin needs either more campaign volume or performance data before making stronger scale/fix/pause recommendations.",
      domain: "campaign",
      insightType: "audit",
      severity: "unknown",
      confidence: "weak",
      evidence: metadataEvidence,
      caveats: performanceCaveats,
      recommendedActions: [{
        label: "Review campaign names, subjects, channels, audiences, and playbook fit while performance data is connected.",
        actionType: "audit",
        priority: "medium",
        owner: "retention",
      }],
      chartHints: [
        createChartHint({
          type: "table",
          title: "Campaign metadata audit",
          metricKeys: ["campaign_status", "channel", "subject_pattern", "theme"],
          entityIds: campaigns.map((campaign) => campaign.id).slice(0, 20),
          description: "Review campaign metadata while performance data is limited.",
        }),
      ],
    });
  }

  return rankAuditInsights(insights.map((insight) => createAuditInsight(insight)));
}

function summaryItem(insight: AuditInsight): CampaignInsightSummaryItem {
  return {
    id: insight.id,
    title: insight.title,
    severity: insight.severity,
    confidence: insight.confidence,
    priorityScore: insight.priorityScore,
  };
}

function collectCaveats(input: {
  campaignReadCaveats: string[];
  performance: PerformanceReadResult;
  productIntelligence: ProductPerformanceIntelligenceResult | null;
  productError: boolean;
  campaigns: AuditedCampaign[];
}) {
  const caveats = [
    ...input.campaignReadCaveats.map((message) => caveat(message, "caveat")),
    ...input.performance.caveats,
    ...(input.productIntelligence?.caveats ?? []).map((message) => caveat(message, "product")),
    ...(input.productError ? [caveat("Product Performance Intelligence could not be read; product-campaign connections were skipped.", "product")] : []),
    ...(input.campaigns.some((campaign) => campaign.draft)
      ? [caveat("Draft campaigns are included in this audit; performance conclusions require sent campaign data.", "sample_size")]
      : []),
    ...(input.campaigns.length > 0 && input.campaigns.length < 5
      ? [caveat("Small campaign sample; treat pattern and timing recommendations as directional.", "sample_size")]
      : []),
  ];
  const seen = new Set<string>();
  return caveats.filter((item) => {
    if (seen.has(item.message)) return false;
    seen.add(item.message);
    return true;
  });
}

export async function auditKlaviyoCampaigns(
  config: KlaviyoCampaignConfig,
  input: CampaignAuditInput = {},
): Promise<Omit<CampaignAuditOutput, "workflowId">> {
  const timeframe = input.timeframe ?? "last_90_days";
  const limit = cleanLimit(input.limit);
  const campaignResult = await listKlaviyoCampaigns(config, {
    limit,
    includeDrafts: input.includeDrafts ?? true,
    includeMessages: true,
  });
  const campaignIds = campaignResult.campaigns.map((campaign) => campaign.id);
  const performance = await readPerformance({
    campaignIds,
    timeframe,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  let productError = false;
  const productIntelligence = await getProductPerformanceIntelligence({ limit: 5, timeframe })
    .catch(() => {
      productError = true;
      return null;
    });
  const groupedRows = rowsByCampaign(performance.rows);
  const campaigns = campaignResult.campaigns.map((campaign) =>
    auditCampaign(campaign, groupedRows.get(campaign.id) ?? []),
  );
  const caveats = collectCaveats({
    campaignReadCaveats: campaignResult.caveats,
    performance,
    productIntelligence,
    productError,
    campaigns,
  });
  const insights = buildInsights({ campaigns, performance, productIntelligence });
  const insightSummary = summarizeAuditInsights(insights);

  return {
    ok: true,
    readOnly: true,
    summary: {
      campaignsAnalyzed: campaigns.length,
      timeframe: {
        requested: timeframe,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
      },
      needsPerformanceData: !performance.available || campaigns.some((campaign) => !campaign.performance.available),
      executiveSummary: insightSummary.executiveSummary,
      topIssues: insights
        .filter((insight) => insight.severity === "critical" || insight.severity === "issue" || insight.severity === "warning")
        .slice(0, 5)
        .map(summaryItem),
      topOpportunities: insights
        .filter((insight) => insight.severity === "opportunity")
        .slice(0, 5)
        .map(summaryItem),
      protectedPatterns: insights
        .filter((insight) => insight.insightType === "protect" || insight.severity === "good")
        .slice(0, 5)
        .map(summaryItem),
    },
    campaigns,
    insights,
    chartHints: collectAuditChartHints(insights),
    caveats,
  };
}
