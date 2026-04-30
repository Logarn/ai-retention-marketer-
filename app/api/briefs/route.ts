import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  cleanQueryValue,
  parseBriefLimit,
  serializeBriefSummary,
} from "@/app/api/briefs/shared";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitResult = parseBriefLimit(searchParams.get("limit"));
    if (!limitResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: limitResult.error,
        },
        { status: 400 },
      );
    }

    const status = cleanQueryValue(searchParams.get("status"));
    const campaignType = cleanQueryValue(searchParams.get("campaignType"));
    const segment = cleanQueryValue(searchParams.get("segment"));
    const planItemId = cleanQueryValue(searchParams.get("planItemId"));

    const where: Prisma.CampaignBriefWhereInput = {
      ...(status ? { status } : {}),
      ...(campaignType ? { campaignType } : {}),
      ...(segment ? { segment } : {}),
      ...(planItemId ? { planItemId } : {}),
    };

    const briefs = await prisma.campaignBrief.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limitResult.limit,
      include: {
        _count: {
          select: { sections: true },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      briefs: briefs.map(serializeBriefSummary),
    });
  } catch (error) {
    console.error("GET /api/briefs failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load campaign briefs",
      },
      { status: 500 },
    );
  }
}
