import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverKlaviyoConversionMetrics } from "@/lib/klaviyo/metric-discovery";
import {
  getKlaviyoMetricConfig,
  KlaviyoMetricApiError,
} from "@/lib/klaviyo-metrics";

export const runtime = "nodejs";

const discoverySchema = z.object({
  limit: z.number().int().min(1).max(250).optional(),
}).optional();

function safeMetricDiscoveryError(error: unknown) {
  if (error instanceof KlaviyoMetricApiError) {
    const status = error.status === 400 || error.status === 401 || error.status === 403 ? 400 : 502;
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: status === 400
          ? "Klaviyo metric discovery is not available. Check metric read scopes, request fields, and API key permissions."
          : "Failed to discover Klaviyo metrics",
        klaviyoStatus: error.status,
        klaviyoErrors: error.errors,
        metrics: [],
        candidates: [],
        recommendedMetric: null,
        confidence: "none",
        caveats: [
          "Klaviyo metric discovery could not be completed; no Klaviyo objects or environment variables were changed.",
        ],
        nextSteps: [
          "Confirm the Klaviyo API key has metric read permissions, then rerun discovery.",
        ],
        generatedAt: new Date().toISOString(),
      },
      { status },
    );
  }

  console.error("POST /api/klaviyo/metrics/discover failed", error);
  return NextResponse.json(
    {
      ok: false,
      readOnly: true,
      error: "Failed to discover Klaviyo metrics",
      metrics: [],
      candidates: [],
      recommendedMetric: null,
      confidence: "none",
      caveats: [
        "Klaviyo metric discovery could not be completed; no Klaviyo objects or environment variables were changed.",
      ],
      nextSteps: [
        "Retry metric discovery after checking server logs for non-secret error details.",
      ],
      generatedAt: new Date().toISOString(),
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = discoverySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Invalid Klaviyo metric discovery request",
        details: parsed.error.flatten().fieldErrors,
        metrics: [],
        candidates: [],
        recommendedMetric: null,
        confidence: "none",
        caveats: [
          "Metric discovery request validation failed before any Klaviyo read was attempted.",
        ],
        nextSteps: [
          "Send an empty JSON body or a numeric limit between 1 and 250.",
        ],
        generatedAt: new Date().toISOString(),
      },
      { status: 400 },
    );
  }

  const configResult = getKlaviyoMetricConfig();
  if (!configResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Klaviyo metric discovery is not configured",
        missingConfig: configResult.missingConfig,
        metrics: [],
        candidates: [],
        recommendedMetric: null,
        confidence: "none",
        caveats: [
          `Klaviyo metric discovery is not configured: ${configResult.missingConfig.join(", ")}.`,
          "No environment variables were read back or changed.",
        ],
        nextSteps: [
          "Configure Klaviyo API read access on the server, then rerun discovery.",
        ],
        generatedAt: new Date().toISOString(),
      },
      { status: 400 },
    );
  }

  try {
    const result = await discoverKlaviyoConversionMetrics(configResult.config, parsed.data ?? {});
    return NextResponse.json(result);
  } catch (error) {
    return safeMetricDiscoveryError(error);
  }
}
