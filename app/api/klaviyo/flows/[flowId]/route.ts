import { NextResponse } from "next/server";
import {
  getKlaviyoFlowConfig,
  getKlaviyoFlowDetail,
  KlaviyoFlowApiError,
} from "@/lib/klaviyo-flows";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ flowId: string }>;
};

function safeKlaviyoFlowDetailError(error: unknown) {
  if (error instanceof KlaviyoFlowApiError) {
    if (error.status === 404) {
      return NextResponse.json(
        {
          ok: false,
          error: "Klaviyo flow not found",
        },
        { status: 404 },
      );
    }

    const status = error.status === 400 || error.status === 401 || error.status === 403 ? 400 : 502;
    return NextResponse.json(
      {
        ok: false,
        error: error.status === 400
          ? "Invalid Klaviyo flow detail request."
          : status === 400
            ? "Klaviyo flows read is not available. Check API key permissions for flows:read."
            : "Failed to read Klaviyo flow detail",
        klaviyoStatus: error.status,
        klaviyoErrors: error.errors,
      },
      { status },
    );
  }

  console.error("GET /api/klaviyo/flows/[flowId] failed", error);
  return NextResponse.json(
    {
      ok: false,
      error: "Failed to read Klaviyo flow detail",
    },
    { status: 500 },
  );
}

export async function GET(_: Request, context: RouteContext) {
  const { flowId } = await context.params;
  const cleanedFlowId = flowId?.trim();

  if (!cleanedFlowId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Klaviyo flow id is required",
      },
      { status: 400 },
    );
  }

  if (!/^[A-Za-z0-9]+$/.test(cleanedFlowId)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid Klaviyo flow id",
      },
      { status: 400 },
    );
  }

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
    const flow = await getKlaviyoFlowDetail(configResult.config, cleanedFlowId);

    return NextResponse.json({
      ok: true,
      readOnly: true,
      flow,
    });
  } catch (error) {
    return safeKlaviyoFlowDetailError(error);
  }
}
