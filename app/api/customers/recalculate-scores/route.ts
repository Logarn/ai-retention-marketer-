import { NextResponse } from "next/server";
import { computeAndPersistCustomerScores } from "@/lib/analytics";

export async function POST() {
  try {
    const result = await computeAndPersistCustomerScores();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to recalculate customer scores", error);
    return NextResponse.json({ error: "Failed to recalculate scores" }, { status: 500 });
  }
}
