import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncShopifyData, syncShopifyDataDirectCredentials } from "@/lib/shopify";

function sanitizeShopifyErrorMessage(message: string) {
  return (
    message
      // Redact credential-in-URL patterns if any lower layer leaks them.
      .replace(/https?:\/\/[^/\s:@]+:[^@\s]+@/gi, "https://[REDACTED]@")
      // Redact basic auth blobs if surfaced.
      .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]")
  );
}

export async function POST() {
  try {
    console.log("[shopify-sync] POST /api/shopify/sync started");
    const state = await prisma.integrationState.findUnique({
      where: { provider: "shopify" },
    });
    const token = state?.accessToken || process.env.SHOPIFY_ACCESS_TOKEN;
    console.log("[shopify-sync] token availability", {
      hasStateToken: Boolean(state?.accessToken),
      hasEnvToken: Boolean(process.env.SHOPIFY_ACCESS_TOKEN),
      connected: state?.connected ?? false,
    });
    const useDirectCredentials = !token;
    if (useDirectCredentials) {
      console.log("[shopify-sync] no OAuth/access token found, using direct credentials mode");
    }

    await prisma.integrationState.upsert({
      where: { provider: "shopify" },
      create: {
        provider: "shopify",
        connected: true,
        accessToken: token ?? null,
        syncInProgress: true,
        lastSyncStatus: "in_progress",
        lastSyncMessage: useDirectCredentials
          ? "Sync started (direct credentials mode)"
          : "Sync started",
      },
      update: {
        connected: true,
        accessToken: token ?? undefined,
        syncInProgress: true,
        lastSyncStatus: "in_progress",
        lastSyncMessage: useDirectCredentials
          ? "Sync started (direct credentials mode)"
          : "Sync started",
      },
    });

    const result = useDirectCredentials
      ? await syncShopifyDataDirectCredentials()
      : await syncShopifyData(token);
    console.log("[shopify-sync] sync completed", result);

    await prisma.integrationState.update({
      where: { provider: "shopify" },
      data: {
        syncInProgress: false,
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        lastSyncMessage: `Synced ${result.customersUpserted} customers, ${result.ordersUpserted} orders, ${result.productsUpserted} products${
          useDirectCredentials ? " (direct credentials mode)" : ""
        }`,
      },
    });

    return NextResponse.json({
      ok: true,
      summary: {
        customers: result.customersUpserted,
        orders: result.ordersUpserted,
        products: result.productsUpserted,
      },
      source: useDirectCredentials ? "shopify_direct_credentials" : "shopify_sync",
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown sync error";
    const message = sanitizeShopifyErrorMessage(rawMessage);
    console.error("[shopify-sync] sync failed", error);
    await prisma.integrationState.upsert({
      where: { provider: "shopify" },
      create: {
        provider: "shopify",
        connected: false,
        syncInProgress: false,
        lastSyncStatus: "error",
        lastSyncMessage: message,
      },
      update: {
        syncInProgress: false,
        lastSyncStatus: "error",
        lastSyncMessage: message,
      },
    });
    return NextResponse.json(
      {
        error: "Shopify sync failed",
        detail: message,
        debug: {
          hasStore: Boolean(process.env.SHOPIFY_STORE_NAME),
          hasClientId: Boolean(process.env.SHOPIFY_CLIENT_ID),
          hasClientSecret: Boolean(process.env.SHOPIFY_CLIENT_SECRET),
          hasAccessToken: Boolean(process.env.SHOPIFY_ACCESS_TOKEN),
        },
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const state = await prisma.integrationState.findUnique({
      where: { provider: "shopify" },
    });
    return NextResponse.json({
      status: state?.lastSyncStatus ?? "idle",
      connected: state?.connected ?? false,
      syncInProgress: state?.syncInProgress ?? false,
      lastSyncAt: state?.lastSyncAt ?? null,
      message: state?.lastSyncMessage ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load Shopify integration state", detail: String(error) },
      { status: 500 },
    );
  }
}
