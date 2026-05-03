import { NextResponse } from "next/server";
import {
  getKlaviyoFlowDetail,
  getKlaviyoFlowConfig,
  KlaviyoFlowApiError,
  listKlaviyoFlows,
} from "@/lib/klaviyo-flows";

export const runtime = "nodejs";

function safeKlaviyoFlowError(error: unknown) {
  if (error instanceof KlaviyoFlowApiError) {
    const status = error.status === 401 || error.status === 403 ? 400 : 502;
    return NextResponse.json(
      {
        ok: false,
        error: status === 400
          ? "Klaviyo flows read is not available. Check API key permissions for flows:read."
          : "Failed to read Klaviyo flows",
        klaviyoStatus: error.status,
        klaviyoErrors: error.errors,
        flows: [],
      },
      { status },
    );
  }

  console.error("GET /api/klaviyo/flows failed", error);
  return NextResponse.json(
    {
      ok: false,
      error: "Failed to read Klaviyo flows",
      flows: [],
    },
    { status: 500 },
  );
}

function wantsDetails(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("includeDetails") === "true";
}

export async function GET(request: Request) {
  const configResult = getKlaviyoFlowConfig();
  if (!configResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Klaviyo flows read is not configured",
        missingConfig: configResult.missingConfig,
        flows: [],
      },
      { status: 400 },
    );
  }

  try {
    const flows = await listKlaviyoFlows(configResult.config);
    const includeDetails = wantsDetails(request);
    const outputFlows = [];

    if (includeDetails) {
      for (const flow of flows) {
        outputFlows.push(await getKlaviyoFlowDetail(configResult.config, flow.id));
      }
    }

    return NextResponse.json({
      ok: true,
      readOnly: true,
      includeDetails,
      count: outputFlows.length || flows.length,
      flows: includeDetails ? outputFlows : flows,
    });
  } catch (error) {
    return safeKlaviyoFlowError(error);
  }
}
