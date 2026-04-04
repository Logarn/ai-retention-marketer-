import { NextRequest, NextResponse } from "next/server";
import { ingestShopifyOrderWebhook, verifyShopifyWebhookSignature } from "@/lib/shopify";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic") ?? "orders/updated";
  const shopDomain = request.headers.get("x-shopify-shop-domain");

  if (!verifyShopifyWebhookSignature(rawBody, hmac)) {
    return NextResponse.json({ error: "Invalid Shopify webhook signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const result = await ingestShopifyOrderWebhook(payload);
    return NextResponse.json({
      ok: true,
      topic,
      shopDomain,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to process Shopify order update webhook",
        detail: error instanceof Error ? error.message : "Unknown webhook error",
      },
      { status: 500 },
    );
  }
}
