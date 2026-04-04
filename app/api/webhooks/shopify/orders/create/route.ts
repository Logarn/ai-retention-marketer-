import { NextRequest, NextResponse } from "next/server";
import { ingestShopifyOrderWebhook, verifyShopifyWebhookSignature } from "@/lib/shopify";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!verifyShopifyWebhookSignature(rawBody, hmac)) {
    return NextResponse.json({ error: "Invalid Shopify webhook signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const result = await ingestShopifyOrderWebhook(payload as Parameters<typeof ingestShopifyOrderWebhook>[0]);
    return NextResponse.json({ ok: true, topic: "orders/create", result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process orders/create webhook";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
