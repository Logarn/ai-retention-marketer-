import {
  addDays,
  differenceInDays,
  format,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSegmentMeta } from "@/lib/constants";
import { assignSegment, calculateChurnRisk, quantileScore } from "@/lib/segment";

const dayMs = 24 * 60 * 60 * 1000;

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function computeAndPersistCustomerScores() {
  const customers = await prisma.customer.findMany({
    include: {
      orders: {
        orderBy: { createdAt: "asc" },
      },
      events: {
        where: {
          eventType: { in: ["email_open", "email_click", "sms_click", "page_view", "product_view"] },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });

  if (customers.length === 0) return { updated: 0 };

  const now = new Date();
  const recencyCandidates = customers.map((c) =>
    c.lastOrderDate ? Math.max(1, differenceInDays(now, c.lastOrderDate)) : 365
  );
  const frequencyCandidates = customers.map((c) => c.totalOrders || 0);
  const monetaryCandidates = customers.map((c) => c.totalSpent || 0);

  const updates: Prisma.PrismaPromise<unknown>[] = [];

  for (const customer of customers) {
    const lastOrderDate = customer.lastOrderDate;
    const recencyDays = lastOrderDate ? Math.max(1, differenceInDays(now, lastOrderDate)) : 365;
    const recencyScore = quantileScore(recencyDays, recencyCandidates, { inverse: true });
    const frequencyScore = quantileScore(customer.totalOrders || 0, frequencyCandidates);
    const monetaryScore = quantileScore(customer.totalSpent || 0, monetaryCandidates);
    const segment = assignSegment({ recencyScore, frequencyScore, monetaryScore });

    const recentOrders = customer.orders.filter((o) => differenceInDays(now, o.createdAt) <= 90);
    const priorOrders = customer.orders.filter(
      (o) =>
        differenceInDays(now, o.createdAt) > 90 && differenceInDays(now, o.createdAt) <= 180
    );
    const frequencyTrend =
      priorOrders.length === 0 ? 1 : Math.max(0, Math.min(1, recentOrders.length / priorOrders.length));

    const engagementRecent = customer.events.filter((e) => differenceInDays(now, e.createdAt) <= 30).length;
    const engagementPrior = customer.events.filter(
      (e) => differenceInDays(now, e.createdAt) > 30 && differenceInDays(now, e.createdAt) <= 60
    ).length;
    const engagementTrend =
      engagementPrior === 0
        ? engagementRecent > 0
          ? 1
          : 0
        : Math.max(0, Math.min(1, engagementRecent / engagementPrior));

    const browseRecent = customer.events.filter(
      (e) =>
        e.eventType === "page_view" ||
        (e.eventType === "product_view" && differenceInDays(now, e.createdAt) <= 30)
    ).length;
    const browsePrior = customer.events.filter(
      (e) =>
        (e.eventType === "page_view" || e.eventType === "product_view") &&
        differenceInDays(now, e.createdAt) > 30 &&
        differenceInDays(now, e.createdAt) <= 60
    ).length;
    const browseTrend =
      browsePrior === 0 ? (browseRecent > 0 ? 1 : 0) : Math.max(0, Math.min(1, browseRecent / browsePrior));

    const churnRiskScore = calculateChurnRisk({
      daysSinceLastPurchase: recencyDays,
      frequencyTrend,
      engagementTrend,
      browseTrend,
    });

    updates.push(
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          recencyScore,
          frequencyScore,
          monetaryScore,
          segment,
          churnRiskScore,
        },
      })
    );
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  return { updated: updates.length };
}

export async function getOverviewMetrics() {
  const now = new Date();
  const activeCutoff = subDays(now, 90);
  const totalCustomers = await prisma.customer.count();
  const activeCustomers = await prisma.customer.count({
    where: { lastOrderDate: { gte: activeCutoff } },
  });
  const aggCustomers = await prisma.customer.aggregate({
    _avg: { totalSpent: true, avgOrderValue: true },
  });

  const repeatCustomers = await prisma.customer.count({
    where: { totalOrders: { gte: 2 } },
  });

  const churnRate = totalCustomers ? ((totalCustomers - activeCustomers) / totalCustomers) * 100 : 0;
  const repeatPurchaseRate = totalCustomers ? (repeatCustomers / totalCustomers) * 100 : 0;

  return {
    totalCustomers,
    activeCustomers,
    averageClv: Number((aggCustomers._avg.totalSpent || 0).toFixed(2)),
    repeatPurchaseRate: Number(repeatPurchaseRate.toFixed(2)),
    averageOrderValue: Number((aggCustomers._avg.avgOrderValue || 0).toFixed(2)),
    churnRate: Number(churnRate.toFixed(2)),
  };
}

export async function getRfmDistribution() {
  const groups = await prisma.customer.groupBy({
    by: ["segment"],
    _count: { _all: true },
    _avg: { totalSpent: true },
  });

  const normalized = groups.map((g) => {
    const key = (g.segment || "unknown").toLowerCase();
    const meta = getSegmentMeta(key);
    return {
      key,
      label: meta.label,
      count: g._count._all,
      averageClv: Number((g._avg.totalSpent || 0).toFixed(2)),
      color: meta.color,
      recommendedAction: meta.recommendedAction,
    };
  });

  normalized.sort((a, b) => b.count - a.count);
  return normalized;
}

export async function getAtRiskCustomers(limit = 100) {
  return prisma.customer.findMany({
    where: { churnRiskScore: { gte: 60 } },
    orderBy: [{ churnRiskScore: "desc" }, { totalSpent: "desc" }],
    take: limit,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      segment: true,
      churnRiskScore: true,
      lastOrderDate: true,
      totalSpent: true,
      totalOrders: true,
    },
  });
}

