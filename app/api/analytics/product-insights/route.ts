import { NextResponse } from "next/server";
import { getProductInsights } from "@/lib/analytics";

export async function GET() {
  try {
    const data = await getProductInsights();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load product insights",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
