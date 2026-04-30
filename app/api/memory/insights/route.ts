import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeCampaignMemory } from "@/app/api/memory/shared";

type MemoryRow = Awaited<ReturnType<typeof prisma.campaignMemory.findMany>>[number];

function average(values: number[]) {
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

function sum(values: number[]) {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(2));
}

function topBy<T>(items: T[], getValue: (item: T) => number | null | undefined) {
  return items.reduce<T | null>((best, current) => {
    const value = getValue(current);
    if (value === null || value === undefined || !Number.isFinite(value)) return best;
    if (!best) return current;
    const bestValue = getValue(best);
    return bestValue === null || bestValue === undefined || value > bestValue ? current : best;
  }, null);
}

function groupByRevenue(memories: MemoryRow[], key: "segment" | "campaignType") {
  const groups = new Map<string, { key: string; revenue: number; campaigns: number }>();
  for (const memory of memories) {
    const groupKey = memory[key] || "unknown";
    const current = groups.get(groupKey) ?? { key: groupKey, revenue: 0, campaigns: 0 };
    current.revenue += memory.revenue;
    current.campaigns += 1;
    groups.set(groupKey, current);
  }

  const ranked = Array.from(groups.values())
    .map((group) => ({ ...group, revenue: Number(group.revenue.toFixed(2)) }))
    .sort((a, b) => b.revenue - a.revenue);

  return ranked[0] ?? null;
}

function compactCampaign(memory: MemoryRow | null) {
  if (!memory) return null;
  return {
    id: memory.id,
    campaignId: memory.campaignId,
    name: memory.name,
    campaignType: memory.campaignType,
    segment: memory.segment,
    subjectLine: memory.subjectLine,
    sentAt: memory.sentAt.toISOString(),
    openRate: memory.openRate,
    clickRate: memory.clickRate,
    conversionRate: memory.conversionRate,
    revenue: memory.revenue,
    orders: memory.orders,
    winningInsight: memory.winningInsight,
  };
}

export async function GET() {
  try {
    const memories = await prisma.campaignMemory.findMany({
      orderBy: { sentAt: "desc" },
      take: 500,
    });

    const totalRevenue = sum(memories.map((memory) => memory.revenue));
    const totalOrders = memories.reduce((count, memory) => count + (memory.orders ?? 0), 0);
    const topClickCampaign = topBy(memories, (memory) => memory.clickRate);
    const topRevenueCampaign = topBy(memories, (memory) => memory.revenue);
    const mostRecentLesson =
      memories.find((memory) => memory.winningInsight || memory.notes) ?? null;

    return NextResponse.json({
      summary: {
        totalCampaigns: memories.length,
        totalRevenue,
        totalOrders,
        averageOpenRate: average(
          memories
            .map((memory) => memory.openRate)
            .filter((rate): rate is number => typeof rate === "number"),
        ),
        averageClickRate: average(
          memories
            .map((memory) => memory.clickRate)
            .filter((rate): rate is number => typeof rate === "number"),
        ),
        averageConversionRate: average(
          memories
            .map((memory) => memory.conversionRate)
            .filter((rate): rate is number => typeof rate === "number"),
        ),
      },
      bestSegmentByRevenue: groupByRevenue(memories, "segment"),
      bestCampaignTypeByRevenue: groupByRevenue(memories, "campaignType"),
      topCampaignByClickRate: compactCampaign(topClickCampaign),
      topCampaignByRevenue: compactCampaign(topRevenueCampaign),
      mostRecentLesson: mostRecentLesson
        ? {
            id: mostRecentLesson.id,
            campaignId: mostRecentLesson.campaignId,
            name: mostRecentLesson.name,
            sentAt: mostRecentLesson.sentAt.toISOString(),
            lesson: mostRecentLesson.winningInsight ?? mostRecentLesson.notes,
          }
        : null,
      recentMemories: memories.slice(0, 5).map(serializeCampaignMemory),
    });
  } catch (error) {
    console.error("GET /api/memory/insights failed", error);
    return NextResponse.json(
      {
        error: "Failed to load campaign memory insights",
      },
      { status: 500 },
    );
  }
}