export async function getCohortRetention(months = 12) {
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      firstOrderDate: true,
      createdAt: true,
      orders: {
        select: { createdAt: true },
      },
    },
  });

  const cohorts = new Map<
    string,
    {
      cohort: string;
      customers: number;
      monthly: Record<number, number>;
    }
  >();

  const startWindow = subMonths(startOfMonth(new Date()), months);

  for (const customer of customers) {
    const cohortBase = customer.firstOrderDate ?? customer.createdAt;
    const cohortStart = startOfMonth(cohortBase);
    if (cohortStart < startWindow) continue;
    const cohortKey = format(cohortStart, "yyyy-MM");

    if (!cohorts.has(cohortKey)) {
      cohorts.set(cohortKey, { cohort: cohortKey, customers: 0, monthly: {} });
    }
    const bucket = cohorts.get(cohortKey)!;
    bucket.customers += 1;
    bucket.monthly[0] = (bucket.monthly[0] || 0) + 1;

    const seen = new Set<number>();
    for (const order of customer.orders) {
      const orderMonth = startOfMonth(order.createdAt);
      const monthIndex = Math.floor((orderMonth.getTime() - cohortStart.getTime()) / (30 * dayMs));
      if (monthIndex >= 0 && monthIndex <= months && !seen.has(monthIndex)) {
        seen.add(monthIndex);
        bucket.monthly[monthIndex] = (bucket.monthly[monthIndex] || 0) + 1;
      }
    }
  }

  const cohortRows = Array.from(cohorts.values())
    .sort((a, b) => a.cohort.localeCompare(b.cohort))
    .map((row) => {
      const retention: Record<string, number> = {};
      for (let month = 0; month <= months; month += 1) {
        const retained = row.monthly[month] || 0;
        retention[`m${month}`] = row.customers ? Number(((retained / row.customers) * 100).toFixed(1)) : 0;
      }
      return {
        cohort: row.cohort,
        customers: row.customers,
        retention,
      };
    });

  return {
    months,
    rows: cohortRows,
  };
}

