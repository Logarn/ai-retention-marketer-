import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;
const DEFAULT_MIN_VIEWS = 20;
const MAX_EVENT_ROWS = 50_000;

const SUPPORTED_TIMEFRAMES: Record<string, number | null> = {
  last_30_days: 30,
  last_90_days: 90,
  last_365_days: 365,
  lifetime: null,
  all: null,
};

export type ProductPerformanceIntelligenceOptions = {
  limit?: number;
  minViews?: number;
  timeframe?: string | null;
};

export type ProductPerformanceTier =
  | "revenue_anchor"
  | "hidden_gem"
  | "add_on_booster"
  | "replenishment_candidate"
  | "fix_candidate";

export type ProductPerformanceTierItem = {
  productId: string;
  externalId: string | null;
  name: string;
  sku: string | null;
  category: string | null;
  price: number;
  tier: ProductPerformanceTier;
  score: number;
  confidence: number;
  metrics: {
    revenue: number;
    orders: number;
    unitsSold: number;
    customers: number;
    avgLineRevenue: number;
    repeatPurchaseRate: number;
    avgReplenishmentDays: number | null;
    observedAvgReorderDays: number | null;
    views: number | null;
    addToCarts: number | null;
    orderConversionRate: number | null;
    revenuePerView: number | null;
  };
  evidence: string[];
  recommendedUse: string;
};

export type ProductPerformanceIntelligenceResult = {
  ok: true;
  summary: {
    productsAnalyzed: number;
    productsWithOrders: number;
    productsWithViews: number;
    productsWithShopifyIds: number;
    ordersAnalyzed: number;
    orderItemsAnalyzed: number;
    customersAnalyzed: number;
    totalRevenue: number;
    timeframe: {
      requested: string | null;
      applied: string;
      start: string | null;
      end: string;
    };
    viewData: {
      available: boolean;
      reliable: boolean;
      minViews: number;
      productViewEvents: number;
      addToCartEvents: number;
      productsMeetingMinViews: number;
    };
    sources: Array<"Product" | "Order" | "OrderItem" | "Customer" | "CustomerEvent">;
  };
  tiers: {
    revenueAnchors: ProductPerformanceTierItem[];
    hiddenGems: ProductPerformanceTierItem[];
    addOnBoosters: ProductPerformanceTierItem[];
    replenishmentCandidates: ProductPerformanceTierItem[];
    fixCandidates: ProductPerformanceTierItem[];
  };
  lifecyclePlacement: {
    welcomeHero: ProductPerformanceTierItem[];
    welcomeHiddenGems: ProductPerformanceTierItem[];
    browseAbandon: ProductPerformanceTierItem[];
    cartCheckoutAddOns: ProductPerformanceTierItem[];
    postPurchaseCrossSell: ProductPerformanceTierItem[];
    vip: ProductPerformanceTierItem[];
    winback: ProductPerformanceTierItem[];
  };
  caveats: string[];
  generatedAt: string;
};

type TimeframeResolution = {
  requested: string | null;
  applied: string;
  start: Date | null;
  end: Date;
  caveats: string[];
};

type ProductMetric = {
  productId: string;
  externalId: string | null;
  name: string;
  sku: string | null;
  category: string | null;
  price: number;
  avgReplenishmentDays: number | null;
  revenue: number;
  orders: number;
  unitsSold: number;
  customers: number;
  avgLineRevenue: number;
  repeatPurchaseRate: number;
  observedAvgReorderDays: number | null;
  views: number;
  addToCarts: number;
  orderConversionRate: number | null;
  revenuePerView: number | null;
};

type EventCounts = {
  views: number;
  addToCarts: number;
};

type ProductForIntelligence = Prisma.ProductGetPayload<{
  include: {
    orderItems: {
      select: {
        id: true;
        orderId: true;
        quantity: true;
        price: true;
        order: {
          select: {
            customerId: true;
            createdAt: true;
          };
        };
      };
    };
  };
}>;

