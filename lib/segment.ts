export type SegmentKey =
  | "champions"
  | "loyal_customers"
  | "potential_loyalists"
  | "at_risk"
  | "cant_lose_them"
  | "hibernating"
  | "new_customers";

type SegmentInput = {
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
};

export function assignSegment({
  recencyScore,
  frequencyScore,
  monetaryScore,
}: SegmentInput): SegmentKey {
  if (recencyScore === 5 && frequencyScore === 5 && monetaryScore === 5) return "champions";
  if (recencyScore >= 4 && frequencyScore >= 4 && monetaryScore >= 4) return "loyal_customers";
  if (
    recencyScore >= 4 &&
    recencyScore <= 5 &&
    frequencyScore >= 2 &&
    frequencyScore <= 3 &&
    monetaryScore >= 2 &&
    monetaryScore <= 3
  ) {
    return "potential_loyalists";
  }
  if (
    recencyScore >= 2 &&
    recencyScore <= 3 &&
    frequencyScore >= 3 &&
    frequencyScore <= 4 &&
    monetaryScore >= 3 &&
    monetaryScore <= 4
  ) {
    return "at_risk";
  }
  if (recencyScore >= 1 && recencyScore <= 2 && frequencyScore >= 4 && monetaryScore >= 4) {
    return "cant_lose_them";
  }
  if (
    recencyScore >= 1 &&
    recencyScore <= 2 &&
    frequencyScore >= 1 &&
    frequencyScore <= 2 &&
    monetaryScore >= 1 &&
    monetaryScore <= 2
  ) {
    return "hibernating";
  }
  if (recencyScore === 5 && frequencyScore === 1) return "new_customers";
  if (recencyScore >= 4) return "potential_loyalists";
  if (recencyScore <= 2) return "hibernating";
  return "at_risk";
}

export function quantileScore(value: number, sortedValues: number[], options?: { inverse?: boolean }) {
  if (!sortedValues.length) return 1;
  const values = [...sortedValues].sort((a, b) => a - b);
  const idx = values.findIndex((v) => value <= v);
  const position = idx === -1 ? values.length - 1 : idx;
  const percentile = (position + 1) / values.length;
  let score = 5;
  if (percentile <= 0.2) score = 1;
  else if (percentile <= 0.4) score = 2;
  else if (percentile <= 0.6) score = 3;
  else if (percentile <= 0.8) score = 4;
  else score = 5;
  return options?.inverse ? 6 - score : score;
}

export function calculateRfmScore(value: number, thresholds: number[], reverse = false) {
  const [t1, t2, t3, t4] = thresholds;
  let score = 5;
  if (value <= t1) score = 1;
  else if (value <= t2) score = 2;
  else if (value <= t3) score = 3;
  else if (value <= t4) score = 4;
  else score = 5;
  return reverse ? 6 - score : score;
}

export function pickSegmentFromScores(recency: number, frequency: number, monetary: number): SegmentKey {
  return assignSegment({ recencyScore: recency, frequencyScore: frequency, monetaryScore: monetary });
}

export function calculateChurnRisk(input: {
  daysSinceLastPurchase: number;
  frequencyTrend: number;
  engagementTrend: number;
  browseTrend: number;
}) {
  const daysComponent = Math.min(1, Math.max(0, input.daysSinceLastPurchase / 180)) * 0.4;
  const frequencyComponent = (1 - Math.min(1, Math.max(0, input.frequencyTrend))) * 0.25;
  const engagementComponent = (1 - Math.min(1, Math.max(0, input.engagementTrend))) * 0.2;
  const browseComponent = (1 - Math.min(1, Math.max(0, input.browseTrend))) * 0.15;
  return Math.round((daysComponent + frequencyComponent + engagementComponent + browseComponent) * 100);
}
