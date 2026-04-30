import { Prisma } from "@prisma/client";
import { z } from "zod";
import { SEGMENT_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CAMPAIGN_COUNT = 3;
const MAX_CAMPAIGN_COUNT = 10;
const MAX_RANGE_DAYS = 90;

const generatePlanSchema = z
  .object({
    startDate: z.unknown().optional(),
    endDate: z.unknown().optional(),
    campaignCount: z.unknown().optional(),
    focus: z.string().trim().max(240).optional().nullable(),
    constraints: z.union([z.string(), z.array(z.string())]).optional().nullable(),
    preferredSegments: z.union([z.string(), z.array(z.string())]).optional().nullable(),
    excludedCampaignTypes: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  })
  .passthrough();

export type PlannerGenerateInput = {
  startDate: Date;
  endDate: Date;
  campaignCount: number;
  focus: string | null;
  constraints: string[];
  preferredSegments: string[];
  excludedCampaignTypes: string[];
};

export type PlannerValidationResult =
  | { ok: true; data: PlannerGenerateInput }
  | { ok: false; issues: string[] };

type SegmentStat = {
  key: string;
  label: string;
  count: number;
  averageClv: number;
  averageOrders: number;
  averageChurnRisk: number | null;
};

type PlannerProduct = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  price: number;
  avgReplenishmentDays: number | null;
  orderItemCount: number;
};

type MemoryRevenueGroup = {
  key: string;
  revenue: number;
  campaigns: number;
};

type PlannerMemoryContext = {
  totalCampaigns: number;
  bestSegmentByRevenue: MemoryRevenueGroup | null;
  bestCampaignTypeByRevenue: MemoryRevenueGroup | null;
  topCampaignByClickRate: {
    name: string;
    campaignType: string | null;
    segment: string | null;
    clickRate: number | null;
    revenue: number;
  } | null;
  recentLesson: string | null;
};

export type PlannerContext = {
  totalCustomers: number;
  segmentStats: SegmentStat[];
  topProducts: PlannerProduct[];
  recentCampaignTypes: string[];
  memory: PlannerMemoryContext;
  brainRules: string[];
};

type RecommendationCandidate = {
  title: string;
  campaignType: string;
  goal: string;
  segment: string;
  subjectLineAngle: string | null;
  primaryProduct: string | null;
  whyParts: string[];
  score: number;
  metadata: Record<string, unknown>;
};

type GeneratedPlanItem = {
  title: string;
  campaignType: string;
  goal: string;
  segment: string;
  suggestedSendDate: Date;
  subjectLineAngle: string | null;
  primaryProduct: string | null;
  why: string;
  confidenceScore: number;
  status: string;
  metadata: Record<string, unknown>;
};

export type GeneratedPlanArtifact = {
  name: string;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  status: string;
  summary: string;
  strategyNotes: string;
  metadata: Record<string, unknown>;
  items: GeneratedPlanItem[];
};

type MemoryRow = Awaited<ReturnType<typeof prisma.campaignMemory.findMany>>[number];
type SegmentGroupRow = {
  segment: string | null;
  _count: { _all: number };
  _avg: {
    totalSpent: number | null;
    totalOrders: number | null;
    churnRiskScore: number | null;
  };
};
type ProductWithCount = Prisma.ProductGetPayload<{
  include: { _count: { select: { orderItems: true } } };
}>;
type RecentCampaignType = { type: string };
type BrandRuleRow = { rule: string };

async function withPlannerFallback<T>(query: PromiseLike<T>, fallback: T, label: string): Promise<T> {
  try {
    return await query;
  } catch {
    console.warn(`Planner context fallback used for ${label}`);
    return fallback;
  }
}

function parseDate(value: unknown, field: string, issues: string[]) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(`${field} must be a valid date string.`);
    return null;
  }

  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) {
    issues.push(`${field} must be a valid date string.`);
    return null;
  }
  parsed.setHours(12, 0, 0, 0);
  return parsed;
}

