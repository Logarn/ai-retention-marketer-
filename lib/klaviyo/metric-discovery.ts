import {
  type KlaviyoMetric,
  type KlaviyoMetricConfig,
  listKlaviyoMetrics,
} from "@/lib/klaviyo-metrics";

export type KlaviyoMetricDiscoveryConfidence = "strong" | "directional" | "weak" | "none";

export type KlaviyoMetricCandidate = {
  metric: KlaviyoMetric;
  candidateType:
    | "placed_order"
    | "ordered_product"
    | "checkout_started"
    | "fulfilled_order"
    | "refunded_order"
    | "order_like";
  score: number;
  confidence: Exclude<KlaviyoMetricDiscoveryConfidence, "none">;
  recommendedFor: "primary_conversion" | "item_analysis" | "intent_signal" | "operations_context" | "refund_context";
  reasons: string[];
  caveats: string[];
};

export type RecommendedKlaviyoMetric = {
  id: string;
  name: string;
  integration: string | null;
  source: string | null;
  score: number;
  confidence: Exclude<KlaviyoMetricDiscoveryConfidence, "none">;
  reasons: string[];
  caveats: string[];
};

export type DiscoverKlaviyoMetricsOptions = {
  limit?: number;
};

export type KlaviyoMetricDiscoveryResult = {
  ok: true;
  readOnly: true;
  metrics: KlaviyoMetric[];
  candidates: KlaviyoMetricCandidate[];
  recommendedMetric: RecommendedKlaviyoMetric | null;
  confidence: KlaviyoMetricDiscoveryConfidence;
  caveats: string[];
  nextSteps: string[];
  generatedAt: string;
};

type PatternConfig = {
  type: KlaviyoMetricCandidate["candidateType"];
  names: string[];
  score: number;
  recommendedFor: KlaviyoMetricCandidate["recommendedFor"];
  reasons: string[];
  caveats: string[];
};

const TARGET_PATTERNS: PatternConfig[] = [
  {
    type: "placed_order",
    names: ["placed order", "order placed", "shopify placed order"],
    score: 100,
    recommendedFor: "primary_conversion",
    reasons: [
      "Placed Order is the standard Shopify revenue conversion event in Klaviyo.",
      "It represents completed purchase behavior, which matches Worklin campaign and flow revenue reporting.",
    ],
    caveats: [],
  },
  {
    type: "ordered_product",
    names: ["ordered product", "product ordered"],
    score: 84,
    recommendedFor: "item_analysis",
    reasons: [
      "Ordered Product is a strong commerce signal for item-level analysis.",
      "It can support product and replenishment insight when Placed Order is unavailable.",
    ],
    caveats: [
      "Ordered Product may count line items instead of orders; verify before using it as the primary conversion metric.",
    ],
  },
  {
    type: "checkout_started",
    names: ["checkout started", "started checkout", "checkout start"],
    score: 58,
    recommendedFor: "intent_signal",
    reasons: [
      "Checkout Started is useful for purchase-intent context and checkout abandonment analysis.",
    ],
    caveats: [
      "Checkout Started is not a completed purchase event and should not be used as the primary revenue conversion metric.",
    ],
  },
  {
    type: "fulfilled_order",
    names: ["fulfilled order", "order fulfilled", "fulfillment created"],
    score: 46,
    recommendedFor: "operations_context",
    reasons: [
      "Fulfilled Order can help post-purchase or delivery timing analysis.",
    ],
    caveats: [
      "Fulfilled Order is operational context, not the primary purchase conversion event.",
    ],
  },
  {
    type: "refunded_order",
    names: ["refunded order", "order refunded", "refund created"],
    score: 20,
    recommendedFor: "refund_context",
    reasons: [
      "Refunded Order is useful for negative revenue and customer experience context.",
    ],
    caveats: [
      "Refunded Order should never be selected as the positive conversion metric for revenue reporting.",
    ],
  },
];

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesPhrase(value: string, phrase: string) {
  return value === phrase || value.includes(phrase);
}

function commerceSourceScore(metric: KlaviyoMetric) {
  const sourceText = normalizeText([metric.integration, metric.source].filter(Boolean).join(" "));
  if (!sourceText) return 0;
  if (sourceText.includes("shopify")) return 10;
  if (sourceText.includes("commerce") || sourceText.includes("ecommerce")) return 7;
  if (sourceText.includes("magento") || sourceText.includes("bigcommerce") || sourceText.includes("woocommerce")) return 5;
  return 0;
}

function confidenceFromScore(score: number): Exclude<KlaviyoMetricDiscoveryConfidence, "none"> {
  if (score >= 90) return "strong";
  if (score >= 55) return "directional";
  return "weak";
}

function primaryPatternForMetric(metric: KlaviyoMetric) {
  const normalizedName = normalizeText(metric.name);

  for (const pattern of TARGET_PATTERNS) {
    if (pattern.names.some((name) => includesPhrase(normalizedName, name))) {
      return pattern;
    }
  }

  if (normalizedName.includes("order") && !normalizedName.includes("refund") && !normalizedName.includes("fulfill")) {
    return {
      type: "order_like",
      names: ["order"],
      score: 38,
      recommendedFor: "primary_conversion",
      reasons: [
        "The metric name contains order language, but it does not exactly match a known Klaviyo purchase metric.",
      ],
      caveats: [
        "Verify this metric in Klaviyo before using it for conversion reporting.",
      ],
    } satisfies PatternConfig;
  }

  return null;
}

