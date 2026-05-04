import type { Prisma } from "@prisma/client";
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
  AuditInsight,
  AuditInsightInput,
  AuditRecommendedAction,
} from "@/lib/audits/types";
import {
  getKlaviyoAudienceConfig,
  KlaviyoAudienceApiError,
  listKlaviyoAudiences,
  type KlaviyoAudience,
  type KlaviyoAudienceConfig,
} from "@/lib/klaviyo-audiences";
import { prisma } from "@/lib/prisma";
import {
  getProductPerformanceIntelligence,
  type ProductPerformanceIntelligenceResult,
} from "@/lib/products/product-performance-intelligence";

export type SegmentAuditTimeframe = "last_90_days" | "last_180_days" | "last_365_days";

export type SegmentAuditInput = {
  timeframe?: SegmentAuditTimeframe | null;
  includeKlaviyo?: boolean;
  includeLocal?: boolean;
  limit?: number | null;
};

export type LifecycleAudienceKey =
  | "new_customers"
  | "one_time_buyers"
  | "repeat_buyers"
  | "vip_customers"
  | "inactive_customers"
  | "at_risk_customers"
  | "winback_candidates"
  | "replenishment_candidates"
  | "product_interest";

export type LifecycleCoverageStatus = "covered" | "partial" | "missing" | "unknown";

export type LifecycleAudienceSignal = {
  key: LifecycleAudienceKey;
  label: string;
  description: string;
  count: number;
  percentOfCustomers: number;
  confidence: "strong" | "directional" | "weak";
  threshold: string;
  evidence: string[];
};

export type ProductInterestAudience = {
  productId: string;
  name: string;
  category: string | null;
  eventCount: number;
  uniqueCustomers: number;
  eventTypes: string[];
};

export type CoverageMapItem = {
  key: LifecycleAudienceKey;
  label: string;
  status: LifecycleCoverageStatus;
  localCount: number | null;
  localPercent: number | null;
  klaviyoMatches: Array<{
    id: string;
    name: string;
    type: KlaviyoAudience["type"];
    profileCount: number | null;
    freshness: "fresh" | "stale" | "unknown";
  }>;
  confidence: "strong" | "directional" | "weak";
  recommendation: string;
};

export type AudienceDuplicateRisk = {
  key: string;
  label: string;
  audienceIds: string[];
  audienceNames: string[];
  reason: string;
  severity: "low" | "medium" | "high";
};

export type MissingAudienceOpportunity = {
  key: LifecycleAudienceKey;
  label: string;
  localCount: number | null;
  localPercent: number | null;
  reason: string;
  recommendedAction: string;
  priority: "high" | "medium" | "low";
};

export type SegmentAuditOutput = {
  ok: true;
  readOnly: true;
  summary: {
    audiencesAnalyzed: number;
    timeframe: {
      requested: SegmentAuditTimeframe;
      start: string;
      end: string;
    };
    needsKlaviyoAudienceData: boolean;
    needsLocalAudienceData: boolean;
    executiveSummary: string;
    insightSummary: ReturnType<typeof summarizeAuditInsights>;
    topIssues: InsightSummaryItem[];
    topOpportunities: InsightSummaryItem[];
  };
  overallAudienceHealth: {
    score: number;
    status: "strong" | "directional" | "weak";
    label: string;
    drivers: string[];
  };
  lifecycleAudienceCoverage: CoverageMapItem[];
  coverageMap: Record<LifecycleAudienceKey, CoverageMapItem>;
  klaviyoAudienceInventory: {
    available: boolean;
    count: number;
    listCount: number;
    segmentCount: number;
    lists: KlaviyoAudience[];
    segments: KlaviyoAudience[];
    broadAudiences: KlaviyoAudience[];
    staleAudiences: KlaviyoAudience[];
    unknownFreshnessAudiences: KlaviyoAudience[];
    caveats: AuditCaveat[];
  };
  localAudienceSignals: {
    available: boolean;
    summary: {
      customersAnalyzed: number;
      totalCustomers: number;
      ordersInTimeframe: number;
      eventsInTimeframe: number;
      productInterestEvents: number;
      customersWithMissingOrderDates: number;
    };
    lifecycleAudiences: LifecycleAudienceSignal[];
    productInterestAudiences: ProductInterestAudience[];
    thresholds: Record<string, string | number>;
    dataQuality: {
      sampleSize: "strong" | "directional" | "weak";
      eventsAvailable: boolean;
      productDataAvailable: boolean;
      orderDatesReliable: boolean;
    };
    caveats: AuditCaveat[];
  };
  broadAudienceRisk: {
    level: "low" | "medium" | "high" | "unknown";
    score: number;
    broadAudiences: KlaviyoAudience[];
    evidence: string[];
    recommendation: string;
  };
  duplicateOrOverlapRisks: AudienceDuplicateRisk[];
  missingAudienceOpportunities: MissingAudienceOpportunity[];
  insights: AuditInsight[];
  chartHints: AuditChartHint[];
  caveats: AuditCaveat[];
  recommendedActions: AuditRecommendedAction[];
  metadata: {
    generatedAt: string;
    feature: "segment-audience-audit-v0";
    readOnly: true;
    sources: string[];
    input: {
      timeframe: SegmentAuditTimeframe;
      includeKlaviyo: boolean;
      includeLocal: boolean;
      limit: number;
    };
    relatedAuditContext: {
      campaignAuditRuns: number;
      flowAuditRuns: number;
    };
  };
  workflowId?: string | null;
};

type InsightSummaryItem = {
  id: string;
  title: string;
  severity: AuditInsight["severity"];
  confidence: AuditInsight["confidence"];
  priorityScore: number;
};

type TimeframeResolution = {
  key: SegmentAuditTimeframe;
  start: Date;
  end: Date;
};

type LocalAudienceRead = SegmentAuditOutput["localAudienceSignals"];

type KlaviyoAudienceInventory = SegmentAuditOutput["klaviyoAudienceInventory"];

const DEFAULT_TIMEFRAME: SegmentAuditTimeframe = "last_365_days";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;
const MAX_LOCAL_CUSTOMERS = 10_000;
const MAX_LOCAL_EVENTS = 50_000;
const MAX_LOCAL_ORDER_ITEMS = 50_000;
const STALE_AUDIENCE_DAYS = 365;