function cleanWholeNumber(value: number | null | undefined, fallback: number, max = MAX_LIMIT) {
  if (!value || !Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function money(value: number) {
  return Number(value.toFixed(2));
}

function rate(value: number | null) {
  return value === null ? null : Number(value.toFixed(4));
}

function score(value: number) {
  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function confidence(value: number) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
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

function daysBetween(a: Date, b: Date) {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

function resolveTimeframe(timeframe: string | null | undefined): TimeframeResolution {
  const requested = timeframe?.trim() || null;
  const normalized = normalizeText(requested).replace(/\s+/g, "_");
  const end = new Date();
  const caveats: string[] = [];

  if (!requested) {
    return { requested: null, applied: "lifetime", start: null, end, caveats };
  }

  if (!(normalized in SUPPORTED_TIMEFRAMES)) {
    caveats.push(
      `Unsupported timeframe "${requested}" was ignored; product intelligence used lifetime local data.`,
    );
    return { requested, applied: "lifetime", start: null, end, caveats };
  }

  const days = SUPPORTED_TIMEFRAMES[normalized];
  if (!days) {
    return { requested, applied: normalized, start: null, end, caveats };
  }

  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { requested, applied: normalized, start, end, caveats };
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

function resolveEventProductId(
  properties: Prisma.JsonValue | null,
  lookup: Map<string, string>,
) {
  const directId = propertyString(properties, ["productId", "product_id", "productID"]);
  if (directId && lookup.has(directId)) return lookup.get(directId)!;

  const externalId = propertyString(properties, ["externalId", "external_id", "shopifyProductId", "shopify_product_id"]);
  if (externalId && lookup.has(externalId)) return lookup.get(externalId)!;

  const sku = propertyString(properties, ["sku", "SKU"]);
  if (sku && lookup.has(normalizeText(sku))) return lookup.get(normalizeText(sku))!;

  const name = propertyString(properties, ["productName", "product_name", "name", "title"]);
  if (name && lookup.has(normalizeText(name))) return lookup.get(normalizeText(name))!;

  return null;
}

function accessoryLike(metric: Pick<ProductMetric, "name" | "category" | "price">, medianPrice: number) {
  const text = `${normalizeText(metric.name)} ${normalizeText(metric.category)}`;
  return (
    metric.price <= medianPrice ||
    /\b(accessor|addon|add on|cap|sock|socks|strap|pouch|tote|holder|sleeve|grip|bottle|scarf|bracelet|anklet|bag)\b/.test(text)
  );
}

function premiumLike(metric: Pick<ProductMetric, "name" | "category" | "price">, p75Price: number) {
  const text = `${normalizeText(metric.name)} ${normalizeText(metric.category)}`;
  return metric.price >= p75Price || /\b(bundle|vip|premium|limited|watch|trench|blazer|duffel)\b/.test(text);
}

function baseTierItem(
  metric: ProductMetric,
  tier: ProductPerformanceTier,
  scoreValue: number,
  confidenceValue: number,
  evidence: string[],
  recommendedUse: string,
): ProductPerformanceTierItem {
  return {
    productId: metric.productId,
    externalId: metric.externalId,
    name: metric.name,
    sku: metric.sku,
    category: metric.category,
    price: money(metric.price),
    tier,
    score: score(scoreValue),
    confidence: confidence(confidenceValue),
    metrics: {
      revenue: money(metric.revenue),
      orders: metric.orders,
      unitsSold: metric.unitsSold,
      customers: metric.customers,
      avgLineRevenue: money(metric.avgLineRevenue),
      repeatPurchaseRate: rate(metric.repeatPurchaseRate) ?? 0,
      avgReplenishmentDays: metric.avgReplenishmentDays,
      observedAvgReorderDays: metric.observedAvgReorderDays,
      views: metric.views,
      addToCarts: metric.addToCarts,
      orderConversionRate: rate(metric.orderConversionRate),
      revenuePerView: metric.revenuePerView === null ? null : money(metric.revenuePerView),
    },
    evidence,
    recommendedUse,
  };
}

function byProductId<T extends { productId: string }>(items: T[]) {
  return new Map(items.map((item) => [item.productId, item]));
}

function uniqueByProduct(items: ProductPerformanceTierItem[], limit: number) {
  const seen = new Set<string>();
  const unique: ProductPerformanceTierItem[] = [];
  for (const item of items) {
    if (seen.has(item.productId)) continue;
    seen.add(item.productId);
    unique.push(item);
    if (unique.length >= limit) break;
  }
  return unique;
}

async function loadEventCounts(
  products: Array<{ id: string; externalId: string | null; sku: string | null; name: string }>,
  timeframe: TimeframeResolution,
  caveats: string[],
) {
  const lookup = buildProductLookup(products);
  const where: Prisma.CustomerEventWhereInput = {
    eventType: { in: ["product_view", "add_to_cart"] },
    ...(timeframe.start ? { createdAt: { gte: timeframe.start, lte: timeframe.end } } : {}),
  };

  const [totalEvents, events] = await Promise.all([
    prisma.customerEvent.count({ where }),
    prisma.customerEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_EVENT_ROWS,
      select: {
        eventType: true,
        properties: true,
      },
    }),
  ]);

  if (totalEvents > MAX_EVENT_ROWS) {
    caveats.push(
      `CustomerEvent product activity was capped at the most recent ${MAX_EVENT_ROWS} rows for this v0 response.`,
    );
  }

  const counts = new Map<string, EventCounts>();
  let unresolved = 0;

  for (const event of events) {
    const productId = resolveEventProductId(event.properties, lookup);
    if (!productId) {
      unresolved += 1;
      continue;
    }

    const current = counts.get(productId) ?? { views: 0, addToCarts: 0 };
    if (event.eventType === "product_view") current.views += 1;
    if (event.eventType === "add_to_cart") current.addToCarts += 1;
    counts.set(productId, current);
  }

  if (events.length > 0 && unresolved / events.length > 0.25) {
    caveats.push(
      "Some CustomerEvent product activity could not be matched to normalized products; Shopify sync and event product IDs improve view-based tiers.",
    );
  }

  return {
    counts,
    totalEvents,
    unresolved,
  };
}

function buildMetrics(input: {
  products: ProductForIntelligence[];
  eventCounts: Map<string, EventCounts>;
}) {
  const allOrderIds = new Set<string>();
  const allCustomerIds = new Set<string>();
  let totalOrderItems = 0;
  let totalRevenue = 0;

  const metrics = input.products.map((product) => {
    const orderIds = new Set<string>();
    const customerIds = new Set<string>();
    const purchaseDatesByCustomer = new Map<string, Date[]>();
    let revenue = 0;
    let unitsSold = 0;

    for (const item of product.orderItems) {
      orderIds.add(item.orderId);
      allOrderIds.add(item.orderId);
      customerIds.add(item.order.customerId);
      allCustomerIds.add(item.order.customerId);
      unitsSold += item.quantity;
      const lineRevenue = item.quantity * item.price;
      revenue += lineRevenue;
      totalRevenue += lineRevenue;
      totalOrderItems += 1;

      const dates = purchaseDatesByCustomer.get(item.order.customerId) ?? [];
      dates.push(item.order.createdAt);
      purchaseDatesByCustomer.set(item.order.customerId, dates);
    }

    let repeatCustomers = 0;
    const reorderGaps: number[] = [];
    for (const dates of purchaseDatesByCustomer.values()) {
      const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
      if (sorted.length > 1) repeatCustomers += 1;
      for (let index = 1; index < sorted.length; index += 1) {
        reorderGaps.push(daysBetween(sorted[index - 1], sorted[index]));
      }
    }

    const counts = input.eventCounts.get(product.id) ?? { views: 0, addToCarts: 0 };
    const orders = orderIds.size;
    const customers = customerIds.size;
    const repeatPurchaseRate = customers ? repeatCustomers / customers : 0;
    const avgLineRevenue = orders ? revenue / orders : 0;
    const observedAvgReorderDays = reorderGaps.length
      ? Math.round(reorderGaps.reduce((sum, value) => sum + value, 0) / reorderGaps.length)
      : null;

    return {
      productId: product.id,
      externalId: product.externalId,
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: product.price,
      avgReplenishmentDays: product.avgReplenishmentDays,
      revenue,
      orders,
      unitsSold,
      customers,
      avgLineRevenue,
      repeatPurchaseRate,
      observedAvgReorderDays,
      views: counts.views,
      addToCarts: counts.addToCarts,
      orderConversionRate: counts.views ? orders / counts.views : null,
      revenuePerView: counts.views ? revenue / counts.views : null,
    } satisfies ProductMetric;
  });

  return {
    metrics,
    totals: {
      orders: allOrderIds.size,
      customers: allCustomerIds.size,
      orderItems: totalOrderItems,
      revenue: totalRevenue,
    },
  };
}

function classifyMetrics(metrics: ProductMetric[], input: { limit: number; minViews: number; viewDataReliable: boolean }) {
  const revenueValues = metrics.map((metric) => metric.revenue);
  const orderValues = metrics.map((metric) => metric.orders);
  const unitValues = metrics.map((metric) => metric.unitsSold);
  const priceValues = metrics.map((metric) => metric.price);
  const viewValues = metrics.map((metric) => metric.views).filter((views) => views > 0);
  const conversionValues = metrics
    .map((metric) => metric.orderConversionRate)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const revenuePerViewValues = metrics
    .map((metric) => metric.revenuePerView)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const repeatValues = metrics.map((metric) => metric.repeatPurchaseRate);

  const p75Revenue = percentile(revenueValues, 0.75);
  const p75Orders = percentile(orderValues, 0.75);
  const p75Units = percentile(unitValues, 0.75);
  const medianPrice = percentile(priceValues, 0.5);
  const p75Price = percentile(priceValues, 0.75);
  const medianViews = percentile(viewValues, 0.5);
  const p75Views = percentile(viewValues, 0.75);
  const medianConversion = percentile(conversionValues, 0.5);
  const medianRevenuePerView = percentile(revenuePerViewValues, 0.5);
  const p75RevenuePerView = percentile(revenuePerViewValues, 0.75);
  const p75Repeat = percentile(repeatValues, 0.75);

  const revenueAnchors = metrics
    .filter((metric) => metric.revenue > 0 && (metric.revenue >= p75Revenue || metric.orders >= p75Orders || metric.unitsSold >= p75Units))
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders || b.unitsSold - a.unitsSold)
    .slice(0, input.limit)
    .map((metric) =>
      baseTierItem(
        metric,
        "revenue_anchor",
        metric.revenue / Math.max(1, p75Revenue) * 75 + metric.orders / Math.max(1, p75Orders) * 25,
        0.9,
        [
          `$${money(metric.revenue)} revenue across ${metric.orders} orders and ${metric.unitsSold} units.`,
          metric.customers ? `${metric.customers} customers bought this product in the analysis window.` : "No customer purchase spread was available.",
        ],
        "Use as a proven product story for welcome, browse abandon, VIP, and broad campaign proof.",
      ),
    );

  const hiddenGems = input.viewDataReliable
    ? metrics
      .filter(
        (metric) =>
          metric.views >= input.minViews &&
          metric.views <= medianViews &&
          metric.revenue > 0 &&
          ((metric.revenuePerView ?? 0) >= p75RevenuePerView ||
            (metric.orderConversionRate ?? 0) >= Math.max(medianConversion, 0.01)),
      )
      .sort((a, b) => (b.revenuePerView ?? 0) - (a.revenuePerView ?? 0) || b.revenue - a.revenue)
      .slice(0, input.limit)
      .map((metric) =>
        baseTierItem(
          metric,
          "hidden_gem",
          (metric.revenuePerView ?? 0) / Math.max(1, p75RevenuePerView) * 80 + metric.revenue / Math.max(1, p75Revenue) * 20,
          0.78,
          [
            `${metric.views} product views generated $${money(metric.revenue)} revenue.`,
            `Revenue per view is $${money(metric.revenuePerView ?? 0)} with ${rate(metric.orderConversionRate) ?? 0} order conversion from views.`,
          ],
          "Give more lifecycle exposure through welcome education, product spotlights, and browse abandon modules.",
        ),
      )
    : [];

  const addOnBoosters = metrics
    .filter((metric) => metric.orders > 0 && accessoryLike(metric, medianPrice) && (metric.orders >= percentile(orderValues, 0.5) || metric.unitsSold >= percentile(unitValues, 0.5)))
    .sort((a, b) => b.orders - a.orders || a.price - b.price || b.unitsSold - a.unitsSold)
    .slice(0, input.limit)
    .map((metric) =>
      baseTierItem(
        metric,
        "add_on_booster",
        metric.orders / Math.max(1, p75Orders) * 65 + (1 - metric.price / Math.max(1, p75Price * 1.5)) * 35,
        0.82,
        [
          `$${money(metric.price)} price point with ${metric.orders} orders and ${metric.unitsSold} units sold.`,
          metric.category ? `Category signal: ${metric.category}.` : "Category signal is missing.",
        ],
        "Use as a cart, checkout, and post-purchase add-on or cross-sell candidate.",
      ),
    );

  const replenishmentCandidates = metrics
    .filter(
      (metric) =>
        metric.orders > 0 &&
        (Boolean(metric.avgReplenishmentDays) ||
          metric.repeatPurchaseRate >= Math.max(0.15, p75Repeat) ||
          (metric.observedAvgReorderDays !== null && metric.observedAvgReorderDays >= 7 && metric.observedAvgReorderDays <= 120)),
    )
    .sort((a, b) => {
      const explicitDelta = Number(Boolean(b.avgReplenishmentDays)) - Number(Boolean(a.avgReplenishmentDays));
      if (explicitDelta) return explicitDelta;
      return (
        b.repeatPurchaseRate - a.repeatPurchaseRate ||
        (a.observedAvgReorderDays ?? Number.MAX_SAFE_INTEGER) -
          (b.observedAvgReorderDays ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .slice(0, input.limit)
    .map((metric) =>
      baseTierItem(
        metric,
        "replenishment_candidate",
        (metric.repeatPurchaseRate / Math.max(0.01, p75Repeat)) * 55 + (metric.avgReplenishmentDays ? 35 : 0) + (metric.observedAvgReorderDays ? 10 : 0),
        metric.avgReplenishmentDays ? 0.9 : 0.72,
        [
          metric.avgReplenishmentDays
            ? `Configured replenishment window: ${metric.avgReplenishmentDays} days.`
            : `Observed average reorder gap: ${metric.observedAvgReorderDays ?? "unknown"} days.`,
          `${rate(metric.repeatPurchaseRate) ?? 0} repeat-purchase rate across ${metric.customers} customers.`,
        ],
        "Use for replenishment, reorder education, post-purchase timing, and winback timing logic.",
      ),
    );

  const fixCandidates = input.viewDataReliable
    ? metrics
      .filter(
        (metric) =>
          metric.views >= Math.max(input.minViews, p75Views) &&
          ((metric.orderConversionRate ?? 0) <= medianConversion || (metric.revenuePerView ?? 0) <= medianRevenuePerView),
      )
      .sort((a, b) => b.views - a.views || (a.revenuePerView ?? 0) - (b.revenuePerView ?? 0))
      .slice(0, input.limit)
      .map((metric) =>
        baseTierItem(
          metric,
          "fix_candidate",
          metric.views / Math.max(1, p75Views) * 70 + (1 - (metric.revenuePerView ?? 0) / Math.max(1, medianRevenuePerView || 1)) * 30,
          0.74,
          [
            `${metric.views} product views produced $${money(metric.revenue)} revenue.`,
            `Revenue per view is $${money(metric.revenuePerView ?? 0)} and order conversion from views is ${rate(metric.orderConversionRate) ?? 0}.`,
          ],
          "Improve proof, positioning, offer fit, product page clarity, or audience placement before giving prime lifecycle real estate.",
        ),
      )
    : [];

  return {
    revenueAnchors,
    hiddenGems,
    addOnBoosters,
    replenishmentCandidates,
    fixCandidates,
    thresholds: {
      medianPrice,
      p75Price,
      p75Views,
    },
  };
}

function buildLifecyclePlacement(input: {
  tiers: ProductPerformanceIntelligenceResult["tiers"];
  metrics: ProductMetric[];
  limit: number;
  viewDataReliable: boolean;
  p75Price: number;
}) {
  const anchorsById = byProductId(input.tiers.revenueAnchors);
  const hiddenById = byProductId(input.tiers.hiddenGems);
  const replenishmentById = byProductId(input.tiers.replenishmentCandidates);

  const browseCandidates = input.viewDataReliable
    ? input.metrics
      .filter((metric) => metric.views > 0 && (anchorsById.has(metric.productId) || hiddenById.has(metric.productId) || metric.orders > 0))
      .sort((a, b) => b.views - a.views || b.revenue - a.revenue)
      .map((metric) => anchorsById.get(metric.productId) ?? hiddenById.get(metric.productId))
      .filter((item): item is ProductPerformanceTierItem => Boolean(item))
    : input.tiers.revenueAnchors;

  const vipCandidates = [
    ...input.tiers.revenueAnchors.filter((item) => premiumLike(item, input.p75Price)),
    ...input.tiers.hiddenGems.filter((item) => premiumLike(item, input.p75Price)),
  ];

  return {
    welcomeHero: uniqueByProduct(input.tiers.revenueAnchors, input.limit),
    welcomeHiddenGems: uniqueByProduct(input.tiers.hiddenGems, input.limit),
    browseAbandon: uniqueByProduct(browseCandidates, input.limit),
    cartCheckoutAddOns: uniqueByProduct(input.tiers.addOnBoosters, input.limit),
    postPurchaseCrossSell: uniqueByProduct(
      [...input.tiers.addOnBoosters, ...input.tiers.replenishmentCandidates],
      input.limit,
    ),
    vip: uniqueByProduct(vipCandidates.length ? vipCandidates : input.tiers.revenueAnchors, input.limit),
    winback: uniqueByProduct(
      [...input.tiers.replenishmentCandidates, ...input.tiers.revenueAnchors.filter((item) => !replenishmentById.has(item.productId))],
      input.limit,
    ),
  };
}

export async function getProductPerformanceIntelligence(
  options: ProductPerformanceIntelligenceOptions = {},
): Promise<ProductPerformanceIntelligenceResult> {
  const limit = cleanWholeNumber(options.limit, DEFAULT_LIMIT);
  const minViews = cleanWholeNumber(options.minViews, DEFAULT_MIN_VIEWS, 10_000);
  const timeframe = resolveTimeframe(options.timeframe);
  const caveats = [...timeframe.caveats];

  const orderItemWhere: Prisma.OrderItemWhereInput | undefined = timeframe.start
    ? { order: { createdAt: { gte: timeframe.start, lte: timeframe.end } } }
    : undefined;

  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      orderItems: {
        ...(orderItemWhere ? { where: orderItemWhere } : {}),
        select: {
          id: true,
          orderId: true,
          quantity: true,
          price: true,
          order: {
            select: {
              customerId: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  const productRefs = products.map((product) => ({
    id: product.id,
    externalId: product.externalId,
    sku: product.sku,
    name: product.name,
  }));

  const eventResult = await loadEventCounts(productRefs, timeframe, caveats);
  const { metrics, totals } = buildMetrics({ products, eventCounts: eventResult.counts });

  const productsWithOrders = metrics.filter((metric) => metric.orders > 0).length;
  const productsWithViews = metrics.filter((metric) => metric.views > 0).length;
  const productsMeetingMinViews = metrics.filter((metric) => metric.views >= minViews).length;
  const productViewEvents = metrics.reduce((sum, metric) => sum + metric.views, 0);
  const addToCartEvents = metrics.reduce((sum, metric) => sum + metric.addToCarts, 0);
  const productsWithShopifyIds = products.filter((product) => Boolean(product.externalId)).length;
  const productsWithReplenishmentDays = products.filter((product) => Boolean(product.avgReplenishmentDays)).length;
  const implausibleViewProducts = metrics.filter(
    (metric) => metric.views >= minViews && metric.orderConversionRate !== null && metric.orderConversionRate > 1,
  ).length;
  const viewDataPlausible =
    productsMeetingMinViews > 0 &&
    implausibleViewProducts <= Math.max(1, Math.floor(productsMeetingMinViews * 0.25));
  const viewDataReliable =
    productViewEvents > 0 &&
    productsMeetingMinViews >= Math.min(3, Math.max(1, Math.ceil(products.length * 0.1))) &&
    viewDataPlausible;

  if (products.length === 0) {
    caveats.push("No normalized products were found. Run Shopify sync or seed local product data before relying on product intelligence.");
  }

  if (products.length > 0 && productsWithShopifyIds < products.length) {
    caveats.push(
      `Only ${productsWithShopifyIds} of ${products.length} products have Shopify external IDs; Shopify sync is required for full product intelligence.`,
    );
  }

  if (productsWithOrders === 0) {
    caveats.push("No normalized order items were found for this window; revenue tiers need Shopify/local order sync before they become useful.");
  }

  if (!viewDataReliable) {
    caveats.push(
      `Product view data is missing or below the minViews=${minViews} reliability threshold; hidden gem and fix-candidate tiers avoid fake precision.`,
    );
  }

  if (implausibleViewProducts > 0) {
    caveats.push(
      `${implausibleViewProducts} products have more orders than tracked product views in CustomerEvent data; Shopify/event sync is required before using view efficiency as product truth.`,
    );
  }

  if (products.length > 0 && productsWithReplenishmentDays === 0) {
    caveats.push(
      "No products have avgReplenishmentDays configured; replenishment candidates rely only on observed repeat-purchase behavior.",
    );
  }

  const classified = classifyMetrics(metrics, { limit, minViews, viewDataReliable });
  const tiers = {
    revenueAnchors: classified.revenueAnchors,
    hiddenGems: classified.hiddenGems,
    addOnBoosters: classified.addOnBoosters,
    replenishmentCandidates: classified.replenishmentCandidates,
    fixCandidates: classified.fixCandidates,
  };

  return {
    ok: true,
    summary: {
      productsAnalyzed: products.length,
      productsWithOrders,
      productsWithViews,
      productsWithShopifyIds,
      ordersAnalyzed: totals.orders,
      orderItemsAnalyzed: totals.orderItems,
      customersAnalyzed: totals.customers,
      totalRevenue: money(totals.revenue),
      timeframe: {
        requested: timeframe.requested,
        applied: timeframe.applied,
        start: timeframe.start ? timeframe.start.toISOString() : null,
        end: timeframe.end.toISOString(),
      },
      viewData: {
        available: productViewEvents > 0,
        reliable: viewDataReliable,
        minViews,
        productViewEvents,
        addToCartEvents,
        productsMeetingMinViews,
      },
      sources: ["Product", "Order", "OrderItem", "Customer", "CustomerEvent"],
    },
    tiers,
    lifecyclePlacement: buildLifecyclePlacement({
      tiers,
      metrics,
      limit,
      viewDataReliable,
      p75Price: classified.thresholds.p75Price,
    }),
    caveats,
    generatedAt: new Date().toISOString(),
  };
}
