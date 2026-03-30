import { NextResponse } from "next/server";
import { getCohortRetention } from "@/lib/analytics";

export async function GET() {
  try {
    const cohorts = await getCohortRetention(12);
    return NextResponse.json(cohorts);
  } catch (error) {
    console.error("Failed to fetch cohorts", error);
    return NextResponse.json({ error: "Failed to fetch cohorts" }, { status: 500 });
  }
}
