import { NextRequest, NextResponse } from "next/server";
import { getShopifyAuthUrlWithBase, resolveOAuthBaseUrl } from "@/lib/shopify";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    console.log("[shopify-oauth] Initiate request", { url: request.url });
    const baseUrl = resolveOAuthBaseUrl(request);
    const state = crypto.randomUUID();
    await prisma.integrationState.upsert({
      where: { provider: "shopify_oauth_state" },
      update: { accessToken: state, updatedAt: new Date() },
      create: { provider: "shopify_oauth_state", accessToken: state },
    });
    const authUrl = getShopifyAuthUrlWithBase(baseUrl, state);
    console.log("[shopify-oauth] Redirecting to Shopify", { authUrl });
    return NextResponse.redirect(authUrl);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to initiate Shopify OAuth flow", detail: String(error) },
      { status: 500 },
    );
  }
}
