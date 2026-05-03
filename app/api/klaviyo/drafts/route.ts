import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const drafts = await prisma.klaviyoDraft.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        briefId: true,
        klaviyoCampaignId: true,
        klaviyoTemplateId: true,
        klaviyoMessageId: true,
        campaignName: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      drafts,
    });
  } catch (error) {
    console.error("GET /api/klaviyo/drafts failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load Klaviyo drafts",
        drafts: [],
      },
      { status: 500 },
    );
  }
}
