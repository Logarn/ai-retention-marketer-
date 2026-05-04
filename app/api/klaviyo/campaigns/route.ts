import { NextResponse } from "next/server";
import {
  getKlaviyoCampaignConfig,
  KlaviyoCampaignApiError,
  listKlaviyoCampaigns,
} from "@/lib/klaviyo-campaigns";

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

function safeCampaignReadError(error: unknown) {
  if (error instanceof KlaviyoCampaignApiError) {
    const status = error.status === 400 || error.status === 401 || error.status === 403 ? 400 : 502;
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: status === 400
          ? "Klaviyo campaign read is not available. Check campaign read scopes, request fields, and API key permissions."
          : "Failed to read Klaviyo campaigns",
        klaviyoStatus: error.status,
        klaviyoErrors: error.errors,
        campaigns: [],
        caveats: [],
      },
      { status },
    );
  }

  console.error("GET /api/klaviyo/campaigns failed", error);
  return NextResponse.json(
    {
      ok: false,
      readOnly: true,
      error: "Failed to read Klaviyo campaigns",
      campaigns: [],
      caveats: [],
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const configResult = getKlaviyoCampaignConfig();
  if (!configResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        error: "Klaviyo campaign read is not configured",
        missingConfig: configResult.missingConfig,
        campaigns: [],
        caveats: [],
      },
      { status: 400 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const result = await listKlaviyoCampaigns(configResult.config, {
      limit: parsePositiveInt(searchParams.get("limit")),
      includeDrafts: parseBoolean(searchParams.get("includeDrafts")) ?? true,
      includeMessages: parseBoolean(searchParams.get("includeMessages")) ?? true,
    });

    return NextResponse.json(result);
  } catch (error) {
    return safeCampaignReadError(error);
  }
}
