import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeShopifyCodeForToken, resolveShopifyBaseUrlFromRequest } from "@/lib/shopify";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");
    const shop = searchParams.get("shop");
    const stateFromQuery = searchParams.get("state");
    const baseUrl = resolveShopifyBaseUrlFromRequest(request);

    if (!code || !shop) {
      return NextResponse.redirect(new URL("/dashboard?shopify=missing_code", baseUrl));
    }

    const storedState = await prisma.integrationState.findUnique({
      where: { provider: "shopify_oauth_state" },
    });
    if (!stateFromQuery || stateFromQuery !== storedState?.accessToken) {
      return NextResponse.redirect(new URL("/dashboard?shopify=state_mismatch", baseUrl));
    }

    const accessToken = await exchangeShopifyCodeForToken(code);
    await prisma.integrationState.upsert({
      where: { provider: "shopify" },
      update: {
        accessToken,
        connected: true,
        lastSyncStatus: "connected",
        lastSyncMessage: `Connected to ${shop}`,
        syncInProgress: false,
      },
      create: {
        provider: "shopify",
        accessToken,
        connected: true,
        lastSyncStatus: "connected",
        lastSyncMessage: `Connected to ${shop}`,
        syncInProgress: false,
      },
    });

    return NextResponse.redirect(new URL("/dashboard?shopify=connected", baseUrl));
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed Shopify OAuth callback",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