const AUDIENCE_DEFINITIONS: Array<{
  key: LifecycleAudienceKey;
  label: string;
  description: string;
  aliases: string[];
  recommendation: string;
}> = [
  {
    key: "new_customers",
    label: "New customers",
    description: "Customers recently acquired or making their first purchase in the audit window.",
    aliases: ["new customer", "new customers", "new buyer", "first purchase", "recent customer", "welcome"],
    recommendation: "Separate new customers so onboarding, product education, and second-purchase nudges can be measured.",
  },
  {
    key: "one_time_buyers",
    label: "One-time buyers",
    description: "Customers with exactly one purchase who need second-purchase conversion strategy.",
    aliases: ["one time", "one-time", "single purchase", "1x", "first time buyer", "first-time buyer", "one purchase"],
    recommendation: "Build a one-time buyer audience for second-purchase campaigns and post-purchase flow splits.",
  },
  {
    key: "repeat_buyers",
    label: "Repeat buyers",
    description: "Customers with two or more purchases who should receive loyalty, cross-sell, and protection strategy.",
    aliases: ["repeat", "repeat buyer", "returning", "2x", "2+", "multi buyer", "multiple purchase", "loyal customer"],
    recommendation: "Maintain repeat buyer targeting so campaigns can scale loyalty behavior without flattening the list.",
  },
  {
    key: "vip_customers",
    label: "VIP customers",
    description: "High value customers by spend or order frequency.",
    aliases: ["vip", "champion", "high value", "high-value", "best customer", "whale", "top customer"],
    recommendation: "Create or refine VIP targeting for early access, exclusives, and protection from over-discounting.",
  },
  {
    key: "inactive_customers",
    label: "Inactive customers",
    description: "Customers with purchase history but no recent purchase activity.",
    aliases: ["inactive", "lapsed", "dormant", "hibernating", "no purchase", "unengaged buyer"],
    recommendation: "Separate inactive customers from active buyers before running reactivation or list hygiene plays.",
  },
  {
    key: "at_risk_customers",
    label: "At-risk customers",
    description: "Customers showing churn risk before they fully lapse.",
    aliases: ["at risk", "at-risk", "churn", "churn risk", "slipping", "risk"],
    recommendation: "Build an at-risk audience so intervention starts before winback becomes expensive.",
  },
  {
    key: "winback_candidates",
    label: "Winback candidates",
    description: "Lapsed purchasers who are candidates for reactivation.",
    aliases: ["winback", "win back", "reactivation", "come back", "comeback", "lapsed buyer"],
    recommendation: "Create a winback candidate audience with suppression rules for active/recent purchasers.",
  },
  {
    key: "replenishment_candidates",
    label: "Replenishment candidates",
    description: "Customers likely due to reorder based on product cadence or repeat-purchase signals.",
    aliases: ["replenish", "replenishment", "reorder", "refill", "restock", "running low", "repeat purchase window"],
    recommendation: "Create replenishment targeting around product cadence where product data supports it.",
  },
  {
    key: "product_interest",
    label: "Product-interest audiences",
    description: "Audiences based on browsed, viewed, carted, or category/product-specific intent.",
    aliases: ["product interest", "viewed", "browsed", "category", "collection", "carted", "added to cart", "interest"],
    recommendation: "Build product-interest audiences for browse abandon, product spotlight, and category-specific campaigns.",
  },
];

function money(value: number) {
  return Number(value.toFixed(2));
}

function rate(value: number | null) {
  return value === null ? null : Number(value.toFixed(4));
}

function percent(count: number, total: number) {
  return total ? Number(((count / total) * 100).toFixed(1)) : 0;
}

