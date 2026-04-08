import { NextResponse } from "next/server";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";

const TEST_STORE = "sauti-ai";
const TEST_PATH = `/admin/api/${SHOPIFY_API_VERSION}/orders.json`;

/**
 * Temporary diagnostic: GET with env token only — verifies Admin API + token without DB.
 * Remove or protect before production.
 */
export async function GET() {
  const token = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "SHOPIFY_ACCESS_TOKEN is not set in environment" },
      { status: 400 },
    );
  }

  const prefix = token.length >= 8 ? token.substring(0, 8) : token;
  const url = new URL(`https://${TEST_STORE}.myshopify.com${TEST_PATH}`);
  url.searchParams.set("limit", "1");

  console.log("[test-shopify] GET", url.toString(), "| token prefix:", prefix);

  const res = await fetch(url.toString(), {
    headers: { "X-Shopify-Access-Token": token },
  });

  const text = await res.text();
  let bodyPreview: unknown = text.slice(0, 800);
  try {
    bodyPreview = JSON.parse(text);
  } catch {
    /* keep string */
  }

  return NextResponse.json({
    status: res.status,
    ok: res.ok,
    url: url.toString(),
    apiVersion: SHOPIFY_API_VERSION,
    tokenPrefix: prefix,
    tokenSource: "SHOPIFY_ACCESS_TOKEN (env only)",
    bodyPreview,
  });
}
