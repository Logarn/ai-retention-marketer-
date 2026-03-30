export const RFM_SEGMENTS = [
  "champions",
  "loyal_customers",
  "potential_loyalists",
  "at_risk",
  "cant_lose_them",
  "hibernating",
  "new_customers",
] as const;

export const SEGMENT_DEFINITIONS = [
  {
    key: "champions",
    label: "Champions",
    color: "#16a34a",
    recommendedAction: "Reward loyalty with early access and VIP perks.",
  },
  {
    key: "loyal_customers",
    label: "Loyal Customers",
    color: "#22c55e",
    recommendedAction: "Upsell bundles and referral campaigns.",
  },
  {
    key: "potential_loyalists",
    label: "Potential Loyalists",
    color: "#84cc16",
    recommendedAction: "Nudge second and third purchase with social proof.",
  },
  {
    key: "at_risk",
    label: "At Risk",
    color: "#f59e0b",
    recommendedAction: "Launch win-back with urgency and dynamic discounts.",
  },
  {
    key: "cant_lose_them",
    label: "Can't Lose Them",
    color: "#f97316",
    recommendedAction: "Use concierge outreach and premium retention offers.",
  },
  {
    key: "hibernating",
    label: "Hibernating",
    color: "#6b7280",
    recommendedAction: "Run low-cost reactivation and list hygiene campaigns.",
  },
  {
    key: "new_customers",
    label: "New Customers",
    color: "#3b82f6",
    recommendedAction: "Guide onboarding and recommend complementary products.",
  },
] as const;

export const SEGMENT_LABELS: Record<string, string> = Object.fromEntries(
  SEGMENT_DEFINITIONS.map((item) => [item.key, item.label]),
);
SEGMENT_LABELS.unclassified = "Unclassified";
SEGMENT_LABELS.unknown = "Unknown";

export const SEGMENT_ACTIONS: Record<string, string> = Object.fromEntries(
  SEGMENT_DEFINITIONS.map((item) => [item.key, item.recommendedAction]),
);
SEGMENT_ACTIONS.unclassified = "Collect more behavior data before targeting.";
SEGMENT_ACTIONS.unknown = "Collect more behavior data before targeting.";

export const CHURN_WEIGHTS = {
  daysSinceLastPurchase: 0.4,
  frequencyTrend: 0.25,
  emailEngagement: 0.2,
  browseActivity: 0.15,
} as const;

export const FLOW_TEMPLATES = [
  {
    name: "Post-Purchase Nurture Flow",
    nodes: [
      { id: "trigger", type: "trigger", label: "Order delivered" },
      { id: "wait-2d", type: "wait", label: "Wait 2 days" },
      { id: "email-1", type: "email", label: "How to get the most from your product" },
      { id: "wait-7d", type: "wait", label: "Wait 7 days" },
      { id: "email-2", type: "email", label: "Customers also loved..." },
      { id: "wait-14d", type: "wait", label: "Wait 14 days" },
      { id: "sms-1", type: "sms", label: "Free shipping reminder" },
    ],
    edges: [
      { from: "trigger", to: "wait-2d" },
      { from: "wait-2d", to: "email-1" },
      { from: "email-1", to: "wait-7d" },
      { from: "wait-7d", to: "email-2" },
      { from: "email-2", to: "wait-14d" },
      { from: "wait-14d", to: "sms-1" },
    ],
  },
  {
    name: "Win-Back Flow",
    nodes: [
      { id: "trigger", type: "trigger", label: "No purchase in 60 days" },
      { id: "email-1", type: "email", label: "We miss you + 10% off" },
      { id: "wait-5d", type: "wait", label: "Wait 5 days if no purchase" },
      { id: "sms-1", type: "sms", label: "10% expires tomorrow" },
      { id: "wait-7d", type: "wait", label: "Wait 7 days if no purchase" },
      { id: "email-2", type: "email", label: "Last chance 15% off" },
    ],
    edges: [
      { from: "trigger", to: "email-1" },
      { from: "email-1", to: "wait-5d" },
      { from: "wait-5d", to: "sms-1" },
      { from: "sms-1", to: "wait-7d" },
      { from: "wait-7d", to: "email-2" },
    ],
  },
  {
    name: "Replenishment Flow",
    nodes: [
      { id: "trigger", type: "trigger", label: "Predicted reorder date - 7 days" },
      { id: "email-1", type: "email", label: "Time to restock?" },
      { id: "wait-3d", type: "wait", label: "Wait 3 days if no purchase" },
      { id: "sms-1", type: "sms", label: "Running low reminder" },
    ],
    edges: [
      { from: "trigger", to: "email-1" },
      { from: "email-1", to: "wait-3d" },
      { from: "wait-3d", to: "sms-1" },
    ],
  },
  {
    name: "Browse Abandonment Flow",
    nodes: [
      { id: "trigger", type: "trigger", label: "Viewed product 2+ times no purchase in 24h" },
      { id: "wait-1h", type: "wait", label: "Wait 1 hour" },
      { id: "email-1", type: "email", label: "Still thinking about it?" },
      { id: "wait-24h", type: "wait", label: "Wait 24 hours if no purchase" },
      { id: "sms-1", type: "sms", label: "Product is still in stock" },
    ],
    edges: [
      { from: "trigger", to: "wait-1h" },
      { from: "wait-1h", to: "email-1" },
      { from: "email-1", to: "wait-24h" },
      { from: "wait-24h", to: "sms-1" },
    ],
  },
  {
    name: "VIP Appreciation Flow",
    nodes: [
      { id: "trigger", type: "trigger", label: "Customer crosses $500 lifetime spend" },
      { id: "email-1", type: "email", label: "You're officially VIP" },
      { id: "wait-30d", type: "wait", label: "Wait 30 days" },
      { id: "email-2", type: "email", label: "VIP early access" },
    ],
    edges: [
      { from: "trigger", to: "email-1" },
      { from: "email-1", to: "wait-30d" },
      { from: "wait-30d", to: "email-2" },
    ],
  },
] as const;

export function getSegmentMeta(key: string) {
  return (
    SEGMENT_DEFINITIONS.find((item) => item.key === key) ?? {
      key: "unknown",
      label: "Unknown",
      color: "#94a3b8",
      recommendedAction: "Collect more behavior data before targeting.",
    }
  );
}
