import { NextResponse } from "next/server";
import { syncSegmentsToKlaviyo } from "@/lib/klaviyo";

export async function POST() {
  try {
    const result = await syncSegmentsToKlaviyo();
    return NextResponse.json({
      ok: true,
      summary: {
        segmentsSynced: result.success,
        failed: result.failed,
      },
      details: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to sync RFM segments to Klaviyo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
