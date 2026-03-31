import { NextRequest, NextResponse } from "next/server";
import { exchangeShopifyCodeForToken, resolveShopifyBaseUrlFromRequest } from "@/lib/shopify";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    console.log("[shopify-oauth-callback] Incoming request", { url: request.url });
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
      console.warn("[shopify-oauth-callback] State mismatch", {
        hasStateFromQuery: Boolean(stateFromQuery),
        hasStoredState: Boolean(storedState?.accessToken),
      });
      return NextResponse.redirect(new URL("/dashboard?shopify=state_mismatch", baseUrl));
    }

    const accessToken = await exchangeShopifyCodeForToken(code);
    console.log("[shopify-oauth-callback] Access token received", { shop });

    await prisma.integrationState.upsert({
      where: { provider: "shopify" },
      update: {
        accessToken,
        connected: true,
        lastSyncStatus: "connected",
        lastSyncMessage: `Connected to ${shop}`,
        updatedAt: new Date(),
      },
      create: {
        provider: "shopify",
        accessToken,
        connected: true,
        lastSyncStatus: "connected",
        lastSyncMessage: `Connected to ${shop}`,
      },
    });

    return NextResponse.redirect(new URL("/dashboard?shopify=connected", baseUrl));
  } catch (error) {
    console.error("[shopify-oauth-callback] Failed Shopify OAuth callback", error);
    return NextResponse.json(
      { error: "Failed Shopify OAuth callback", detail: String(error) },
      { status: 500 },
    );
  }
}
