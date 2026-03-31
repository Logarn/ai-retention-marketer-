import { NextRequest, NextResponse } from "next/server";
import { getShopifyAuthUrlWithBase, getShopifyBaseResolution } from "@/lib/shopify";

export async function GET(request: NextRequest) {
  try {
    const resolution = getShopifyBaseResolution(request);
    const authUrl = getShopifyAuthUrlWithBase(resolution.baseUrl, "diagnostics-state");
    const parsedAuthUrl = new URL(authUrl);
    const redirectUri = parsedAuthUrl.searchParams.get("redirect_uri");
    const shop = parsedAuthUrl.searchParams.get("shop");
    const scope = parsedAuthUrl.searchParams.get("scope");
    const clientId = parsedAuthUrl.searchParams.get("client_id");

    return NextResponse.json({
      ok: true,
      runtime: {
        requestUrl: request.url,
        requestOrigin: resolution.requestOrigin,
        requestHost: resolution.requestHost,
        baseUrlUsed: resolution.baseUrl,
        source: resolution.source,
      },
      env: {
        NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? null,
        SHOPIFY_STORE_NAME: process.env.SHOPIFY_STORE_NAME ?? null,
        hasClientId: Boolean(process.env.SHOPIFY_CLIENT_ID),
        hasClientSecret: Boolean(process.env.SHOPIFY_CLIENT_SECRET),
      },
      oauth: {
        clientId,
        shop,
        scope,
        redirectUri,
        callbackPath: "/api/auth/shopify/callback",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to compute Shopify diagnostics",
        detail: String(error),
      },
      { status: 500 },
    );
  }
}
