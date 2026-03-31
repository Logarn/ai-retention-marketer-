import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getShopifyAuthUrlWithBase, resolveShopifyBaseUrlFromRequest } from "@/lib/shopify";

export async function GET(request: NextRequest) {
  try {
    const baseUrl = resolveShopifyBaseUrlFromRequest(request);
    const state = crypto.randomUUID();

    await prisma.integrationState.upsert({
      where: { provider: "shopify_oauth_state" },
      update: {
        accessToken: state,
      },
      create: {
        provider: "shopify_oauth_state",
        accessToken: state,
      },
    });

    const authUrl = getShopifyAuthUrlWithBase(baseUrl, state);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to initiate Shopify OAuth flow",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