export async function getRevenueAttribution() {
  const campaignMetrics = await prisma.campaignMetrics.findMany({
    include: {
      campaign: true,
    },
  });

  const byCampaign = campaignMetrics.map((m) => ({
    campaignId: m.campaignId,
    campaignName: m.campaign.name,
    channel: m.campaign.channel,
    revenue: Number(m.revenue.toFixed(2)),
    sent: m.sent,
    converted: m.converted,
    revenuePerMessage: m.sent > 0 ? Number((m.revenue / m.sent).toFixed(2)) : 0,
    conversionRate: m.sent > 0 ? Number(((m.converted / m.sent) * 100).toFixed(2)) : 0,
  }));

  const byChannelMap = new Map<string, { channel: string; revenue: number; sent: number; converted: number }>();
  for (const entry of byCampaign) {
    const ch = entry.channel === "multi" ? "email+sms" : entry.channel;
    if (!byChannelMap.has(ch)) byChannelMap.set(ch, { channel: ch, revenue: 0, sent: 0, converted: 0 });
    const row = byChannelMap.get(ch)!;
    row.revenue += entry.revenue;
    row.sent += entry.sent;
    row.converted += entry.converted;
  }

  const byChannel = Array.from(byChannelMap.values()).map((row) => ({
    ...row,
    revenue: Number(row.revenue.toFixed(2)),
    revenuePerMessage: row.sent > 0 ? Number((row.revenue / row.sent).toFixed(2)) : 0,
    conversionRate: row.sent > 0 ? Number(((row.converted / row.sent) * 100).toFixed(2)) : 0,
  }));

  return {
    byCampaign,
    byChannel,
  };
}

export async function getProductInsights() {
  const products = await prisma.product.findMany({
    include: {
      orderItems: {
        include: {
          order: true,
        },
      },
    },
  });

  const topRepeatPurchase = products
    .map((p) => {
      const customerCounts = new Map<string, number>();
      for (const item of p.orderItems) {
        const prev = customerCounts.get(item.order.customerId) || 0;
        customerCounts.set(item.order.customerId, prev + 1);
      }
      const totalCustomers = customerCounts.size;
      const repeatCustomers = Array.from(customerCounts.values()).filter((count) => count > 1).length;
      const repeatRate = totalCustomers ? (repeatCustomers / totalCustomers) * 100 : 0;
      return {
        productId: p.id,
        productName: p.name,
        category: p.category,
        repeatRate: Number(repeatRate.toFixed(2)),
      };
    })
    .sort((a, b) => b.repeatRate - a.repeatRate)
    .slice(0, 10);

  const orderItems = await prisma.orderItem.findMany({
    select: {
      orderId: true,
      productId: true,
      product: { select: { name: true } },
    },
  });

  const orderToProducts = new Map<string, { id: string; name: string }[]>();
  for (const item of orderItems) {
    if (!orderToProducts.has(item.orderId)) orderToProducts.set(item.orderId, []);
    orderToProducts.get(item.orderId)!.push({ id: item.productId, name: item.product.name });
  }

  const affinityMap = new Map<string, number>();
  for (const productsInOrder of orderToProducts.values()) {
    const uniqueProducts = Array.from(new Map(productsInOrder.map((p) => [p.id, p])).values());
    for (let i = 0; i < uniqueProducts.length; i += 1) {
      for (let j = i + 1; j < uniqueProducts.length; j += 1) {
        const a = uniqueProducts[i];
        const b = uniqueProducts[j];
        const key = [a.id, b.id].sort().join("::");
        affinityMap.set(key, (affinityMap.get(key) || 0) + 1);
      }
    }
  }

  const idToName = new Map(products.map((p) => [p.id, p.name]));
  const affinity = Array.from(affinityMap.entries())
    .map(([key, count]) => {
      const [aId, bId] = key.split("::");
      return {
        productA: idToName.get(aId) || "Unknown",
        productB: idToName.get(bId) || "Unknown",
        overlapOrders: count,
      };
    })
    .sort((a, b) => b.overlapOrders - a.overlapOrders)
    .slice(0, 10);

  const replenishmentWindows = products
    .filter((p) => p.avgReplenishmentDays)
    .map((p) => ({
      productName: p.name,
      category: p.category,
      predictedWindowDays: p.avgReplenishmentDays!,
      nextLikelyReorderDate: format(addDays(new Date(), p.avgReplenishmentDays!), "yyyy-MM-dd"),
    }))
    .slice(0, 15);

  return {
    topRepeatPurchase,
    productAffinity: affinity,
    replenishmentWindows,
  };
}

export function safeDate(input?: string | null): Date | null {
  return asDate(input);
}
