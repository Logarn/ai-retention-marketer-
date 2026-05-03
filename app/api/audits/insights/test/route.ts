import { NextResponse } from "next/server";
import { z } from "zod";
import {
  collectAuditChartHints,
  createAuditInsight,
  createChartHint,
  rankAuditInsights,
  summarizeAuditInsights,
} from "@/lib/audits/insights";
import type {
  AuditCaveat,
  AuditEvidence,
  AuditInsightInput,
  AuditRecommendedAction,
} from "@/lib/audits/types";

export const runtime = "nodejs";

const sampleInsightSchema = z
  .object({
    id: z.string().trim().min(1).max(160).optional(),
    title: z.string().trim().min(1).max(240).optional(),
    summary: z.string().trim().min(1).max(1000).optional(),
    domain: z.string().trim().min(1).max(80).optional(),
    insightType: z.string().trim().min(1).max(80).optional(),
    severity: z.string().trim().min(1).max(80).optional(),
    confidence: z.string().trim().min(1).max(80).optional(),
    priorityScore: z.number().min(0).max(100).optional(),
    evidence: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
    caveats: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).max(20).optional(),
    recommendedActions: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).max(20).optional(),
    affectedEntities: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
    chartHints: z.array(z.record(z.string(), z.unknown())).max(12).optional(),
  })
  .passthrough();

const requestSchema = z
  .object({
    includeExamples: z.boolean().optional(),
    insights: z.array(sampleInsightSchema).max(20).optional(),
    sampleInputs: z.array(sampleInsightSchema).max(20).optional(),
  })
  .passthrough();

type SampleInsightInput = z.infer<typeof sampleInsightSchema>;

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function coerceEvidence(rows: Array<Record<string, unknown>> | undefined): AuditEvidence[] {
  return (rows ?? []).map((row, index) => ({
    id: asString(row.id) ?? `sample-evidence-${index + 1}`,
    type: asString(row.type) ?? "caveat",
    label: asString(row.label) ?? asString(row.title) ?? `Sample evidence ${index + 1}`,
    value: typeof row.value === "string" || typeof row.value === "number" || typeof row.value === "boolean"
      ? row.value
      : null,
    metricKey: asString(row.metricKey) ?? undefined,
    entityId: asString(row.entityId) ?? undefined,
    source: asString(row.source) ?? "sample_input",
    timeframe: asString(row.timeframe) ?? undefined,
    weight: asNumber(row.weight),
    description: asString(row.description) ?? undefined,
  })) as AuditEvidence[];
}

function coerceCaveats(rows: Array<string | Record<string, unknown>> | undefined): AuditCaveat[] {
  return (rows ?? []).map((row, index) => {
    if (typeof row === "string") return { message: row };
    return {
      message: asString(row.message) ?? asString(row.label) ?? `Sample caveat ${index + 1}`,
      evidenceType: asString(row.evidenceType) ?? undefined,
      severity: asString(row.severity) ?? undefined,
    } as AuditCaveat;
  });
}

function coerceActions(rows: Array<string | Record<string, unknown>> | undefined): AuditRecommendedAction[] {
  return (rows ?? []).map((row, index) => {
    if (typeof row === "string") {
      return {
        id: `sample-action-${index + 1}`,
        label: row.trim() || `Review sample action ${index + 1}`,
        actionType: "audit",
        priority: "medium",
      };
    }

    return {
      id: asString(row.id) ?? `sample-action-${index + 1}`,
      label: asString(row.label) ?? asString(row.title) ?? `Review sample action ${index + 1}`,
      description: asString(row.description) ?? undefined,
      actionType: asString(row.actionType) ?? undefined,
      owner: asString(row.owner) ?? undefined,
      priority: asString(row.priority) ?? undefined,
      estimatedImpact: asString(row.estimatedImpact) ?? undefined,
      requiresApproval: typeof row.requiresApproval === "boolean" ? row.requiresApproval : undefined,
    };
  }) as AuditRecommendedAction[];
}

function coerceSampleInsight(input: SampleInsightInput, index: number, createdAt: string): AuditInsightInput {
  return {
    id: input.id,
    title: input.title ?? `Sample audit insight ${index + 1}`,
    summary: input.summary ?? "Sample insight supplied to the audit framework test route.",
    domain: input.domain,
    insightType: input.insightType,
    severity: input.severity,
    confidence: input.confidence,
    priorityScore: input.priorityScore,
    evidence: coerceEvidence(input.evidence),
    caveats: coerceCaveats(input.caveats),
    recommendedActions: coerceActions(input.recommendedActions),
    affectedEntities: input.affectedEntities as AuditInsightInput["affectedEntities"],
    chartHints: input.chartHints as AuditInsightInput["chartHints"],
    createdAt,
  };
}

