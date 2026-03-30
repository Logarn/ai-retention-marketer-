import { NextRequest, NextResponse } from "next/server";
import { getAtRiskCustomers } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") || 100);
    const customers = await getAtRiskCustomers(Number.isNaN(limit) ? 100 : limit);
    return NextResponse.json(customers);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch at-risk customers", details: (error as Error).message },
      { status: 500 },
    );
  }
}