function normalizeList(value: string | string[] | null | undefined) {
  const rawItems = Array.isArray(value) ? value : value ? value.split(/[\n,]/) : [];
  return rawItems.map((item) => item.trim()).filter(Boolean);
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function normalizeSegment(value: string) {
  const normalized = normalizeKey(value);
  const aliases: Record<string, string> = {
    champion: "champions",
    vip: "champions",
    vips: "champions",
    loyal: "loyal_customers",
    loyal_customer: "loyal_customers",
    at_risk_customer: "at_risk",
    winback: "at_risk",
    cant_lose: "cant_lose_them",
    cant_lose_them_customers: "cant_lose_them",
    new: "new_customers",
    new_customer: "new_customers",
    potential_loyalist: "potential_loyalists",
  };
  return aliases[normalized] ?? normalized;
}

function dateRangeDays(startDate: Date, endDate: Date) {
  return Math.floor((endDate.getTime() - startDate.getTime()) / DAY_MS);
}

function parseCampaignCount(value: unknown, issues: string[]) {
  if (value === undefined || value === null || value === "") return DEFAULT_CAMPAIGN_COUNT;
  if (typeof value !== "number" && typeof value !== "string") {
    issues.push("campaignCount must be a positive whole number.");
    return DEFAULT_CAMPAIGN_COUNT;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    issues.push("campaignCount must be a positive whole number.");
    return DEFAULT_CAMPAIGN_COUNT;
  }
  if (parsed > MAX_CAMPAIGN_COUNT) {
    issues.push(`campaignCount cannot exceed ${MAX_CAMPAIGN_COUNT} for Planner v0.`);
    return MAX_CAMPAIGN_COUNT;
  }
  return parsed;
}

export function validatePlannerGeneratePayload(input: unknown): PlannerValidationResult {
  const parsed = generatePlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const payload = parsed.data;
  const issues: string[] = [];
  const startDate = parseDate(payload.startDate, "startDate", issues);
  const endDate = parseDate(payload.endDate, "endDate", issues);
  const campaignCount = parseCampaignCount(payload.campaignCount, issues);

  if (startDate && endDate) {
    if (startDate > endDate) {
      issues.push("startDate must be before or equal to endDate.");
    }
    if (dateRangeDays(startDate, endDate) > MAX_RANGE_DAYS) {
      issues.push(`date range cannot exceed ${MAX_RANGE_DAYS} days for Planner v0.`);
    }
  }

  if (!startDate || !endDate || issues.length) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    data: {
      startDate,
      endDate,
      campaignCount,
      focus: payload.focus?.trim() || null,
      constraints: normalizeList(payload.constraints),
      preferredSegments: normalizeList(payload.preferredSegments).map(normalizeSegment),
      excludedCampaignTypes: normalizeList(payload.excludedCampaignTypes).map(normalizeKey),
    },
  };
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function segmentLabel(segment: string) {
  return SEGMENT_LABELS[segment] ?? segment.replace(/_/g, " ");
}

function groupMemoryByRevenue(memories: MemoryRow[], key: "segment" | "campaignType") {
  const groups = new Map<string, MemoryRevenueGroup>();
  for (const memory of memories) {
    const groupKey = memory[key] || "unknown";
    const current = groups.get(groupKey) ?? { key: groupKey, revenue: 0, campaigns: 0 };
    current.revenue += memory.revenue;
    current.campaigns += 1;
    groups.set(groupKey, current);
  }

  return (
    Array.from(groups.values())
      .map((group) => ({ ...group, revenue: round(group.revenue) }))
      .sort((a, b) => b.revenue - a.revenue)[0] ?? null
  );
}

function topBy<T>(items: T[], getValue: (item: T) => number | null | undefined) {
  return items.reduce<T | null>((best, item) => {
    const value = getValue(item);
    if (value === null || value === undefined || !Number.isFinite(value)) return best;
    if (!best) return item;
    const bestValue = getValue(best);
    return bestValue === null || bestValue === undefined || value > bestValue ? item : best;
  }, null);
}

function collectRuleText(input: unknown, output: string[]) {
  if (!input) return;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed) output.push(trimmed);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectRuleText(item, output);
    return;
  }
  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (typeof record.rule === "string") collectRuleText(record.rule, output);
    if (typeof record.text === "string") collectRuleText(record.text, output);
  }
}

