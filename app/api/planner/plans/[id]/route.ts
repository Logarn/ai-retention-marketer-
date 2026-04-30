import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializePlan } from "@/app/api/planner/shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const plan = await prisma.campaignPlan.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { suggestedSendDate: "asc" },
        },
      },
    });

    if (!plan) {
      return NextResponse.json(
        {
          ok: false,
          error: "Campaign plan not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      plan: serializePlan(plan),
    });
  } catch (error) {
    console.error("GET /api/planner/plans/[id] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load campaign plan",
      },
      { status: 500 },
    );
  }
}