function score(value: number) {
  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function compactKey(value: string | null | undefined) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function caveat(message: string, evidenceType: AuditCaveat["evidenceType"] = "caveat"): AuditCaveat {
  return {
    message,
    evidenceType,
    severity: "unknown",
  };
}

function cleanLimit(value: number | null | undefined) {
  if (!value || !Number.isInteger(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

function resolveTimeframe(value: SegmentAuditTimeframe | null | undefined): TimeframeResolution {
  const key = value ?? DEFAULT_TIMEFRAME;
  const days = key === "last_90_days" ? 90 : key === "last_180_days" ? 180 : 365;
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { key, start, end };
}

function daysSince(date: Date | string | null | undefined, now = new Date()) {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.round((now.getTime() - parsed.getTime()) / 86_400_000));
}

function percentile(values: number[], p: number) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function confidenceFromCount(count: number, total: number): "strong" | "directional" | "weak" {
  if (total >= 100 && count >= 20) return "strong";
  if (total >= 20 && count >= 5) return "directional";
  return "weak";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function propertyString(properties: Prisma.JsonValue | null, keys: string[]) {
  if (!isRecord(properties)) return null;

  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return null;
}

function productEventType(eventType: string) {
  const normalized = normalizeText(eventType);
  return normalized.includes("product view") ||
    normalized.includes("viewed product") ||
    normalized.includes("add to cart") ||
    normalized.includes("added to cart") ||
    normalized === "product_view" ||
    normalized === "add_to_cart";
}

function buildProductLookup(products: Array<{
  id: string;
  externalId: string | null;
  sku: string | null;
  name: string;
}>) {
  const lookup = new Map<string, string>();

  for (const product of products) {
    lookup.set(product.id, product.id);
    if (product.externalId) lookup.set(product.externalId, product.id);
    if (product.sku) lookup.set(normalizeText(product.sku), product.id);
    lookup.set(normalizeText(product.name), product.id);
  }

  return lookup;
}

function resolveEventProductId(properties: Prisma.JsonValue | null, lookup: Map<string, string>) {
  const raw = propertyString(properties, [
    "productId",
    "product_id",
    "productExternalId",
    "product_external_id",
    "productID",
    "sku",
    "productSku",
    "variantSku",
    "productName",
    "product_name",
    "name",
    "title",
  ]);

  if (!raw) return null;
  return lookup.get(raw) ?? lookup.get(normalizeText(raw)) ?? null;
}

function signal(
  key: LifecycleAudienceKey,
  count: number,
  totalCustomers: number,
  threshold: string,
  evidence: string[],
): LifecycleAudienceSignal {
  const definition = AUDIENCE_DEFINITIONS.find((item) => item.key === key)!;
  return {
    key,
    label: definition.label,
    description: definition.description,
    count,
    percentOfCustomers: percent(count, totalCustomers),
    confidence: confidenceFromCount(count, totalCustomers),
    threshold,
    evidence,
  };
}

async function readLocalAudienceSignals(input: {
  timeframe: TimeframeResolution;
}): Promise<LocalAudienceRead> {
  const [totalCustomers, products, ordersInTimeframe, eventsInTimeframe] = await Promise.all([
    prisma.customer.count(),
    prisma.product.findMany({
      select: {
        id: true,
        externalId: true,
        sku: true,
        name: true,
        category: true,
        avgReplenishmentDays: true,
      },
    }),
    prisma.order.count({
      where: {
        createdAt: {
          gte: input.timeframe.start,
          lte: input.timeframe.end,
        },
      },
    }),
    prisma.customerEvent.count({
      where: {
        createdAt: {
          gte: input.timeframe.start,
          lte: input.timeframe.end,
        },
      },
    }),
  ]);

  const [customers, orderItems, events] = await Promise.all([
    prisma.customer.findMany({
      take: MAX_LOCAL_CUSTOMERS,
      orderBy: [{ totalSpent: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        createdAt: true,
        totalOrders: true,
        totalSpent: true,
        avgOrderValue: true,
        firstOrderDate: true,
        lastOrderDate: true,
        segment: true,
        churnRiskScore: true,
        orders: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            createdAt: true,
          },
        },
      },
    }),
    prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: {
            gte: input.timeframe.start,
            lte: input.timeframe.end,
          },
        },
      },
      take: MAX_LOCAL_ORDER_ITEMS,
      select: {
        quantity: true,
        order: {
          select: {
            customerId: true,
            createdAt: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            avgReplenishmentDays: true,
          },
        },
      },
    }),
    prisma.customerEvent.findMany({
      where: {
        createdAt: {
          gte: input.timeframe.start,
          lte: input.timeframe.end,
        },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_LOCAL_EVENTS,
      select: {
        customerId: true,
        eventType: true,
        properties: true,
        createdAt: true,
      },
    }),
  ]);

  const caveats: AuditCaveat[] = [];
  if (totalCustomers === 0) {
    caveats.push(caveat("No local customers were found. Segment audit needs Shopify/customer sync before audience truth is reliable.", "sample_size"));
  }
  if (customers.length < totalCustomers) {
    caveats.push(caveat(`Local customer analysis was capped at ${customers.length} of ${totalCustomers} customers.`, "sample_size"));
  }
  if (customers.length < 20 && totalCustomers > 0) {
    caveats.push(caveat("Local customer sample is small, so audience recommendations are weak or directional.", "sample_size"));
  }
  if (orderItems.length >= MAX_LOCAL_ORDER_ITEMS) {
    caveats.push(caveat(`Local order-item analysis hit the ${MAX_LOCAL_ORDER_ITEMS} row cap. Replenishment signals may be incomplete.`, "sample_size"));
  }
  if (events.length >= MAX_LOCAL_EVENTS) {
    caveats.push(caveat(`Local event analysis hit the ${MAX_LOCAL_EVENTS} row cap. Product-interest signals may be incomplete.`, "sample_size"));
  }

  const now = new Date();
  const spendValues = customers.map((customer) => customer.totalSpent || 0).filter((value) => value > 0);
  const orderValues = customers.map((customer) => customer.totalOrders || 0).filter((value) => value > 0);
  const avgSpend = spendValues.length ? spendValues.reduce((sum, value) => sum + value, 0) / spendValues.length : 0;
  const vipSpendThreshold = money(Math.max(percentile(spendValues, 0.9), avgSpend * 1.5));
  const vipOrderThreshold = Math.max(3, Math.ceil(percentile(orderValues, 0.75)));
  const customerIds = {
    newCustomers: new Set<string>(),
    oneTimeBuyers: new Set<string>(),
    repeatBuyers: new Set<string>(),
    vipCustomers: new Set<string>(),
    inactiveCustomers: new Set<string>(),
    atRiskCustomers: new Set<string>(),
    winbackCandidates: new Set<string>(),
  };
  let customersWithMissingOrderDates = 0;

  for (const customer of customers) {
    const firstOrderDate = customer.firstOrderDate ?? customer.orders.at(-1)?.createdAt ?? null;
    const lastOrderDate = customer.lastOrderDate ?? customer.orders[0]?.createdAt ?? null;
    const totalOrders = Math.max(customer.totalOrders || 0, customer.orders.length);
    const lastOrderAge = daysSince(lastOrderDate, now);

    if (totalOrders > 0 && !firstOrderDate && !lastOrderDate) customersWithMissingOrderDates += 1;
    if ((firstOrderDate && firstOrderDate >= input.timeframe.start) || customer.createdAt >= input.timeframe.start) {
      customerIds.newCustomers.add(customer.id);
    }
    if (totalOrders === 1) customerIds.oneTimeBuyers.add(customer.id);
    if (totalOrders >= 2) customerIds.repeatBuyers.add(customer.id);
    if ((vipSpendThreshold > 0 && customer.totalSpent >= vipSpendThreshold) || totalOrders >= vipOrderThreshold) {
      customerIds.vipCustomers.add(customer.id);
    }
    if (totalOrders > 0 && lastOrderAge !== null && lastOrderAge >= 180) {
      customerIds.inactiveCustomers.add(customer.id);
      customerIds.winbackCandidates.add(customer.id);
    }
    if (
      totalOrders > 0 &&
      ((customer.churnRiskScore ?? 0) >= 60 || (lastOrderAge !== null && lastOrderAge >= 90 && lastOrderAge < 180))
    ) {
      customerIds.atRiskCustomers.add(customer.id);
    }
  }

  if (customersWithMissingOrderDates > 0) {
    caveats.push(caveat(`${customersWithMissingOrderDates} local customers have order history but missing first/last order dates. Lifecycle counts use available order fallbacks where possible.`, "caveat"));
  }

  const replenishmentCustomers = new Set<string>();
  const replenishmentProductNames = new Set<string>();
  const latestProductPurchase = new Map<string, { customerId: string; productName: string; date: Date; avgDays: number }>();

  for (const item of orderItems) {
    const avgDays = item.product.avgReplenishmentDays;
    if (!avgDays || avgDays < 7) continue;
    const key = `${item.order.customerId}:${item.product.id}`;
    const existing = latestProductPurchase.get(key);
    if (!existing || item.order.createdAt > existing.date) {
      latestProductPurchase.set(key, {
        customerId: item.order.customerId,
        productName: item.product.name,
        date: item.order.createdAt,
        avgDays,
      });
    }
  }

  for (const purchase of latestProductPurchase.values()) {
    const age = daysSince(purchase.date, now);
    if (age !== null && age >= purchase.avgDays - 7 && age <= purchase.avgDays + 45) {
      replenishmentCustomers.add(purchase.customerId);
      replenishmentProductNames.add(purchase.productName);
    }
  }

  const productLookup = buildProductLookup(products);
  const productDetails = new Map(products.map((product) => [product.id, product]));
  const productInterest = new Map<string, {
    productId: string;
    eventCount: number;
    customers: Set<string>;
    eventTypes: Set<string>;
  }>();
  let productInterestEvents = 0;
  let unresolvedProductEvents = 0;

  for (const event of events) {
    if (!productEventType(event.eventType)) continue;
    productInterestEvents += 1;
    const productId = resolveEventProductId(event.properties, productLookup);
    if (!productId) {
      unresolvedProductEvents += 1;
      continue;
    }

    const current = productInterest.get(productId) ?? {
      productId,
      eventCount: 0,
      customers: new Set<string>(),
      eventTypes: new Set<string>(),
    };
    current.eventCount += 1;
    current.customers.add(event.customerId);
    current.eventTypes.add(event.eventType);
    productInterest.set(productId, current);
  }

  if (productInterestEvents === 0) {
    caveats.push(caveat("No local product-interest events were found in the selected timeframe. Product-interest audience conclusions are limited.", "segment"));
  } else if (unresolvedProductEvents / productInterestEvents > 0.5) {
    caveats.push(caveat("Most local product-interest events could not be matched to Product records. Shopify/event sync may be needed for reliable product-interest audiences.", "product"));
  }

  const productInterestAudiences = Array.from(productInterest.values())
    .map((item) => {
      const product = productDetails.get(item.productId);
      return {
        productId: item.productId,
        name: product?.name ?? "Unknown product",
        category: product?.category ?? null,
        eventCount: item.eventCount,
        uniqueCustomers: item.customers.size,
        eventTypes: Array.from(item.eventTypes).sort(),
      };
    })
    .filter((item) => item.eventCount >= 3 || item.uniqueCustomers >= 2)
    .sort((a, b) => b.uniqueCustomers - a.uniqueCustomers || b.eventCount - a.eventCount)
    .slice(0, 8);

  let productIntelligence: ProductPerformanceIntelligenceResult | null = null;
  try {
    productIntelligence = await getProductPerformanceIntelligence({
      limit: 5,
      timeframe: input.timeframe.key === "last_180_days" ? "last_365_days" : input.timeframe.key,
    });
    for (const message of productIntelligence.caveats) {
      caveats.push(caveat(message, "product"));
    }
    if (input.timeframe.key === "last_180_days") {
      caveats.push(caveat("Product Performance Intelligence does not support last_180_days directly, so product context used last_365_days.", "product"));
    }
  } catch (error) {
    caveats.push(caveat("Product Performance Intelligence could not be read; segment audit continued with local customer/order/event data.", "product"));
  }

  const replenishmentProductCount =
    productIntelligence?.tiers.replenishmentCandidates.length ?? replenishmentProductNames.size;
  const replenishmentCount = Math.max(replenishmentCustomers.size, replenishmentProductCount > 0 ? replenishmentCustomers.size : 0);
  const productInterestCount = productInterestAudiences.reduce((sum, item) => sum + item.uniqueCustomers, 0);
  const lifecycleAudiences = [
    signal("new_customers", customerIds.newCustomers.size, customers.length, `created or first purchased since ${input.timeframe.start.toISOString()}`, [
      `${customerIds.newCustomers.size} customers are new in the audit window.`,
    ]),
    signal("one_time_buyers", customerIds.oneTimeBuyers.size, customers.length, "totalOrders exactly 1", [
      `${customerIds.oneTimeBuyers.size} customers have exactly one purchase.`,
    ]),
    signal("repeat_buyers", customerIds.repeatBuyers.size, customers.length, "totalOrders at least 2", [
      `${customerIds.repeatBuyers.size} customers have two or more purchases.`,
    ]),
    signal("vip_customers", customerIds.vipCustomers.size, customers.length, `totalSpent >= ${vipSpendThreshold} or totalOrders >= ${vipOrderThreshold}`, [
      `${customerIds.vipCustomers.size} customers meet the VIP spend/order threshold.`,
    ]),
    signal("inactive_customers", customerIds.inactiveCustomers.size, customers.length, "last purchase at least 180 days ago", [
      `${customerIds.inactiveCustomers.size} customers are inactive by purchase recency.`,
    ]),
    signal("at_risk_customers", customerIds.atRiskCustomers.size, customers.length, "churnRiskScore >= 60 or last purchase 90-179 days ago", [
      `${customerIds.atRiskCustomers.size} customers show at-risk signals.`,
    ]),
    signal("winback_candidates", customerIds.winbackCandidates.size, customers.length, "purchase history with last purchase at least 180 days ago", [
      `${customerIds.winbackCandidates.size} customers are winback candidates.`,
    ]),
    signal("replenishment_candidates", replenishmentCount, customers.length, "purchase cadence near product avgReplenishmentDays", [
      `${replenishmentCustomers.size} customers and ${replenishmentProductCount} products show replenishment context.`,
    ]),
    signal("product_interest", productInterestCount, customers.length, "matched product_view/add_to_cart intent events", [
      `${productInterestAudiences.length} product-interest groups have enough local event signal for directional targeting.`,
    ]),
  ];

  const sampleSize = customers.length >= 100 ? "strong" : customers.length >= 20 ? "directional" : "weak";

  return {
    available: true,
    summary: {
      customersAnalyzed: customers.length,
      totalCustomers,
      ordersInTimeframe,
      eventsInTimeframe,
      productInterestEvents,
      customersWithMissingOrderDates,
    },
    lifecycleAudiences,
    productInterestAudiences,
    thresholds: {
      vipSpendThreshold,
      vipOrderThreshold,
      inactiveDays: 180,
      atRiskDays: 90,
      churnRiskScore: 60,
      maxLocalCustomers: MAX_LOCAL_CUSTOMERS,
      maxLocalEvents: MAX_LOCAL_EVENTS,
      maxLocalOrderItems: MAX_LOCAL_ORDER_ITEMS,
    },
    dataQuality: {
      sampleSize,
      eventsAvailable: eventsInTimeframe > 0,
      productDataAvailable: products.length > 0,
      orderDatesReliable: customersWithMissingOrderDates === 0,
    },
    caveats,
  };
}