export async function loadPlannerContext(): Promise<PlannerContext> {
  const [
    totalCustomers,
    segmentGroups,
    products,
    memories,
    recentCampaigns,
    brandRules,
    dosAndDonts,
  ] = await Promise.all([
    withPlannerFallback(prisma.customer.count(), 0, "customer count"),
    withPlannerFallback(
      prisma.customer.groupBy({
        by: ["segment"],
        _count: { _all: true },
        _avg: { totalSpent: true, totalOrders: true, churnRiskScore: true },
      }) as unknown as Promise<SegmentGroupRow[]>,
      [],
      "segment stats",
    ),
    withPlannerFallback(
      prisma.product.findMany({
        include: { _count: { select: { orderItems: true } } },
        take: 100,
      }) as unknown as Promise<ProductWithCount[]>,
      [],
      "products",
    ),
    withPlannerFallback(
      prisma.campaignMemory.findMany({
        orderBy: { sentAt: "desc" },
        take: 100,
      }) as unknown as Promise<MemoryRow[]>,
      [],
      "campaign memory",
    ),
    withPlannerFallback(
      prisma.campaign.findMany({
        orderBy: { createdAt: "desc" },
        select: { type: true },
        take: 25,
      }) as unknown as Promise<RecentCampaignType[]>,
      [],
      "recent campaigns",
    ),
    withPlannerFallback(
      prisma.brandRule.findMany({
        orderBy: { createdAt: "desc" },
        select: { rule: true },
        take: 25,
      }) as unknown as Promise<BrandRuleRow[]>,
      [],
      "brand rules",
    ),
    withPlannerFallback(
      prisma.dosAndDonts.findFirst({
        orderBy: { updatedAt: "desc" },
      }),
      null,
      "Brain dos and donts",
    ),
  ]);

  const segmentStats = segmentGroups
    .map((group) => {
      const key = group.segment || "unknown";
      return {
        key,
        label: segmentLabel(key),
        count: group._count._all,
        averageClv: round(group._avg.totalSpent ?? 0),
        averageOrders: round(group._avg.totalOrders ?? 0),
        averageChurnRisk:
          group._avg.churnRiskScore === null ? null : round(group._avg.churnRiskScore ?? 0),
      };
    })
    .sort((a, b) => b.count - a.count);

  const topProducts = products
    .map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: product.price,
      avgReplenishmentDays: product.avgReplenishmentDays,
      orderItemCount: product._count.orderItems,
    }))
    .sort((a, b) => {
      if (b.orderItemCount !== a.orderItemCount) return b.orderItemCount - a.orderItemCount;
      return b.price - a.price;
    })
    .slice(0, 12);

  const topClickCampaign = topBy(memories, (memory) => memory.clickRate);
  const ruleText = brandRules.map((rule) => rule.rule.trim()).filter(Boolean);

  if (dosAndDonts) {
    collectRuleText(dosAndDonts.messagingDos, ruleText);
    collectRuleText(dosAndDonts.languageDos, ruleText);
    collectRuleText(dosAndDonts.messagingDonts, ruleText);
    collectRuleText(dosAndDonts.languageDonts, ruleText);
    collectRuleText(dosAndDonts.toneDonts, ruleText);
    collectRuleText(dosAndDonts.cautionRules, ruleText);
  }

  return {
    totalCustomers,
    segmentStats,
    topProducts,
    recentCampaignTypes: recentCampaigns.map((campaign) => campaign.type),
    memory: {
      totalCampaigns: memories.length,
      bestSegmentByRevenue: groupMemoryByRevenue(memories, "segment"),
      bestCampaignTypeByRevenue: groupMemoryByRevenue(memories, "campaignType"),
      topCampaignByClickRate: topClickCampaign
        ? {
            name: topClickCampaign.name,
            campaignType: topClickCampaign.campaignType,
            segment: topClickCampaign.segment,
            clickRate: topClickCampaign.clickRate,
            revenue: topClickCampaign.revenue,
          }
        : null,
      recentLesson:
        memories.find((memory) => memory.winningInsight || memory.notes)?.winningInsight ??
        memories.find((memory) => memory.winningInsight || memory.notes)?.notes ??
        null,
    },
    brainRules: Array.from(new Set(ruleText)).slice(0, 20),
  };
}

function getSegmentStat(context: PlannerContext, segment: string) {
  return context.segmentStats.find((item) => item.key === segment) ?? null;
}

function segmentCount(context: PlannerContext, segment: string) {
  return getSegmentStat(context, segment)?.count ?? 0;
}

