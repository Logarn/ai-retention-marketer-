import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { exchangeShopifyCodeForToken, getShopifyAuthUrl } from "@/lib/shopify";
import { prisma } from "@/lib/prisma";

function getBaseUrl(request: NextRequest) {
  return process.env.NEXTAUTH_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");
    const shop = searchParams.get("shop");

    if (!code || !shop) {
      const state = crypto.randomUUID();
      await prisma.integrationState.upsert({
        where: { provider: "shopify_oauth_state" },
        update: { accessToken: state, updatedAt: new Date() },
        create: { provider: "shopify_oauth_state", accessToken: state },
      });
      const authUrl = `${getShopifyAuthUrl()}&state=${encodeURIComponent(state)}`;
      return NextResponse.redirect(authUrl);
    }

    const baseUrl = getBaseUrl(request);
    const storedState = await prisma.integrationState.findUnique({
      where: { provider: "shopify_oauth_state" },
    });
    const stateFromQuery = searchParams.get("state");
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
