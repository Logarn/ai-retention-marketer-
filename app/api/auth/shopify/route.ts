import { NextRequest, NextResponse } from "next/server";
import { getShopifyAuthUrlWithBase } from "@/lib/shopify";
import { prisma } from "@/lib/prisma";

function getBaseUrl(request: NextRequest) {
  const configured = process.env.NEXTAUTH_URL;
  if (configured) return configured;
  // 0.0.0.0 is not a browser-reachable callback host for OAuth providers.
  const host = request.nextUrl.host.replace(/^0\.0\.0\.0(?=:\d+|$)/, "localhost");
  return `${request.nextUrl.protocol}//${host}`;
}

export async function GET(request: NextRequest) {
  try {
    console.log("[shopify-oauth] Initiate request", { url: request.url });
    const baseUrl = getBaseUrl(request);
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