function bestProduct(context: PlannerContext, offset = 0) {
  return context.topProducts[offset] ?? context.topProducts[0] ?? null;
}

function bestReplenishableProduct(context: PlannerContext) {
  return context.topProducts.find((product) => product.avgReplenishmentDays) ?? bestProduct(context);
}

function hasNoDiscountConstraint(input: PlannerGenerateInput) {
  return input.constraints.some((constraint) =>
    /\b(no|without|avoid)\b.*\b(discounts?|coupons?|sales?|markdowns?|promos?|promotions?|offers?)\b/i.test(
      constraint,
    ),
  );
}

function wantsVipCampaign(input: PlannerGenerateInput) {
  return input.constraints.some((constraint) => /\b(vip|early access|loyalty)\b/i.test(constraint));
}

function memoryBoost(context: PlannerContext, campaignType: string, segment: string) {
  let boost = 0;
  const bestType = context.memory.bestCampaignTypeByRevenue?.key;
  const bestSegment = context.memory.bestSegmentByRevenue?.key;
  if (bestType && normalizeKey(bestType) === normalizeKey(campaignType)) boost += 12;
  if (bestSegment && normalizeSegment(bestSegment) === normalizeSegment(segment)) boost += 10;
  return boost;
}

function preferredSegmentBoost(input: PlannerGenerateInput, segment: string) {
  if (!input.preferredSegments.length) return 0;
  return input.preferredSegments.includes(normalizeSegment(segment)) ? 12 : -4;
}

function createWhy(parts: string[]) {
  return parts.filter(Boolean).join(" ");
}

