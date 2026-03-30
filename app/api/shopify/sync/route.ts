import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncShopifyData } from "@/lib/shopify";

export async function POST() {
  try {
    const state = await prisma.integrationState.findUnique({
      where: { provider: "shopify" },
    });
    const token = state?.accessToken || process.env.SHOPIFY_ACCESS_TOKEN;
    if (!token) {
      throw new Error("No Shopify access token available. Use Connect Shopify first.");
    }

    await prisma.integrationState.upsert({
      where: { provider: "shopify" },
      create: {
        provider: "shopify",
        connected: true,
        accessToken: token,
        syncInProgress: true,
        lastSyncStatus: "in_progress",
        lastSyncMessage: "Sync started",
      },
      update: {
        connected: true,
        accessToken: token,
        syncInProgress: true,
        lastSyncStatus: "in_progress",
        lastSyncMessage: "Sync started",
      },
    });

    const result = await syncShopifyData(token);

    await prisma.integrationState.update({
      where: { provider: "shopify" },
      data: {
        syncInProgress: false,
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        lastSyncMessage: `Synced ${result.customersUpserted} customers, ${result.ordersUpserted} orders, ${result.productsUpserted} products`,
      },
    });

    return NextResponse.json({
      ok: true,
      summary: {
        customers: result.customersUpserted,
        orders: result.ordersUpserted,
        products: result.productsUpserted,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
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
    return NextResponse.json({ error: "Shopify sync failed", detail: message }, { status: 500 });
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