function emptyLocalAudienceSignals(reason: string): LocalAudienceRead {
  return {
    available: false,
    summary: {
      customersAnalyzed: 0,
      totalCustomers: 0,
      ordersInTimeframe: 0,
      eventsInTimeframe: 0,
      productInterestEvents: 0,
      customersWithMissingOrderDates: 0,
    },
    lifecycleAudiences: [],
    productInterestAudiences: [],
    thresholds: {},
    dataQuality: {
      sampleSize: "weak",
      eventsAvailable: false,
      productDataAvailable: false,
      orderDatesReliable: false,
    },
    caveats: [caveat(reason, "caveat")],
  };
}

async function readKlaviyoInventory(input: {
  includeKlaviyo: boolean;
  limit: number;
}): Promise<KlaviyoAudienceInventory> {
  if (!input.includeKlaviyo) {
    return {
      available: false,
      count: 0,
      listCount: 0,
      segmentCount: 0,
      lists: [],
      segments: [],
      broadAudiences: [],
      staleAudiences: [],
      unknownFreshnessAudiences: [],
      caveats: [caveat("Klaviyo audience inventory was skipped by request.", "caveat")],
    };
  }

  const configResult = getKlaviyoAudienceConfig();
  if (!configResult.ok) {
    return {
      available: false,
      count: 0,
      listCount: 0,
      segmentCount: 0,
      lists: [],
      segments: [],
      broadAudiences: [],
      staleAudiences: [],
      unknownFreshnessAudiences: [],
      caveats: [caveat(`Klaviyo audience read is not configured: ${configResult.missingConfig.join(", ")}.`, "caveat")],
    };
  }

  try {
    const result = await listKlaviyoAudiences(configResult.config, { limit: input.limit });
    const available = result.count > 0 || result.caveats.length === 0;
    const broadAudiences = result.audiences.filter(isBroadAudience);
    const staleAudiences = result.audiences.filter((audience) => freshness(audience) === "stale");
    const unknownFreshnessAudiences = result.audiences.filter((audience) => freshness(audience) === "unknown");

    return {
      available,
      count: result.count,
      listCount: result.lists.length,
      segmentCount: result.segments.length,
      lists: result.lists,
      segments: result.segments,
      broadAudiences,
      staleAudiences,
      unknownFreshnessAudiences,
      caveats: result.caveats.map((message) => caveat(message, "caveat")),
    };
  } catch (error) {
    if (error instanceof KlaviyoAudienceApiError) {
      return {
        available: false,
        count: 0,
        listCount: 0,
        segmentCount: 0,
        lists: [],
        segments: [],
        broadAudiences: [],
        staleAudiences: [],
        unknownFreshnessAudiences: [],
        caveats: [caveat("Klaviyo audience inventory could not be read; local audience audit continued without live Klaviyo coverage.", "caveat")],
      };
    }
    throw error;
  }
}

function freshness(audience: KlaviyoAudience): "fresh" | "stale" | "unknown" {
  const date = audience.updated ?? audience.created;
  const age = daysSince(date);
  if (age === null) return "unknown";
  return age > STALE_AUDIENCE_DAYS ? "stale" : "fresh";
}

function isBroadAudience(audience: KlaviyoAudience) {
  const text = normalizeText(audience.name);
  return audience.type === "list" ||
    /\b(all|master|newsletter|main|subscribers|customers|email list|sms list|full list|entire list)\b/.test(text);
}

function matchesAudience(audience: KlaviyoAudience, key: LifecycleAudienceKey) {
  const definition = AUDIENCE_DEFINITIONS.find((item) => item.key === key)!;
  const text = normalizeText(audience.name);
  return definition.aliases.some((alias) => text.includes(normalizeText(alias)));
}