function candidateForMetric(metric: KlaviyoMetric): KlaviyoMetricCandidate | null {
  const pattern = primaryPatternForMetric(metric);
  if (!pattern) return null;

  const sourceScore = commerceSourceScore(metric);
  const exactName = TARGET_PATTERNS.some((target) => target.names[0] === normalizeText(metric.name));
  const score = Math.min(100, pattern.score + sourceScore + (exactName ? 4 : 0));
  const reasons = [...pattern.reasons];

  if (sourceScore) {
    reasons.push(`Metric source appears commerce-related${metric.integration ? ` (${metric.integration})` : ""}.`);
  }

  return {
    metric,
    candidateType: pattern.type,
    score,
    confidence: confidenceFromScore(score),
    recommendedFor: pattern.recommendedFor,
    reasons,
    caveats: pattern.caveats,
  };
}

function rankCandidates(metrics: KlaviyoMetric[]) {
  return metrics
    .map((metric) => candidateForMetric(metric))
    .filter((candidate): candidate is KlaviyoMetricCandidate => Boolean(candidate))
    .sort((a, b) =>
      b.score - a.score ||
      a.metric.name.localeCompare(b.metric.name) ||
      a.metric.id.localeCompare(b.metric.id),
    );
}

function recommendedFromCandidates(candidates: KlaviyoMetricCandidate[]): RecommendedKlaviyoMetric | null {
  const recommended = candidates.find((candidate) =>
    candidate.recommendedFor === "primary_conversion" &&
    candidate.candidateType !== "order_like" &&
    candidate.score >= 70,
  ) ?? candidates.find((candidate) =>
    candidate.candidateType === "order_like" &&
    candidate.score >= 45,
  );

  if (!recommended) return null;

  return {
    id: recommended.metric.id,
    name: recommended.metric.name,
    integration: recommended.metric.integration,
    source: recommended.metric.source,
    score: recommended.score,
    confidence: recommended.confidence,
    reasons: recommended.reasons,
    caveats: recommended.caveats,
  };
}

function discoveryCaveats(input: {
  metrics: KlaviyoMetric[];
  candidates: KlaviyoMetricCandidate[];
  recommendedMetric: RecommendedKlaviyoMetric | null;
  sourceCaveats: string[];
}) {
  const caveats = [...input.sourceCaveats];

  if (!input.metrics.length) {
    caveats.push("No Klaviyo metric inventory was available, so Worklin could not recommend a conversion metric.");
  } else if (!input.candidates.length) {
    caveats.push("Klaviyo metrics were readable, but no likely commerce conversion metrics were detected by name.");
  }

  const orderedProduct = input.candidates.find((candidate) => candidate.candidateType === "ordered_product");
  const placedOrder = input.candidates.find((candidate) => candidate.candidateType === "placed_order");
  if (orderedProduct && !placedOrder) {
    caveats.push("Ordered Product was detected without Placed Order; item-level metrics may not be safe for revenue conversion reporting.");
  }

  if (!input.recommendedMetric) {
    caveats.push("No metric has been selected or written to environment configuration in this read-only discovery step.");
  }

  return Array.from(new Set(caveats));
}

function nextSteps(input: {
  recommendedMetric: RecommendedKlaviyoMetric | null;
  metrics: KlaviyoMetric[];
  candidates: KlaviyoMetricCandidate[];
}) {
  if (!input.metrics.length) {
    return [
      "Confirm the Klaviyo API key has metric read permissions.",
      "Confirm Shopify or ecommerce events are syncing into Klaviyo.",
      "Rerun metric discovery after Klaviyo metrics are readable.",
    ];
  }

  if (!input.recommendedMetric) {
    return [
      "Review Klaviyo Analytics > Metrics and confirm the exact completed-purchase metric name.",
      "Prefer Placed Order for primary revenue conversion reporting when available.",
      "Provide a conversionMetricId explicitly to performance reads until a safe recommendation exists.",
    ];
  }

  return [
    `Review recommended metric "${input.recommendedMetric.name}" (${input.recommendedMetric.id}) before using it for performance reports.`,
    "Use the recommended metric id in performance reads or future settings after approval.",
    "Do not use Checkout Started, Fulfilled Order, or Refunded Order as the primary positive revenue conversion metric.",
  ];
}

export async function discoverKlaviyoConversionMetrics(
  config: KlaviyoMetricConfig,
  options: DiscoverKlaviyoMetricsOptions = {},
): Promise<KlaviyoMetricDiscoveryResult> {
  const metricResult = await listKlaviyoMetrics(config, options);
  const candidates = rankCandidates(metricResult.metrics);
  const recommendedMetric = recommendedFromCandidates(candidates);

  return {
    ok: true,
    readOnly: true,
    metrics: metricResult.metrics,
    candidates,
    recommendedMetric,
    confidence: recommendedMetric?.confidence ?? "none",
    caveats: discoveryCaveats({
      metrics: metricResult.metrics,
      candidates,
      recommendedMetric,
      sourceCaveats: metricResult.caveats,
    }),
    nextSteps: nextSteps({
      recommendedMetric,
      metrics: metricResult.metrics,
      candidates,
    }),
    generatedAt: new Date().toISOString(),
  };
}
