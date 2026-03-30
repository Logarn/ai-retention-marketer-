import { NextResponse } from "next/server";
import { generateAnalyticsInsights } from "@/lib/ai";
import { getOverviewMetrics, getRevenueAttribution, getRfmDistribution } from "@/lib/analytics";

export async function POST() {
  try {
    const [overview, rfm, attribution] = await Promise.all([
      getOverviewMetrics(),
      getRfmDistribution(),
      getRevenueAttribution(),
    ]);

    const generated = await generateAnalyticsInsights({
      overview,
      segments: rfm,
      channelPerformance: attribution.byChannel,
    });

    return NextResponse.json({
      insights: generated.insights,
      generatedAt: new Date().toISOString(),
      source: generated.source,
    });
  } catch (error) {
    console.error("POST /api/analytics/generate-insights failed", error);
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 500 });
  }
}
