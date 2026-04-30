import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanBriefId, serializeBriefQaCheck } from "@/app/api/qa/shared";

type RouteContext = {
  params: Promise<{ briefId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { briefId: rawBriefId } = await context.params;
    const briefId = cleanBriefId(rawBriefId);

    if (!briefId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid QA request",
          issues: ["briefId is required."],
        },
        { status: 400 },
      );
    }

    const brief = await prisma.campaignBrief.findUnique({
      where: { id: briefId },
      select: { id: true },
    });

    if (!brief) {
      return NextResponse.json(
        {
          ok: false,
          error: "Campaign brief not found",
        },
        { status: 404 },
      );
    }

    const latestCheck = await prisma.briefQaCheck.findFirst({
      where: { briefId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      ok: true,
      qaCheck: latestCheck ? serializeBriefQaCheck(latestCheck) : null,
    });
  } catch (error) {
    console.error("GET /api/qa/briefs/[briefId] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load brief QA",
      },
      { status: 500 },
    );
  }
}