function buildCoverageMap(input: {
  inventory: KlaviyoAudienceInventory;
  local: LocalAudienceRead;
}) {
  const entries = AUDIENCE_DEFINITIONS.map((definition): CoverageMapItem => {
    const signal = input.local.lifecycleAudiences.find((item) => item.key === definition.key);
    const localCount = input.local.available ? signal?.count ?? 0 : null;
    const localPercent = input.local.available ? signal?.percentOfCustomers ?? 0 : null;
    const matches = input.inventory.available
      ? [...input.inventory.lists, ...input.inventory.segments].filter((audience) => matchesAudience(audience, definition.key))
      : [];
    const hasLocalSignal = localCount !== null && localCount > 0;
    const status: LifecycleCoverageStatus = !input.inventory.available
      ? "unknown"
      : matches.length > 0
        ? matches.some((match) => match.type === "segment") ? "covered" : "partial"
        : hasLocalSignal ? "missing" : "unknown";

    return {
      key: definition.key,
      label: definition.label,
      status,
      localCount,
      localPercent,
      klaviyoMatches: matches.map((audience) => ({
        id: audience.id,
        name: audience.name,
        type: audience.type,
        profileCount: audience.profileCount,
        freshness: freshness(audience),
      })),
      confidence: input.local.available ? signal?.confidence ?? "weak" : input.inventory.available ? "weak" : "weak",
      recommendation: status === "covered"
        ? `Maintain ${definition.label.toLowerCase()} coverage and use it in campaign/flow QA.`
        : status === "partial"
          ? `Refine ${definition.label.toLowerCase()} from broad list coverage into a true Klaviyo segment where useful.`
          : status === "missing"
            ? definition.recommendation
            : `Cannot verify ${definition.label.toLowerCase()} coverage until local and Klaviyo audience data are available.`,
    };
  });

  return Object.fromEntries(entries.map((entry) => [entry.key, entry])) as Record<LifecycleAudienceKey, CoverageMapItem>;
}

function audienceSignature(name: string) {
  return compactKey(name
    .replace(/\b(segment|list|audience|customers|people|profiles|klaviyo)\b/gi, "")
    .replace(/\b\d{1,4}\b/g, ""));
}

function duplicateRisks(audiences: KlaviyoAudience[], coverageMap: Record<LifecycleAudienceKey, CoverageMapItem>): AudienceDuplicateRisk[] {
  const risks: AudienceDuplicateRisk[] = [];
  const bySignature = new Map<string, KlaviyoAudience[]>();

  for (const audience of audiences) {
    const signature = audienceSignature(audience.name);
    if (!signature || signature.length < 3) continue;
    bySignature.set(signature, [...(bySignature.get(signature) ?? []), audience]);
  }

  for (const [signature, group] of bySignature.entries()) {
    if (group.length < 2) continue;
    risks.push({
      key: `duplicate_${signature}`,
      label: "Duplicate-like audience names",
      audienceIds: group.map((audience) => audience.id),
      audienceNames: group.map((audience) => audience.name),
      reason: "Multiple Klaviyo audiences share nearly identical normalized names, which can split reporting and confuse targeting.",
      severity: group.length >= 3 ? "high" : "medium",
    });
  }

  for (const entry of Object.values(coverageMap)) {
    if (entry.klaviyoMatches.length < 2) continue;
    risks.push({
      key: `overlap_${entry.key}`,
      label: `${entry.label} overlap`,
      audienceIds: entry.klaviyoMatches.map((match) => match.id),
      audienceNames: entry.klaviyoMatches.map((match) => match.name),
      reason: `Multiple audiences appear to cover ${entry.label.toLowerCase()}, so Worklin should verify inclusion/exclusion logic before using them in campaigns or flows.`,
      severity: entry.klaviyoMatches.length >= 3 ? "high" : "medium",
    });
  }

  return risks.sort((a, b) => b.audienceIds.length - a.audienceIds.length || a.key.localeCompare(b.key));
}

function missingOpportunities(coverageMap: Record<LifecycleAudienceKey, CoverageMapItem>): MissingAudienceOpportunity[] {
  return Object.values(coverageMap)
    .filter((entry) => entry.status === "missing")
    .map((entry) => {
      const localCount = entry.localCount ?? 0;
      const priority: MissingAudienceOpportunity["priority"] =
        ["vip_customers", "winback_candidates", "one_time_buyers", "replenishment_candidates"].includes(entry.key) && localCount >= 5
          ? "high"
          : localCount >= 5 ? "medium" : "low";
      return {
        key: entry.key,
        label: entry.label,
        localCount: entry.localCount,
        localPercent: entry.localPercent,
        reason: `${entry.label} have local signal but no matching Klaviyo audience was detected.`,
        recommendedAction: entry.recommendation,
        priority,
      };
    })
    .sort((a, b) => {
      const weight = { high: 3, medium: 2, low: 1 };
      return weight[b.priority] - weight[a.priority] || (b.localCount ?? 0) - (a.localCount ?? 0);
    });
}

function broadAudienceRisk(input: {
  inventory: KlaviyoAudienceInventory;
  coverageMap: Record<LifecycleAudienceKey, CoverageMapItem>;
}) {
  if (!input.inventory.available) {
    return {
      level: "unknown" as const,
      score: 0,
      broadAudiences: [] as KlaviyoAudience[],
      evidence: ["Klaviyo audience inventory is unavailable."],
      recommendation: "Read Klaviyo audiences before judging broad-blast/list-only risk.",
    };
  }

  const total = input.inventory.count;
  const broad = input.inventory.broadAudiences;
  const segmentCount = input.inventory.segmentCount;
  const coveredLifecycle = Object.values(input.coverageMap).filter((entry) => entry.status === "covered").length;
  const broadShare = total ? broad.length / total : 0;
  const riskScore = score((broadShare * 55) + (segmentCount === 0 ? 30 : segmentCount < 3 ? 15 : 0) + (coveredLifecycle < 4 ? 20 : 0));
  const level: "low" | "medium" | "high" = riskScore >= 65 ? "high" : riskScore >= 35 ? "medium" : "low";

  return {
    level,
    score: riskScore,
    broadAudiences: broad,
    evidence: [
      `${broad.length} of ${total} Klaviyo audiences look broad/list-like.`,
      `${segmentCount} Klaviyo segments were detected.`,
      `${coveredLifecycle} lifecycle audience buckets are covered by Klaviyo segments.`,
    ],
    recommendation: level === "high"
      ? "Segment harder before scaling campaigns; broad list-only targeting risks weak personalization and noisy reporting."
      : level === "medium"
        ? "Improve lifecycle segmentation before using broad lists for more than low-risk newsletters."
        : "Broad-list risk appears controlled, but lifecycle audiences should stay part of campaign QA.",
  };
}

function health(input: {
  inventory: KlaviyoAudienceInventory;
  local: LocalAudienceRead;
  coverageMap: Record<LifecycleAudienceKey, CoverageMapItem>;
  broadRisk: ReturnType<typeof broadAudienceRisk>;
  duplicateRisks: AudienceDuplicateRisk[];
}) {
  let value = 100;
  const drivers: string[] = [];
  const missing = Object.values(input.coverageMap).filter((entry) => entry.status === "missing");
  const partial = Object.values(input.coverageMap).filter((entry) => entry.status === "partial");
  const unknown = Object.values(input.coverageMap).filter((entry) => entry.status === "unknown");

  value -= missing.length * 8;
  value -= partial.length * 3;
  value -= Math.min(18, unknown.length * 2);
  if (!input.inventory.available) value -= 18;
  if (!input.local.available) value -= 22;
  if (input.local.dataQuality.sampleSize === "weak") value -= 8;
  if (input.broadRisk.level === "high") value -= 14;
  if (input.broadRisk.level === "medium") value -= 7;
  value -= Math.min(10, input.duplicateRisks.length * 4);
  value -= Math.min(8, input.inventory.staleAudiences.length * 2);
  value -= Math.min(8, input.inventory.unknownFreshnessAudiences.length);

  drivers.push(`${missing.length} lifecycle audience buckets are missing.`);
  drivers.push(`${partial.length} lifecycle audience buckets are only partially covered.`);
  if (input.broadRisk.level !== "low") drivers.push(`Broad audience risk is ${input.broadRisk.level}.`);
  if (input.duplicateRisks.length) drivers.push(`${input.duplicateRisks.length} duplicate or overlap risks were detected.`);
  if (input.inventory.staleAudiences.length) drivers.push(`${input.inventory.staleAudiences.length} audiences look stale by timestamp.`);

  const finalScore = score(value);
  const status: "strong" | "directional" | "weak" =
    finalScore >= 80 ? "strong" : finalScore >= 60 ? "directional" : "weak";

  return {
    score: finalScore,
    status,
    label: status === "strong"
      ? "Audience foundation is usable for retention audits."
      : status === "directional"
        ? "Audience foundation is usable but needs cleanup before heavy scaling."
        : "Audience foundation needs work before Worklin should trust targeting recommendations.",
    drivers,
  };
}

