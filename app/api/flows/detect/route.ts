import { NextResponse } from "next/server";
import { detectExistingFlows } from "@/lib/flows/detect-existing-flows";
import {
  getKlaviyoFlowConfig,
  KlaviyoFlowApiError,
  listKlaviyoFlows,
} from "@/lib/klaviyo-flows";

export const runtime = "nodejs";

function safeFlowDetectionError(error: unknown) {
  if (error instanceof KlaviyoFlowApiError) {
    const status = error.status === 401 || error.status === 403 ? 400 : 502;
    return NextResponse.json(
      {
        ok: false,
        error: status === 400
          ? "Klaviyo flows read is not available. Check API key permissions for flows:read."
          : "Failed to detect Klaviyo flows",
        klaviyoStatus: error.status,
        klaviyoErrors: error.errors,
      },
      { status },
    );
  }

  console.error("POST /api/flows/detect failed", error);
  return NextResponse.json(
    {
      ok: false,
      error: "Failed to detect Klaviyo flows",
    },
    { status: 500 },
  );
}

export async function POST() {
  const configResult = getKlaviyoFlowConfig();
  if (!configResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Klaviyo flows read is not configured",
        missingConfig: configResult.missingConfig,
      },
      { status: 400 },
    );
  }

  try {
    const flows = await listKlaviyoFlows(configResult.config);
    const detection = detectExistingFlows(flows);

    return NextResponse.json({
      ok: true,
      readOnly: true,
      ...detection,
    });
  } catch (error) {
    return safeFlowDetectionError(error);
  }
}
