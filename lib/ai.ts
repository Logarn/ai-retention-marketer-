import Anthropic from "@anthropic-ai/sdk";

export const anthropicClient = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export const CLAUDE_MODEL = "claude-sonnet-4-20250514";

type AnalyticsInsightsInput = {
  overview: {
    totalCustomers: number;
    activeCustomers: number;
    averageClv: number;
    repeatPurchaseRate: number;
    averageOrderValue: number;
    churnRate: number;
  };
  segments: Array<{
    key: string;
    label: string;
    count: number;
    averageClv: number;
  }>;
  channelPerformance: Array<{
    channel: string;
    revenue: number;
    sent: number;
    conversionRate: number;
    revenuePerMessage: number;
  }>;
};

export async function generateAnalyticsInsights(
  input: AnalyticsInsightsInput,
): Promise<{ insights: string[]; source: "anthropic" | "mock" }> {
  if (!anthropicClient) {
    const topSegment = [...input.segments].sort((a, b) => b.count - a.count)[0];
    const bestChannel = [...input.channelPerformance].sort(
      (a, b) => b.revenuePerMessage - a.revenuePerMessage,
    )[0];
    return {
      source: "mock",
      insights: [
        `Active customer coverage is ${Math.round(
          (input.overview.activeCustomers / Math.max(1, input.overview.totalCustomers)) * 100,
        )}%, with churn at ${input.overview.churnRate.toFixed(1)}%. Prioritize win-back for customers inactive over 90 days.`,
        topSegment
          ? `${topSegment.label} is currently your largest segment (${topSegment.count} customers, avg CLV $${topSegment.averageClv.toFixed(
              0,
            )}). Build segment-specific upsell journeys to preserve repeat rate.`
          : "RFM segmentation data is sparse. Recalculate customer scores to improve targeting.",
        bestChannel
          ? `${bestChannel.channel.toUpperCase()} is driving $${bestChannel.revenuePerMessage.toFixed(
              2,
            )} per message at ${bestChannel.conversionRate.toFixed(
              2,
            )}% conversion. Rebalance send volume toward this channel.`
          : "Channel attribution is limited; increase campaign send volume to improve statistical confidence.",
      ],
    };
  }

  const prompt = `You are an expert e-commerce retention strategist.
Analyze this performance snapshot and provide exactly 3 actionable insights.

Overview:
- Total customers: ${input.overview.totalCustomers}
- Active customers (90d): ${input.overview.activeCustomers}
- Average CLV: ${input.overview.averageClv}
- Repeat purchase rate: ${input.overview.repeatPurchaseRate}%
- Average order value: ${input.overview.averageOrderValue}
- Churn rate: ${input.overview.churnRate}%

Segments:
${input.segments
  .map((s) => `- ${s.label}: ${s.count} customers, avg CLV ${s.averageClv}`)
  .join("\n")}

Channel performance:
${input.channelPerformance
  .map(
    (c) =>
      `- ${c.channel}: revenue ${c.revenue}, sent ${c.sent}, conversion ${c.conversionRate}%, revenue/message ${c.revenuePerMessage}`,
  )
  .join("\n")}

Requirements:
- Output JSON only with this shape:
{ "insights": ["...", "...", "..."] }
- Each insight must include a concrete recommendation.
- Keep each insight under 45 words.`;

  const response = await anthropicClient.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 700,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content
    .map((part) => ("text" in part ? part.text : ""))
    .join("")
    .trim();

  try {
    const parsed = JSON.parse(raw) as { insights?: string[] };
    const insights = (parsed.insights ?? []).filter(Boolean).slice(0, 3);
    if (insights.length > 0) {
      return { insights, source: "anthropic" };
    }
  } catch {
    // Fallback below if model returns non-JSON.
  }

  return {
    source: "mock",
    insights: [
      "Recent retention performance is mixed. Prioritize high-risk, high-CLV cohorts with a staged win-back sequence.",
      "Channel economics indicate uneven efficiency. Shift budget and volume toward the best-performing conversion path.",
      "Segment growth patterns suggest reactivation pressure. Add urgency-based offers for at-risk and slipping loyal segments.",
    ],
  };
}
