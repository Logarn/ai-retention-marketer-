import { NextResponse } from "next/server";
import { getRfmDistribution } from "@/lib/analytics";

export async function GET() {
  try {
    const segments = await getRfmDistribution();
    return NextResponse.json(segments);
  } catch (error) {
    console.error("Failed to fetch customer segments", error);
    return NextResponse.json({ error: "Failed to fetch customer segments" }, { status: 500 });
  }
}
