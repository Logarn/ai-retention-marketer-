import { NextResponse } from "next/server";
import { getRfmDistribution } from "@/lib/analytics";

export async function GET() {
  try {
    const data = await getRfmDistribution();
    return NextResponse.json(data);
  } catch (error) {
    console.error("analytics/rfm-distribution failed", error);
    return NextResponse.json({ error: "Failed to load rfm distribution" }, { status: 500 });
  }
}
