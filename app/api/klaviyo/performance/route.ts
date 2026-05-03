import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getKlaviyoPerformanceConfig,
  KlaviyoPerformanceApiError,
  queryKlaviyoPerformance,
} from "@/lib/klaviyo-performance";

export const runtime = "nodejs";

const performanceSchema = z.object({
  type: z.enum(["flow", "campaign", "segment"]),
  timeframe: z.enum(["last_30_days", "last_90_days", "last_365_days", "lifetime", "custom"]),
  startDate: z.string().trim().min(1).optional(),
  endDate: z.string().trim().min(1).optional(),
  ids: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  statistics: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  conversionMetricId: z.string().trim().min(1).max(120).optional(),
});

function safeKlaviyoPerformanceError(error: unknown) {
  if (error instanceof KlaviyoPerformanceApiError) {
    const status = error.status === 400 || error.status === 401 || error.status === 403 ? 400 : 502;
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: status === 400
          ? "Klaviyo performance read is not available. Check request fields, conversion metric, and API key permissions for reporting reads."
          : "Failed to read Klaviyo performance",
        klaviyoStatus: error.status,
        klaviyoErrors: error.errors,
        rows: [],
      },
      { status },
    );
  }

  console.error("POST /api/klaviyo/performance failed", error);
  return NextResponse.json(
    {
      ok: false,
      readOnly: true,
      error: "Failed to read Klaviyo performance",
      rows: [],
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = performanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Invalid Klaviyo performance request",
        details: parsed.error.flatten().fieldErrors,
        rows: [],
      },
      { status: 400 },
    );
  }

  const configResult = getKlaviyoPerformanceConfig();
  if (!configResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Klaviyo performance read is not configured",
        missingConfig: configResult.missingConfig,
        rows: [],
      },
      { status: 400 },
    );
  }

  try {
    const result = await queryKlaviyoPerformance(configResult.config, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return safeKlaviyoPerformanceError(error);
  }
}
