import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildBriefSource,
  generateBriefArtifact,
  loadBriefContext,
  serializeBrief,
  validateGenerateBriefPayload,
} from "@/app/api/briefs/shared";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const validation = validateGenerateBriefPayload(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid brief generation request",
          issues: validation.issues,
        },
        { status: 400 },
      );
    }

    const planItem = validation.data.planItemId
      ? await prisma.campaignPlanItem.findUnique({
          where: { id: validation.data.planItemId },
          select: {
            id: true,
            title: true,
            campaignType: true,
            goal: true,
            segment: true,
            subjectLineAngle: true,
            primaryProduct: true,
            why: true,
            confidenceScore: true,
            metadata: true,
          },
        })
      : null;

    if (validation.data.planItemId && !planItem) {
      return NextResponse.json(
        {
          ok: false,
          error: "Campaign plan item not found",
        },
        { status: 404 },
      );
    }

    const context = await loadBriefContext();
    const source = buildBriefSource(validation.data, planItem);
    const generated = generateBriefArtifact(source, context);

    const brief = await prisma.campaignBrief.create({
      data: {
        planItemId: generated.planItemId,
        title: generated.title,
        campaignType: generated.campaignType,
        segment: generated.segment,
        goal: generated.goal,
        subjectLines: generated.subjectLines as Prisma.InputJsonValue,
        previewTexts: generated.previewTexts as Prisma.InputJsonValue,
        angle: generated.angle,
        primaryProduct: generated.primaryProduct,
        status: generated.status,
        designNotes: generated.designNotes,
        cta: generated.cta,
        metadata: generated.metadata as Prisma.InputJsonValue,
        sections: {
          create: generated.sections.map((section) => ({
            type: section.type,
            heading: section.heading,
            body: section.body,
            sortOrder: section.sortOrder,
            metadata: section.metadata as Prisma.InputJsonValue,
          })),
        },
      },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        brief: serializeBrief(brief),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/briefs/generate failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate campaign brief",
      },
      { status: 500 },
    );
  }
}
