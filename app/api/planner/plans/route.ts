import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializePlanSummary } from "@/app/api/planner/shared";

function cleanStatus(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = cleanStatus(searchParams.get("status"));

    const plans = await prisma.campaignPlan.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      plans: plans.map(serializePlanSummary),
    });
  } catch (error) {
    console.error("GET /api/planner/plans failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load campaign plans",
      },
      { status: 500 },
    );
  }
}
