import { NextResponse } from "next/server";
import {
  getKlaviyoAudienceConfig,
  KlaviyoAudienceApiError,
  listKlaviyoAudiences,
} from "@/lib/klaviyo-audiences";

export const runtime = "nodejs";

function parsePositiveInt(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

function parseBoolean(value: string | null) {
  if (!value) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function safeAudienceReadError(error: unknown) {
  if (error instanceof KlaviyoAudienceApiError) {
    const status = error.status === 400 || error.status === 401 || error.status === 403 ? 400 : 502;
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: status === 400
          ? "Klaviyo audience read is not available. Check lists/segments read scopes, request fields, and API key permissions."
          : "Failed to read Klaviyo audiences",
        klaviyoStatus: error.status,
        klaviyoErrors: error.errors,
        lists: [],
        segments: [],
        audiences: [],
        caveats: [
          "Klaviyo audience inventory could not be read; no Klaviyo objects were changed.",
        ],
      },
      { status },
    );
  }

  console.error("GET /api/klaviyo/audiences failed", error);
  return NextResponse.json(
    {
      ok: false,
      readOnly: true,
      error: "Failed to read Klaviyo audiences",
      lists: [],
      segments: [],
      audiences: [],
      caveats: [
        "Klaviyo audience inventory could not be read; no Klaviyo objects were changed.",
      ],
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const configResult = getKlaviyoAudienceConfig();
  if (!configResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Klaviyo audience read is not configured",
        missingConfig: configResult.missingConfig,
        lists: [],
        segments: [],
        audiences: [],
        caveats: [
          `Klaviyo audience read is not configured: ${configResult.missingConfig.join(", ")}.`,
        ],
      },
      { status: 400 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const result = await listKlaviyoAudiences(configResult.config, {
      limit: parsePositiveInt(searchParams.get("limit")),
      includeLists: parseBoolean(searchParams.get("includeLists")) ?? true,
      includeSegments: parseBoolean(searchParams.get("includeSegments")) ?? true,
    });

    return NextResponse.json(result);
  } catch (error) {
    return safeAudienceReadError(error);
  }
}