function entityFromAudience(audience: KlaviyoAudience) {
  return {
    id: audience.id,
    type: "segment" as const,
    name: audience.name,
    source: "Klaviyo",
    metadata: {
      klaviyoType: audience.type,
      profileCount: audience.profileCount,
    },
  };
}

function buildInsights(input: {
  inventory: KlaviyoAudienceInventory;
  local: LocalAudienceRead;
  coverageMap: Record<LifecycleAudienceKey, CoverageMapItem>;
  broadRisk: ReturnType<typeof broadAudienceRisk>;
  duplicateRisks: AudienceDuplicateRisk[];
  missingOpportunities: MissingAudienceOpportunity[];
  overallHealth: ReturnType<typeof health>;
}): AuditInsight[] {
  const insights: AuditInsightInput[] = [];
  const caveats = [...input.inventory.caveats, ...input.local.caveats];
  const coverageEntries = Object.values(input.coverageMap);

  if (!input.inventory.available && !input.local.available) {
    insights.push({
      id: "segment_monitor_no_audience_data",
      title: "Audience audit needs data before recommendations are reliable",
      summary: "Neither Klaviyo audience inventory nor local customer data was available for this segment audit.",
      domain: "segment",
      insightType: "monitor",
      severity: "unknown",
      confidence: "weak",
      evidence: [{ type: "caveat", label: "No audience data was available.", source: "Segment Audit" }],
      caveats,
      recommendedActions: [{
        label: "Verify local customer sync and Klaviyo audience read configuration, then rerun the segment audit.",
        actionType: "audit",
        priority: "high",
      }],
      chartHints: [
        createChartHint({
          type: "scorecard",
          title: "Audience data availability",
          metricKeys: ["klaviyo_available", "local_available"],
          entityIds: [],
        }),
      ],
    });
    return rankAuditInsights(insights.map((insight) => createAuditInsight(insight)));
  }

  if (!input.inventory.available) {
    insights.push({
      id: "segment_monitor_klaviyo_audience_inventory_unavailable",
      title: "Klaviyo audience inventory is unavailable",
      summary: "Worklin can read local lifecycle signals, but it cannot verify live Klaviyo list and segment coverage for this audit.",
      domain: "segment",
      insightType: "monitor",
      severity: "unknown",
      confidence: "weak",
      evidence: [
        { type: "caveat", label: "Klaviyo audience inventory was unavailable or skipped.", source: "Segment Audit" },
        { type: "metric", label: "Local customers analyzed", value: input.local.summary.customersAnalyzed, metricKey: "customers_analyzed" },
      ],
      caveats,
      recommendedActions: [{
        label: "Confirm Klaviyo list/segment read access and rerun the segment audit before treating audience coverage as final.",
        actionType: "audit",
        priority: "high",
      }],
      chartHints: [
        createChartHint({
          type: "scorecard",
          title: "Klaviyo audience inventory availability",
          metricKeys: ["klaviyo_available", "audiences_analyzed", "customers_analyzed"],
          entityIds: [],
        }),
      ],
    });
  }

  const missingByKey = new Map(input.missingOpportunities.map((item) => [item.key, item]));
  const vip = missingByKey.get("vip_customers");
  if (vip) {
    insights.push({
      id: "segment_build_missing_vip",
      title: "Build a VIP audience before scaling high-value campaigns",
      summary: "Local data shows high-value customers, but no matching Klaviyo VIP audience was detected.",
      domain: "segment",
      insightType: "build",
      severity: vip.priority === "high" ? "issue" : "opportunity",
      confidence: input.coverageMap.vip_customers.confidence,
      evidence: [
        { type: "segment", label: "Local VIP customers", value: vip.localCount, metricKey: "vip_customers" },
        { type: "metric", label: "VIP share of customers", value: vip.localPercent, metricKey: "vip_customer_share" },
      ],
      caveats,
      recommendedActions: [{
        label: "Create a Klaviyo VIP segment using spend and order-frequency thresholds, then use it for early access and loyalty protection.",
        actionType: "build",
        priority: vip.priority,
      }],
      chartHints: [
        createChartHint({
          type: "bar",
          title: "Lifecycle audience counts",
          metricKeys: coverageEntries.map((entry) => entry.key),
          entityIds: [],
          description: "Compare local lifecycle audience sizes against Klaviyo coverage.",
        }),
      ],
    });
  }

  const repeat = missingByKey.get("repeat_buyers");
  if (repeat) {
    insights.push({
      id: "segment_fix_repeat_buyer_gap",
      title: "Repeat buyers are not clearly separated",
      summary: "Repeat buyers exist in local customer data, but no matching Klaviyo audience was detected.",
      domain: "segment",
      insightType: "fix",
      severity: "warning",
      confidence: input.coverageMap.repeat_buyers.confidence,
      evidence: [
        { type: "segment", label: "Local repeat buyers", value: repeat.localCount, metricKey: "repeat_buyers" },
        { type: "metric", label: "Repeat buyer share", value: repeat.localPercent, metricKey: "repeat_buyer_share" },
      ],
      caveats,
      recommendedActions: [{
        label: "Separate repeat buyers from one-time buyers so loyalty, cross-sell, and VIP campaigns can be measured cleanly.",
        actionType: "fix",
        priority: repeat.priority,
      }],
      chartHints: [
        createChartHint({
          type: "funnel",
          title: "Customer lifecycle split",
          metricKeys: ["new_customers", "one_time_buyers", "repeat_buyers", "vip_customers"],
          entityIds: [],
        }),
      ],
    });
  }

  const oneTime = missingByKey.get("one_time_buyers");
  const newCustomers = missingByKey.get("new_customers");
  if (oneTime || newCustomers) {
    insights.push({
      id: "segment_fix_new_vs_one_time_separation",
      title: "New customer and one-time buyer targeting needs separation",
      summary: "Worklin found local new-customer or one-time-buyer signal without clear Klaviyo audience coverage for both lifecycle states.",
      domain: "segment",
      insightType: "fix",
      severity: "warning",
      confidence: oneTime ? input.coverageMap.one_time_buyers.confidence : input.coverageMap.new_customers.confidence,
      evidence: [
        { type: "segment", label: "Local new customers", value: input.coverageMap.new_customers.localCount, metricKey: "new_customers" },
        { type: "segment", label: "Local one-time buyers", value: input.coverageMap.one_time_buyers.localCount, metricKey: "one_time_buyers" },
      ],
      caveats,
      recommendedActions: [{
        label: "Separate new customers from one-time buyers so welcome, post-purchase, and second-purchase campaigns do not blur together.",
        actionType: "fix",
        priority: "medium",
      }],
      chartHints: [
        createChartHint({
          type: "table",
          title: "New vs one-time audience coverage",
          metricKeys: ["new_customers", "one_time_buyers"],
          entityIds: [],
        }),
      ],
    });
  }

  if (missingByKey.has("inactive_customers") || missingByKey.has("at_risk_customers") || missingByKey.has("winback_candidates")) {
    insights.push({
      id: "segment_build_inactive_winback_coverage",
      title: "Inactive and winback coverage is weak",
      summary: "Local customer recency and churn signals exist, but Klaviyo audience coverage for inactive, at-risk, or winback candidates is incomplete.",
      domain: "segment",
      insightType: "build",
      severity: "issue",
      confidence: "directional",
      evidence: [
        { type: "segment", label: "At-risk customers", value: input.coverageMap.at_risk_customers.localCount, metricKey: "at_risk_customers" },
        { type: "segment", label: "Winback candidates", value: input.coverageMap.winback_candidates.localCount, metricKey: "winback_candidates" },
        { type: "playbook", label: "Winback and sunset flow strategy depends on this audience split.", source: "Worklin lifecycle audit strategy" },
      ],
      caveats,
      recommendedActions: [{
        label: "Create at-risk and winback segments with active-buyer suppressions before scaling reactivation campaigns or flows.",
        actionType: "build",
        priority: "high",
      }],
      chartHints: [
        createChartHint({
          type: "bar",
          title: "Risk and winback audience sizes",
          metricKeys: ["at_risk_customers", "inactive_customers", "winback_candidates"],
          entityIds: [],
        }),
      ],
    });
  }

  const replenishment = missingByKey.get("replenishment_candidates");
  if (replenishment) {
    insights.push({
      id: "segment_build_replenishment_audience",
      title: "Replenishment candidate audience is missing",
      summary: "Local product cadence or repeat-purchase signals suggest replenishment targeting, but no matching Klaviyo audience was detected.",
      domain: "segment",
      insightType: "build",
      severity: replenishment.priority === "high" ? "issue" : "opportunity",
      confidence: input.coverageMap.replenishment_candidates.confidence,
      evidence: [
        { type: "segment", label: "Local replenishment candidates", value: replenishment.localCount, metricKey: "replenishment_candidates" },
        { type: "product", label: "Product cadence supports replenishment targeting where available.", source: "Product Performance Intelligence" },
      ],
      caveats,
      recommendedActions: [{
        label: "Build replenishment segments around product reorder cadence before recommending replenishment campaigns or flows.",
        actionType: "build",
        priority: replenishment.priority,
      }],
      chartHints: [
        createChartHint({
          type: "table",
          title: "Replenishment audience evidence",
          metricKeys: ["replenishment_candidates", "product_replenishment_candidates"],
          entityIds: [],
        }),
      ],
    });
  }

  const productInterest = missingByKey.get("product_interest");
  if (productInterest) {
    insights.push({
      id: "segment_build_product_interest_audiences",
      title: "Product-interest audiences are underbuilt",
      summary: "Local product-view or add-to-cart signals support product-interest audiences, but no matching Klaviyo audience was detected.",
      domain: "segment",
      insightType: "build",
      severity: "opportunity",
      confidence: input.coverageMap.product_interest.confidence,
      evidence: [
        { type: "segment", label: "Product-interest audience signal", value: productInterest.localCount, metricKey: "product_interest_customers" },
        { type: "product", label: "Product-interest audiences improve browse abandon, product spotlight, and category campaign targeting." },
      ],
      caveats,
      recommendedActions: [{
        label: "Create product-interest segments for top viewed/carted products or categories before campaign and flow recommendations get product-specific.",
        actionType: "build",
        priority: productInterest.priority,
      }],
      chartHints: [
        createChartHint({
          type: "table",
          title: "Top product-interest audiences",
          metricKeys: ["event_count", "unique_customers"],
          entityIds: input.local.productInterestAudiences.map((item) => item.productId),
        }),
      ],
    });
  }

  if (input.broadRisk.level === "high" || input.broadRisk.level === "medium") {
    insights.push({
      id: "segment_fix_broad_blast_risk",
      title: "Broad-list targeting risk needs cleanup",
      summary: "Klaviyo audience inventory appears too dependent on broad lists relative to lifecycle segments.",
      domain: "segment",
      insightType: "fix",
      severity: input.broadRisk.level === "high" ? "issue" : "warning",
      confidence: input.inventory.available ? "directional" : "weak",
      evidence: input.broadRisk.evidence.map((label) => ({ type: "segment", label, source: "Klaviyo audience inventory" })),
      caveats,
      recommendedActions: [{
        label: "Prioritize lifecycle segmentation before broad newsletters, high-volume blasts, or retention action plans.",
        actionType: "fix",
        priority: input.broadRisk.level === "high" ? "high" : "medium",
      }],
      affectedEntities: input.broadRisk.broadAudiences.slice(0, 8).map(entityFromAudience),
      chartHints: [
        createChartHint({
          type: "pie",
          title: "Klaviyo list vs segment mix",
          metricKeys: ["list_count", "segment_count", "broad_audience_count"],
          entityIds: [],
        }),
      ],
    });
  }

  if (input.duplicateRisks.length) {
    insights.push({
      id: "segment_cleanup_duplicate_overlap_risk",
      title: "Duplicate or overlapping audience names need cleanup",
      summary: "Several Klaviyo audiences look duplicated or overlapping by name, which can weaken reporting and targeting confidence.",
      domain: "segment",
      insightType: "cleanup",
      severity: input.duplicateRisks.some((risk) => risk.severity === "high") ? "warning" : "opportunity",
      confidence: "directional",
      evidence: input.duplicateRisks.slice(0, 6).map((risk) => ({
        type: "segment",
        label: risk.reason,
        value: risk.audienceNames.length,
        source: risk.label,
      })),
      caveats,
      recommendedActions: [{
        label: "Review duplicate or overlapping audiences before using them as audit source-of-truth.",
        actionType: "cleanup",
        priority: "medium",
      }],
      chartHints: [
        createChartHint({
          type: "table",
          title: "Duplicate and overlap risks",
          metricKeys: ["audience_count", "risk_severity"],
          entityIds: input.duplicateRisks.flatMap((risk) => risk.audienceIds).slice(0, 20),
        }),
      ],
    });
  }

  if (input.inventory.staleAudiences.length || input.inventory.unknownFreshnessAudiences.length) {
    insights.push({
      id: "segment_audit_freshness_unknown_or_stale",
      title: "Audience freshness needs verification",
      summary: "Some Klaviyo audiences have missing or old timestamps, so Worklin cannot fully trust their freshness.",
      domain: "segment",
      insightType: "audit",
      severity: input.inventory.staleAudiences.length ? "warning" : "unknown",
      confidence: "weak",
      evidence: [
        { type: "segment", label: "Stale audiences", value: input.inventory.staleAudiences.length, metricKey: "stale_audiences" },
        { type: "segment", label: "Unknown freshness audiences", value: input.inventory.unknownFreshnessAudiences.length, metricKey: "unknown_freshness_audiences" },
      ],
      caveats,
      recommendedActions: [{
        label: "Verify stale or unknown-freshness audiences before using them in campaign, flow, or retention audit recommendations.",
        actionType: "audit",
        priority: "medium",
      }],
      affectedEntities: [...input.inventory.staleAudiences, ...input.inventory.unknownFreshnessAudiences].slice(0, 10).map(entityFromAudience),
      chartHints: [
        createChartHint({
          type: "scorecard",
          title: "Audience freshness",
          metricKeys: ["stale_audiences", "unknown_freshness_audiences"],
          entityIds: [],
        }),
      ],
    });
  }

  if (!insights.length && input.overallHealth.status === "strong") {
    insights.push({
      id: "segment_protect_audience_foundation",
      title: "Protect the current audience foundation",
      summary: "Klaviyo audience coverage and local lifecycle signals appear usable for future retention audits.",
      domain: "segment",
      insightType: "protect",
      severity: "good",
      confidence: "directional",
      evidence: [
        { type: "metric", label: "Audience health score", value: input.overallHealth.score, metricKey: "audience_health_score" },
        { type: "segment", label: "Covered lifecycle audiences", value: coverageEntries.filter((entry) => entry.status === "covered").length, metricKey: "covered_lifecycle_audiences" },
      ],
      caveats,
      recommendedActions: [{
        label: "Use these audiences as source-of-truth inputs for Retention Audit Workflow v0, while preserving read-only audit behavior.",
        actionType: "protect",
        priority: "medium",
      }],
      chartHints: [
        createChartHint({
          type: "scorecard",
          title: "Audience health",
          metricKeys: ["audience_health_score", "covered_lifecycle_audiences"],
          entityIds: [],
        }),
      ],
    });
  }

  return rankAuditInsights(insights.map((insight) => createAuditInsight(insight)));
}