function buildCandidatePool(
  input: PlannerGenerateInput,
  context: PlannerContext,
): RecommendationCandidate[] {
  const noDiscount = hasNoDiscountConstraint(input);
  const memoryType = context.memory.bestCampaignTypeByRevenue?.key;
  const memorySegment = context.memory.bestSegmentByRevenue?.key;
  const product = bestProduct(context);
  const secondProduct = bestProduct(context, 1);
  const replenishableProduct = bestReplenishableProduct(context);
  const candidates: RecommendationCandidate[] = [];

  const addCandidate = (candidate: RecommendationCandidate) => {
    const boost =
      memoryBoost(context, candidate.campaignType, candidate.segment) +
      preferredSegmentBoost(input, candidate.segment) +
      (wantsVipCampaign(input) && normalizeKey(candidate.campaignType).includes("vip") ? 18 : 0);
    candidates.push({ ...candidate, score: candidate.score + boost });
  };

  addCandidate({
    title: "VIP early access preview",
    campaignType: "VIP early access",
    goal: "Reward high-value customers and pull repeat purchases forward.",
    segment: "champions",
    subjectLineAngle: "Your first look is ready",
    primaryProduct: product?.name ?? null,
    whyParts: [
      `Champions currently include ${segmentCount(context, "champions")} customers.`,
      memorySegment === "champions" || normalizeKey(memoryType ?? "").includes("vip")
        ? "Campaign Memory points toward VIP-style audiences as a strong revenue lever."
        : "VIP audiences are a reliable first planning bet because they combine loyalty and purchase intent.",
      product ? `${product.name} gives the send a concrete merchandise hook.` : "",
    ],
    score: 78,
    metadata: { signal: "high_value_segment", noDiscount },
  });

  addCandidate({
    title: noDiscount ? "At-risk comeback story" : "At-risk winback",
    campaignType: "At-risk winback",
    goal: "Re-engage customers whose purchase cadence is cooling before they lapse further.",
    segment: segmentCount(context, "cant_lose_them") > segmentCount(context, "at_risk")
      ? "cant_lose_them"
      : "at_risk",
    subjectLineAngle: noDiscount ? "Worth coming back for" : "A reason to come back",
    primaryProduct: product?.name ?? null,
    whyParts: [
      `${segmentLabel("at_risk")} and ${segmentLabel("cant_lose_them")} customers are present in the local customer data.`,
      noDiscount
        ? "The angle focuses on newness, proof, and product value so it respects the pricing constraint."
        : "A winback slot keeps retention pressure on customers with elevated churn risk.",
    ],
    score: 74 + Math.min(8, segmentCount(context, "at_risk") / 10),
    metadata: { signal: "churn_risk", noDiscount },
  });

  addCandidate({
    title: product ? `${product.name} spotlight` : "Product spotlight",
    campaignType: "Product spotlight",
    goal: "Create demand around a product with strong local order history.",
    segment: "potential_loyalists",
    subjectLineAngle: product ? `Why customers keep choosing ${product.name}` : "Why customers keep choosing it",
    primaryProduct: product?.name ?? null,
    whyParts: [
      product
        ? `${product.name} is one of the strongest products available in local product/order data.`
        : "A product-focused campaign is available even before live Shopify sync is connected.",
      `${segmentLabel("potential_loyalists")} are a good audience because they need a focused reason to buy again.`,
    ],
    score: 72 + Math.min(10, (product?.orderItemCount ?? 0) / 8),
    metadata: { signal: "top_product", productId: product?.id ?? null, noDiscount },
  });

  addCandidate({
    title: "Education-led retention email",
    campaignType: "Educational email",
    goal: "Build purchase confidence with useful product education instead of a hard sell.",
    segment: "all",
    subjectLineAngle: "A smarter way to get more from your routine",
    primaryProduct: product?.name ?? null,
    whyParts: [
      "Education is a low-risk campaign type for Planner v0 because it works with or without prior send history.",
      context.brainRules.length
        ? "The Brain has brand rules available, so future brief generation can apply those guardrails."
        : "This creates a safe planning slot while brand rules continue to mature.",
    ],
    score: 68,
    metadata: { signal: "evergreen_value", noDiscount },
  });

  addCandidate({
    title: secondProduct ? `${secondProduct.name} cross-sell` : "Cross-sell recommendation",
    campaignType: "Cross-sell",
    goal: "Increase repeat purchase rate by matching existing customers to a complementary product.",
    segment: "loyal_customers",
    subjectLineAngle: secondProduct
      ? `The next product loyal customers should see: ${secondProduct.name}`
      : "The next product loyal customers should see",
    primaryProduct: secondProduct?.name ?? product?.name ?? null,
    whyParts: [
      `${segmentLabel("loyal_customers")} already show repeat behavior, making them a strong cross-sell audience.`,
      secondProduct
        ? `${secondProduct.name} gives the recommendation a specific product anchor.`
        : "The route falls back safely when product history is thin.",
    ],
    score: 66 + Math.min(8, segmentCount(context, "loyal_customers") / 12),
    metadata: { signal: "repeat_customer_cross_sell", productId: secondProduct?.id ?? null, noDiscount },
  });

  addCandidate({
    title: "New customer second-purchase nurture",
    campaignType: "New customer nurture",
    goal: "Move recent first-time buyers toward a second purchase while the relationship is fresh.",
    segment: "new_customers",
    subjectLineAngle: "What to try next",
    primaryProduct: product?.name ?? null,
    whyParts: [
      `${segmentLabel("new_customers")} are visible in the customer base.`,
      "A nurture campaign helps Worklin turn first purchases into a repeat buying habit.",
    ],
    score: 64 + Math.min(10, segmentCount(context, "new_customers") / 5),
    metadata: { signal: "second_purchase", noDiscount },
  });

  addCandidate({
    title: replenishableProduct ? `${replenishableProduct.name} replenishment reminder` : "Replenishment reminder",
    campaignType: "Replenishment reminder",
    goal: "Catch likely replenishment demand before customers run out or switch brands.",
    segment: "recent_buyers",
    subjectLineAngle: replenishableProduct
      ? `Is it time to restock ${replenishableProduct.name}?`
      : "Is it time to restock?",
    primaryProduct: replenishableProduct?.name ?? null,
    whyParts: [
      replenishableProduct?.avgReplenishmentDays
        ? `${replenishableProduct.name} has a replenishment window of about ${replenishableProduct.avgReplenishmentDays} days.`
        : "A replenishment slot is useful when product cadence becomes clearer.",
      "This recommendation is deterministic and can later be upgraded with predictive score sync.",
    ],
    score: 63 + (replenishableProduct?.avgReplenishmentDays ? 8 : 0),
    metadata: { signal: "replenishment_window", productId: replenishableProduct?.id ?? null, noDiscount },
  });

  addCandidate({
    title: "Customer appreciation note",
    campaignType: "Customer appreciation",
    goal: "Strengthen loyalty with a warm, brand-safe message to existing customers.",
    segment: "loyal_customers",
    subjectLineAngle: "A quick thank you",
    primaryProduct: null,
    whyParts: [
      `${segmentLabel("loyal_customers")} are a natural audience for appreciation because they have already shown commitment.`,
      "This is a low-risk send that can support retention without leaning on price.",
    ],
    score: 61,
    metadata: { signal: "loyalty_depth", noDiscount },
  });

  addCandidate({
    title: "Best-seller proof email",
    campaignType: "Product spotlight",
    goal: "Use social proof around a known product to reduce hesitation.",
    segment: "hibernating",
    subjectLineAngle: product ? `The product customers come back to: ${product.name}` : "The product customers come back to",
    primaryProduct: product?.name ?? null,
    whyParts: [
      `${segmentLabel("hibernating")} customers need a simple reason to pay attention again.`,
      product
        ? `${product.name} can anchor the message with concrete proof from local product data.`
        : "The recommendation remains usable even before richer product performance is available.",
    ],
    score: 58 + Math.min(6, segmentCount(context, "hibernating") / 12),
    metadata: { signal: "social_proof", productId: product?.id ?? null, noDiscount },
  });

  addCandidate({
    title: "Retention learning send",
    campaignType: "Educational email",
    goal: "Create a clean learning moment for future Campaign Memory comparisons.",
    segment: memorySegment ? normalizeSegment(memorySegment) : "all",
    subjectLineAngle: "What customers should know this week",
    primaryProduct: product?.name ?? null,
    whyParts: [
      context.memory.totalCampaigns
        ? "Campaign Memory is available, so this send can be compared against stored historical performance."
        : "This creates a baseline memory entry that future Planner versions can learn from.",
      memoryType ? `${memoryType} is currently the strongest remembered campaign type by revenue.` : "",
    ],
    score: 57,
    metadata: { signal: "memory_learning", noDiscount },
  });

  return candidates;
}

