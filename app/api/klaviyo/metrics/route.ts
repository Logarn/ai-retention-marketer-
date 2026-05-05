import { NextResponse } from "next/server";
import {
  getKlaviyoMetricConfig,
  KlaviyoMetricApiError,
  listKlaviyoMetrics,
} from "@/lib/klaviyo-metrics";

export const runtime = "nodejs";

function parsePositiveInt(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

function safeMetricReadError(error: unknown) {
  if (error instanceof KlaviyoMetricApiError) {
    const status = error.status === 400 || error.status === 401 || error.status === 403 ? 400 : 502;
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: status === 400
          ? "Klaviyo metric read is not available. Check metric read scopes, request fields, and API key permissions."
          : "Failed to read Klaviyo metrics",
        klaviyoStatus: error.status,
        klaviyoErrors: error.errors,
        metrics: [],
        caveats: [
          "Klaviyo metric inventory could not be read; no Klaviyo objects were changed.",
        ],
      },
      { status },
    );
  }

  console.error("GET /api/klaviyo/metrics failed", error);
  return NextResponse.json(
    {
      ok: false,
      readOnly: true,
      error: "Failed to read Klaviyo metrics",
      metrics: [],
      caveats: [
        "Klaviyo metric inventory could not be read; no Klaviyo objects were changed.",
      ],
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const configResult = getKlaviyoMetricConfig();
  if (!configResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Klaviyo metric read is not configured",
        missingConfig: configResult.missingConfig,
        metrics: [],
        caveats: [
          `Klaviyo metric read is not configured: ${configResult.missingConfig.join(", ")}.`,
        ],
      },
      { status: 400 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const result = await listKlaviyoMetrics(configResult.config, {
      limit: parsePositiveInt(searchParams.get("limit")),
    });

    return NextResponse.json(result);
  } catch (error) {
    return safeMetricReadError(error);
  }
}
