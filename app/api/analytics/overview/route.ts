import { NextResponse } from "next/server";
import { getOverviewMetrics } from "@/lib/analytics";

export async function GET() {
  try {
    const data = await getOverviewMetrics();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch overview metrics", details: String(error) },
      { status: 500 },
    );
  }
}
