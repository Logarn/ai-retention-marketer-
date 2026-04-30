import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  generatePlanArtifact,
  loadPlannerContext,
  serializePlan,
  validatePlannerGeneratePayload,
} from "@/app/api/planner/shared";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const validation = validatePlannerGeneratePayload(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid planner request",
          issues: validation.issues,
        },
        { status: 400 },
      );
    }

    const context = await loadPlannerContext();
    const generated = generatePlanArtifact(validation.data, context);

    const plan = await prisma.campaignPlan.create({
      data: {
        name: generated.name,
        dateRangeStart: generated.dateRangeStart,
        dateRangeEnd: generated.dateRangeEnd,
        status: generated.status,
        summary: generated.summary,
        strategyNotes: generated.strategyNotes,
        metadata: generated.metadata as Prisma.InputJsonValue,
        items: {
          create: generated.items.map((item) => ({
            title: item.title,
            campaignType: item.campaignType,
            goal: item.goal,
            segment: item.segment,
            suggestedSendDate: item.suggestedSendDate,
            subjectLineAngle: item.subjectLineAngle,
            primaryProduct: item.primaryProduct,
            why: item.why,
            confidenceScore: item.confidenceScore,
            status: item.status,
            metadata: item.metadata as Prisma.InputJsonValue,
          })),
        },
      },
      include: {
        items: {
          orderBy: { suggestedSendDate: "asc" },
        },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        plan: serializePlan(plan),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/planner/generate failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate campaign plan",
      },
      { status: 500 },
    );
  }
}
