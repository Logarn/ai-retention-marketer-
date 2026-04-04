import { NextRequest, NextResponse } from "next/server";
import {
  ingestShopifyProductWebhook,
  verifyShopifyWebhookSignature,
} from "@/lib/shopify";

async function handleProductWebhook(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-shopify-hmac-sha256");
  if (!verifyShopifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Shopify webhook signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    id?: number;
    title?: string;
    product_type?: string;
    image?: { src?: string };
    variants?: Array<{ sku?: string; price?: string }>;
    updated_at?: string;
  };

  if (!payload?.id) {
    return NextResponse.json({ error: "Webhook payload missing product id" }, { status: 400 });
  }

  const result = await ingestShopifyProductWebhook(payload);
  return NextResponse.json({ ok: true, result });
}

export async function POST(request: NextRequest) {
  try {
    return await handleProductWebhook(request);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to process Shopify product update webhook",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