function exampleInsights(createdAt: string): AuditInsightInput[] {
  return [
    {
      id: "flow_build_checkout_abandon",
      title: "Build missing Checkout Abandon flow",
      summary: "Checkout recovery is a core lifecycle gap and should be built before deeper campaign expansion.",
      domain: "flow",
      insightType: "build",
      severity: "issue",
      confidence: "strong",
      evidence: [
        {
          type: "playbook",
          label: "Checkout Abandon is a core Worklin flow playbook.",
          source: "flow_playbooks",
          entityId: "checkout_abandon",
        },
        {
          type: "structure",
          label: "Flow detection did not find an active checkout recovery flow.",
          source: "flow_detection",
        },
      ],
      caveats: [
        {
          message: "Confirm Klaviyo trigger/filter permissions before implementation.",
          evidenceType: "caveat",
        },
      ],
      recommendedActions: [
        {
          label: "Draft a Checkout Abandon audit/build plan.",
          actionType: "build",
          owner: "retention",
          priority: "high",
          estimatedImpact: "Recover high-intent abandoned checkout revenue.",
          requiresApproval: true,
        },
      ],
      affectedEntities: [
        {
          id: "checkout_abandon",
          type: "playbook",
          name: "Checkout Abandon",
          source: "Worklin flow playbook",
        },
      ],
      chartHints: [
        createChartHint({
          type: "funnel",
          title: "Checkout recovery funnel",
          metricKeys: ["checkout_started", "message_sent", "click_rate", "conversion_value"],
          entityIds: ["checkout_abandon"],
          description: "Render checkout drop-off and recovery metrics once performance rows are available.",
        }),
      ],
      createdAt,
    },
    {
      id: "flow_fix_welcome_later_messages",
      title: "Fix Welcome flow later-message weakness",
      summary: "The Welcome flow appears to start clearly, but later messages need stronger proof, objection handling, and next-step clarity.",
      domain: "flow",
      insightType: "fix",
      severity: "warning",
      confidence: "directional",
      evidence: [
        {
          type: "structure",
          label: "Later sequence coverage is weaker than the Welcome Series playbook expectation.",
          source: "flow_detail_read",
          entityId: "welcome_series",
        },
        {
          type: "content",
          label: "Later messages should add product proof, education, and purchase confidence.",
          source: "playbook_review",
        },
      ],
      caveats: [
        {
          message: "Message-level performance should be checked before rewriting every email.",
          evidenceType: "performance",
        },
      ],
      recommendedActions: [
        {
          label: "Audit Welcome messages 2-5 against proof, objection, and CTA coverage.",
          actionType: "audit",
          owner: "lifecycle",
          priority: "high",
        },
      ],
      affectedEntities: [
        {
          id: "welcome_series",
          type: "flow",
          name: "Welcome Series",
          source: "Klaviyo flow detail",
        },
      ],
      chartHints: [
        createChartHint({
          type: "table",
          title: "Welcome message coverage",
          metricKeys: ["message_position", "proof_coverage", "cta_clarity", "click_rate"],
          entityIds: ["welcome_series"],
          description: "Render sequence-level content and performance checks in a compact table.",
        }),
      ],
      createdAt,
    },
    {
      id: "campaign_scale_faq_objection_handling",
      title: "Scale FAQ and objection-handling campaigns",
      summary: "FAQ and objection-handling campaigns are a repeatable education lane for prospects and hesitant buyers.",
      domain: "campaign",
      insightType: "scale",
      severity: "opportunity",
      confidence: "directional",
      evidence: [
        {
          type: "playbook",
          label: "No-discount education and product spotlight playbooks support objection-led campaign angles.",
          source: "campaign_playbooks",
        },
        {
          type: "content",
          label: "Audit principle: product truth should inform campaign truth before recommending offers.",
          source: "audit_framework",
        },
      ],
      caveats: [
        {
          message: "Prioritize products with verified product truth before scaling this lane broadly.",
          evidenceType: "product",
        },
      ],
      recommendedActions: [
        {
          label: "Plan a 2-3 campaign FAQ/objection sequence for a revenue anchor or hidden gem.",
          actionType: "scale",
          owner: "crm",
          priority: "medium",
        },
      ],
      affectedEntities: [
        {
          id: "no_discount_education",
          type: "playbook",
          name: "No-discount Education",
          source: "Worklin campaign playbook",
        },
      ],
      chartHints: [
        createChartHint({
          type: "bar",
          title: "Education campaign opportunity by angle",
          metricKeys: ["campaign_count", "click_rate", "revenue_per_recipient"],
          entityIds: ["no_discount_education", "product_spotlight"],
          description: "Compare education angles once campaign performance history is available.",
        }),
      ],
      createdAt,
    },
    {
      id: "flow_classify_customer_thank_you",
      title: "Classify unknown Customer Thank You flow",
      summary: "The Customer Thank You flow may be useful, duplicated, or stale; classify it before cleanup or expansion.",
      domain: "flow",
      insightType: "classify",
      severity: "unknown",
      confidence: "weak",
      evidence: [
        {
          type: "structure",
          label: "Unknown flow naming does not map cleanly to a core Worklin lifecycle playbook.",
          source: "flow_detection",
        },
        {
          type: "sample_size",
          label: "No message-level performance sample has been attached yet.",
          value: 0,
          source: "klaviyo_performance_read",
        },
      ],
      caveats: [
        {
          message: "Do not delete or rewrite until trigger, filters, and message intent are confirmed.",
          evidenceType: "caveat",
        },
      ],
      recommendedActions: [
        {
          label: "Classify trigger, audience, sequence role, and overlap with Post-Purchase.",
          actionType: "classify",
          owner: "lifecycle",
          priority: "medium",
        },
      ],
      affectedEntities: [
        {
          id: "customer_thank_you",
          type: "flow",
          name: "Customer Thank You",
          source: "Klaviyo flow detection",
        },
      ],
      chartHints: [
        createChartHint({
          type: "table",
          title: "Unknown flow classification queue",
          metricKeys: ["flow_status", "trigger_type", "message_count", "last_updated"],
          entityIds: ["customer_thank_you"],
          description: "Render manual classification state for unknown flows.",
        }),
      ],
      createdAt,
    },
    {
      id: "flow_cleanup_stale_unconfigured_drafts",
      title: "Clean up unconfigured stale draft flows",
      summary: "Unconfigured draft flows create review noise and should be cleaned up once confirmed stale.",
      domain: "lifecycle",
      insightType: "cleanup",
      severity: "warning",
      confidence: "strong",
      evidence: [
        {
          type: "structure",
          label: "Draft or inactive flows without meaningful triggers are not execution-ready.",
          source: "flow_planner",
        },
        {
          type: "caveat",
          label: "Cleanup should be manual until durable approval and action logging are in place.",
          source: "safety_rules",
        },
      ],
      caveats: [
        {
          message: "Cleanup is read-only guidance in this PR; no Klaviyo flows are modified.",
          evidenceType: "caveat",
        },
      ],
      recommendedActions: [
        {
          label: "Review stale drafts and mark keep, merge, or delete in the future action log.",
          actionType: "cleanup",
          owner: "ops",
          priority: "medium",
          requiresApproval: true,
        },
      ],
      affectedEntities: [
        {
          id: "unconfigured_draft_flows",
          type: "workflow",
          name: "Unconfigured stale draft flows",
          source: "Flow Planner",
        },
      ],
      chartHints: [
        createChartHint({
          type: "scorecard",
          title: "Draft flow cleanup load",
          metricKeys: ["stale_draft_count", "unconfigured_count", "last_updated_days"],
          entityIds: ["unconfigured_draft_flows"],
          description: "Show cleanup workload without adding live Klaviyo actions.",
        }),
      ],
      createdAt,
    },
    {
      id: "revenue_protect_recovery_flows",
      title: "Protect high-performing recovery flows",
      summary: "Recovery flows that are already performing should be monitored and protected from unnecessary rebuilds.",
      domain: "revenue",
      insightType: "protect",
      severity: "good",
      confidence: "strong",
      evidence: [
        {
          type: "performance",
          label: "Recovery flows are expected to be judged by conversion value and revenue per recipient.",
          source: "klaviyo_performance_read",
        },
        {
          type: "playbook",
          label: "Cart and checkout recovery are high-priority lifecycle placements.",
          source: "flow_playbooks",
        },
      ],
      caveats: [
        {
          message: "Protect status should be confirmed with current performance rows before locking creative.",
          evidenceType: "performance",
        },
      ],
      recommendedActions: [
        {
          label: "Monitor recovery performance and avoid replacing active winners without evidence.",
          actionType: "protect",
          owner: "retention",
          priority: "medium",
        },
      ],
      affectedEntities: [
        {
          id: "recovery_flows",
          type: "flow",
          name: "Cart and checkout recovery flows",
          source: "Worklin lifecycle audit",
        },
      ],
      chartHints: [
        createChartHint({
          type: "line",
          title: "Recovery revenue trend",
          metricKeys: ["conversion_value", "revenue_per_recipient", "conversion_rate"],
          entityIds: ["recovery_flows"],
          description: "Trend recovery flow health before recommending rebuilds.",
        }),
      ],
      createdAt,
    },
  ];
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid audit insight test request",
        issues: parsed.error.issues.map((issue) => {
          const path = issue.path.join(".");
          return path ? `${path}: ${issue.message}` : issue.message;
        }),
      },
      { status: 400 },
    );
  }

  try {
    const createdAt = new Date().toISOString();
    const includeExamples = parsed.data.includeExamples !== false;
    const sampleInputs = parsed.data.insights ?? parsed.data.sampleInputs ?? [];
    const exampleInputs = includeExamples ? exampleInsights(createdAt) : [];
    const sampleAuditInputs = sampleInputs.map((input, index) => coerceSampleInsight(input, index, createdAt));
    const insights = rankAuditInsights(
      [...exampleInputs, ...sampleAuditInputs].map((input) => createAuditInsight(input)),
    );
    const summary = summarizeAuditInsights(insights);

    return NextResponse.json({
      ok: true,
      insights,
      summary,
      chartHints: collectAuditChartHints(insights),
    });
  } catch (error) {
    console.error("POST /api/audits/insights/test failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate audit insight test response",
        insights: [],
        summary: summarizeAuditInsights([]),
        chartHints: [],
      },
      { status: 500 },
    );
  }
}
