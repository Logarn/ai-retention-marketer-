import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseMemoryLimit,
  parseOptionalDateParam,
  serializeCampaignMemory,
} from "@/app/api/memory/shared";

function cleanQueryValue(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitResult = parseMemoryLimit(searchParams.get("limit"));
    if (!limitResult.ok) {
      return NextResponse.json({ error: limitResult.error }, { status: 400 });
    }

    const fromResult = parseOptionalDateParam(searchParams.get("from"), "from");
    if (!fromResult.ok) {
      return NextResponse.json({ error: fromResult.error }, { status: 400 });
    }

    const toResult = parseOptionalDateParam(searchParams.get("to"), "to");
    if (!toResult.ok) {
      return NextResponse.json({ error: toResult.error }, { status: 400 });
    }

    if (fromResult.date && toResult.date && fromResult.date > toResult.date) {
      return NextResponse.json({ error: "from must be before to." }, { status: 400 });
    }

    const segment = cleanQueryValue(searchParams.get("segment"));
    const campaignType = cleanQueryValue(searchParams.get("campaignType"));
    const source = cleanQueryValue(searchParams.get("source"));

    const where: Prisma.CampaignMemoryWhereInput = {
      ...(segment ? { segment } : {}),
      ...(campaignType ? { campaignType } : {}),
      ...(source ? { source } : {}),
      ...(fromResult.date || toResult.date
        ? {
            sentAt: {
              ...(fromResult.date ? { gte: fromResult.date } : {}),
              ...(toResult.date ? { lte: toResult.date } : {}),
            },
          }
        : {}),
    };

    const memories = await prisma.campaignMemory.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: limitResult.limit,
    });

    return NextResponse.json(memories.map(serializeCampaignMemory));
  } catch (error) {
    console.error("GET /api/memory/campaigns failed", error);
    return NextResponse.json(
      {
        error: "Failed to load campaign memories",
      },
      { status: 500 },
    );
  }
}
