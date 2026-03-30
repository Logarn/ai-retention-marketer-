import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { exchangeShopifyCodeForToken, getShopifyAuthUrlWithBase } from "@/lib/shopify";
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
    console.log("[shopify-oauth] Incoming request", { url: request.url });
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");
    const shop = searchParams.get("shop");
    const baseUrl = getBaseUrl(request);

    if (!code || !shop) {
      const state = crypto.randomUUID();
      console.log("[shopify-oauth] Initiating OAuth", { baseUrl });
      await prisma.integrationState.upsert({
        where: { provider: "shopify_oauth_state" },
        update: { accessToken: state, updatedAt: new Date() },
        create: { provider: "shopify_oauth_state", accessToken: state },
      });
      const authUrl = getShopifyAuthUrlWithBase(baseUrl, state);
      console.log("[shopify-oauth] Redirecting to Shopify", { authUrl });
      return NextResponse.redirect(authUrl);
    }

    const storedState = await prisma.integrationState.findUnique({
      where: { provider: "shopify_oauth_state" },
    });
    const stateFromQuery = searchParams.get("state");
    if (!stateFromQuery || stateFromQuery !== storedState?.accessToken) {
      console.warn("[shopify-oauth] State mismatch", {
        stateFromQuery,
        storedState: storedState?.accessToken ? "present" : "missing",
      });
      return NextResponse.redirect(new URL("/dashboard?shopify=state_mismatch", baseUrl));
    }

    const accessToken = await exchangeShopifyCodeForToken(code);
    console.log("[shopify-oauth] Access token received", { shop });
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
    return NextResponse.json(
      { error: "Failed Shopify OAuth flow", detail: String(error) },
      { status: 500 },
    );
  }
}