function topItems(insights: AuditInsight[], predicate: (insight: AuditInsight) => boolean): InsightSummaryItem[] {
  return rankAuditInsights(insights)
    .filter(predicate)
    .slice(0, 5)
    .map((insight) => ({
      id: insight.id,
      title: insight.title,
      severity: insight.severity,
      confidence: insight.confidence,
      priorityScore: insight.priorityScore,
    }));
}

function recommendedActions(insights: AuditInsight[]) {
  const seen = new Set<string>();
  const actions: AuditRecommendedAction[] = [];
  for (const insight of rankAuditInsights(insights)) {
    for (const action of insight.recommendedActions) {
      const key = normalizeText(action.label);
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push(action);
    }
  }
  return actions.slice(0, 10);
}

async function relatedAuditContext() {
  const [campaignAuditRuns, flowAuditRuns] = await Promise.all([
    prisma.workflowRun.count({ where: { type: "campaign-audit" } }),
    prisma.workflowRun.count({ where: { type: "flow-audit" } }),
  ]);

  return { campaignAuditRuns, flowAuditRuns };
}

export async function auditSegments(input: SegmentAuditInput = {}): Promise<SegmentAuditOutput> {
  const timeframe = resolveTimeframe(input.timeframe);
  const includeKlaviyo = input.includeKlaviyo !== false;
  const includeLocal = input.includeLocal !== false;
  const limit = cleanLimit(input.limit);

  const [inventory, local, context] = await Promise.all([
    readKlaviyoInventory({ includeKlaviyo, limit }),
    includeLocal
      ? readLocalAudienceSignals({ timeframe })
      : Promise.resolve(emptyLocalAudienceSignals("Local audience intelligence was skipped by request.")),
    relatedAuditContext(),
  ]);

  const coverageMap = buildCoverageMap({ inventory, local });
  const audiences = [...inventory.lists, ...inventory.segments];
  const duplicateOrOverlapRisks = duplicateRisks(audiences, coverageMap);
  const missingAudienceOpportunities = missingOpportunities(coverageMap);
  const broadRisk = broadAudienceRisk({ inventory, coverageMap });
  const overallAudienceHealth = health({
    inventory,
    local,
    coverageMap,
    broadRisk,
    duplicateRisks: duplicateOrOverlapRisks,
  });
  const insights = buildInsights({
    inventory,
    local,
    coverageMap,
    broadRisk,
    duplicateRisks: duplicateOrOverlapRisks,
    missingOpportunities: missingAudienceOpportunities,
    overallHealth: overallAudienceHealth,
  });
  const insightSummary = summarizeAuditInsights(insights);
  const caveats = [...inventory.caveats, ...local.caveats];
  const chartHints = [
    createChartHint({
      type: "scorecard",
      title: "Audience health score",
      metricKeys: ["audience_health_score", "covered_lifecycle_audiences", "missing_lifecycle_audiences"],
      entityIds: [],
    }),
    createChartHint({
      type: "table",
      title: "Lifecycle audience coverage map",
      metricKeys: AUDIENCE_DEFINITIONS.map((definition) => definition.key),
      entityIds: [],
    }),
    ...collectAuditChartHints(insights),
  ];
  const coveredCount = Object.values(coverageMap).filter((entry) => entry.status === "covered").length;
  const missingCount = Object.values(coverageMap).filter((entry) => entry.status === "missing").length;
  const executiveSummary = [
    `Audience audit analyzed ${inventory.count} Klaviyo audiences and ${local.summary.customersAnalyzed} local customers.`,
    `Audience health is ${overallAudienceHealth.status} at ${overallAudienceHealth.score}/100.`,
    `${coveredCount} lifecycle audience buckets are covered and ${missingCount} are missing.`,
    broadRisk.level !== "low" && broadRisk.level !== "unknown" ? `Broad-list risk is ${broadRisk.level}.` : null,
    insights[0] ? `Top priority: ${insights[0].title}.` : null,
  ].filter(Boolean).join(" ");

  return {
    ok: true,
    readOnly: true,
    summary: {
      audiencesAnalyzed: inventory.count,
      timeframe: {
        requested: timeframe.key,
        start: timeframe.start.toISOString(),
        end: timeframe.end.toISOString(),
      },
      needsKlaviyoAudienceData: !inventory.available,
      needsLocalAudienceData: !local.available,
      executiveSummary,
      insightSummary,
      topIssues: topItems(insights, (insight) => ["critical", "issue", "warning"].includes(insight.severity)),
      topOpportunities: topItems(insights, (insight) => insight.severity === "opportunity" || insight.insightType === "build" || insight.insightType === "scale"),
    },
    overallAudienceHealth,
    lifecycleAudienceCoverage: Object.values(coverageMap),
    coverageMap,
    klaviyoAudienceInventory: inventory,
    localAudienceSignals: local,
    broadAudienceRisk: broadRisk,
    duplicateOrOverlapRisks,
    missingAudienceOpportunities,
    insights,
    chartHints,
    caveats,
    recommendedActions: recommendedActions(insights),
    metadata: {
      generatedAt: new Date().toISOString(),
      feature: "segment-audience-audit-v0",
      readOnly: true,
      sources: [
        ...(inventory.available ? ["Klaviyo lists", "Klaviyo segments"] : []),
        ...(local.available ? ["Customer", "Order", "OrderItem", "CustomerEvent", "Product", "Product Performance Intelligence"] : []),
        ...(context.campaignAuditRuns ? ["Campaign Audit WorkflowRun"] : []),
        ...(context.flowAuditRuns ? ["Flow Audit WorkflowRun"] : []),
      ],
      input: {
        timeframe: timeframe.key,
        includeKlaviyo,
        includeLocal,
        limit,
      },
      relatedAuditContext: context,
    },
  };
}

export function getKlaviyoAudienceConfigForSegmentAudit() {
  return getKlaviyoAudienceConfig();
}

export type { KlaviyoAudienceConfig };
