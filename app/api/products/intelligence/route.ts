import { NextResponse } from "next/server";
import { getProductPerformanceIntelligence } from "@/lib/products/product-performance-intelligence";

export const runtime = "nodejs";

function parsePositiveInt(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const result = await getProductPerformanceIntelligence({
      limit: parsePositiveInt(searchParams.get("limit")),
      minViews: parsePositiveInt(searchParams.get("minViews")),
      timeframe: searchParams.get("timeframe"),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/products/intelligence failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load product performance intelligence",
        summary: null,
        tiers: {
          revenueAnchors: [],
          hiddenGems: [],
          addOnBoosters: [],
          replenishmentCandidates: [],
          fixCandidates: [],
        },
        lifecyclePlacement: {
          welcomeHero: [],
          welcomeHiddenGems: [],
          browseAbandon: [],
          cartCheckoutAddOns: [],
          postPurchaseCrossSell: [],
          vip: [],
          winback: [],
        },
        caveats: ["Unexpected server error while reading normalized local product data."],
        generatedAt: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