function isExcluded(candidate: RecommendationCandidate, input: PlannerGenerateInput) {
  if (!input.excludedCampaignTypes.length) return false;
  const candidateType = normalizeKey(candidate.campaignType);
  return input.excludedCampaignTypes.some(
    (excluded) => candidateType === excluded || candidateType.includes(excluded),
  );
}

function spreadDates(startDate: Date, endDate: Date, count: number) {
  const rangeDays = Math.max(0, dateRangeDays(startDate, endDate));
  return Array.from({ length: count }, (_, index) => {
    const offset = count === 1 ? 0 : Math.round((rangeDays * index) / (count - 1));
    const date = new Date(startDate.getTime() + offset * DAY_MS);
    date.setHours(14, 0, 0, 0);
    return date;
  });
}

function selectCandidates(input: PlannerGenerateInput, context: PlannerContext) {
  const ranked = buildCandidatePool(input, context)
    .filter((candidate) => !isExcluded(candidate, input))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.campaignType.localeCompare(b.campaignType);
    });

  const selected: RecommendationCandidate[] = [];
  const seenTypes = new Set<string>();

  for (const candidate of ranked) {
    const type = normalizeKey(candidate.campaignType);
    if (seenTypes.has(type)) continue;
    selected.push(candidate);
    seenTypes.add(type);
    if (selected.length >= input.campaignCount) return selected;
  }

  for (const candidate of ranked) {
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
    if (selected.length >= input.campaignCount) return selected;
  }

  return selected;
}

function confidenceFromScore(score: number) {
  return round(Math.min(0.95, Math.max(0.5, score / 100)), 2);
}

function formatPlanDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function generatePlanArtifact(
  input: PlannerGenerateInput,
  context: PlannerContext,
): GeneratedPlanArtifact {
  const selected = selectCandidates(input, context);
  const sendDates = spreadDates(input.startDate, input.endDate, selected.length);
  const strongestSegment = context.segmentStats[0];
  const bestMemorySegment = context.memory.bestSegmentByRevenue?.key ?? null;
  const bestMemoryType = context.memory.bestCampaignTypeByRevenue?.key ?? null;

  const items = selected.map((candidate, index) => ({
    title: candidate.title,
    campaignType: candidate.campaignType,
    goal: candidate.goal,
    segment: candidate.segment,
    suggestedSendDate: sendDates[index],
    subjectLineAngle: candidate.subjectLineAngle,
    primaryProduct: candidate.primaryProduct,
    why: createWhy(candidate.whyParts),
    confidenceScore: confidenceFromScore(candidate.score),
    status: "proposed",
    metadata: {
      ...candidate.metadata,
      score: round(candidate.score),
      dataSignals: {
        totalCustomers: context.totalCustomers,
        segmentCount: candidate.segment === "all" ? context.totalCustomers : segmentCount(context, candidate.segment),
        bestMemorySegment,
        bestMemoryCampaignType: bestMemoryType,
      },
    },
  }));

  const focusText = input.focus ? ` focused on ${input.focus}` : "";
  const dateText = `${formatPlanDate(input.startDate)} to ${formatPlanDate(input.endDate)}`;
  const planName = `Campaign plan for ${dateText}`;
  const summary = `Generated ${items.length} campaign recommendations${focusText} using customer segments, products, recent campaigns, Campaign Memory, and Brain rules available locally.`;
  const strategyNotes = [
    strongestSegment
      ? `${strongestSegment.label} is the largest visible segment with ${strongestSegment.count} customers.`
      : "No dominant customer segment is available yet.",
    bestMemorySegment
      ? `Campaign Memory currently favors ${segmentLabel(normalizeSegment(bestMemorySegment))} by stored revenue.`
      : "Campaign Memory has no strong segment winner yet, so Planner v0 leans on seeded customer and product data.",
    bestMemoryType
      ? `${bestMemoryType} is the strongest remembered campaign type by stored revenue.`
      : "No winning campaign type is stored yet.",
  ].join(" ");

  return {
    name: planName,
    dateRangeStart: input.startDate,
    dateRangeEnd: input.endDate,
    status: "draft",
    summary,
    strategyNotes,
    metadata: {
      generatedBy: "planner-v0",
      focus: input.focus,
      constraints: input.constraints,
      preferredSegments: input.preferredSegments,
      excludedCampaignTypes: input.excludedCampaignTypes,
      context: {
        totalCustomers: context.totalCustomers,
        segmentStats: context.segmentStats.slice(0, 8),
        topProducts: context.topProducts.slice(0, 5),
        bestMemorySegment,
        bestMemoryCampaignType: bestMemoryType,
        brainRuleCount: context.brainRules.length,
      },
    },
    items,
  };
}

export function serializePlanItem(item: {
  id: string;
  planId: string;
  title: string;
  campaignType: string;
  goal: string;
  segment: string;
  suggestedSendDate: Date;
  subjectLineAngle: string | null;
  primaryProduct: string | null;
  why: string;
  confidenceScore: number | null;
  status: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    planId: item.planId,
    title: item.title,
    campaignType: item.campaignType,
    goal: item.goal,
    segment: item.segment,
    suggestedSendDate: item.suggestedSendDate.toISOString(),
    subjectLineAngle: item.subjectLineAngle,
    primaryProduct: item.primaryProduct,
    why: item.why,
    confidenceScore: item.confidenceScore,
    status: item.status,
    metadata: item.metadata,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function serializePlan(plan: {
  id: string;
  name: string;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  status: string;
  summary: string | null;
  strategyNotes: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<Parameters<typeof serializePlanItem>[0]>;
}) {
  return {
    id: plan.id,
    name: plan.name,
    dateRangeStart: plan.dateRangeStart.toISOString(),
    dateRangeEnd: plan.dateRangeEnd.toISOString(),
    status: plan.status,
    summary: plan.summary,
    strategyNotes: plan.strategyNotes,
    metadata: plan.metadata,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    itemCount: plan.items.length,
    items: plan.items.map(serializePlanItem),
  };
}

export function serializePlanSummary(plan: {
  id: string;
  name: string;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  status: string;
  summary: string | null;
  strategyNotes: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { items: number };
}) {
  return {
    id: plan.id,
    name: plan.name,
    dateRangeStart: plan.dateRangeStart.toISOString(),
    dateRangeEnd: plan.dateRangeEnd.toISOString(),
    status: plan.status,
    summary: plan.summary,
    strategyNotes: plan.strategyNotes,
    metadata: plan.metadata,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    itemCount: plan._count.items,
  };
}
