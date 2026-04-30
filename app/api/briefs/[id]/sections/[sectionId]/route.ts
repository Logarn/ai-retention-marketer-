import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  serializeBriefSection,
  validateBriefSectionPatchPayload,
} from "@/app/api/briefs/shared";

type RouteContext = {
  params: Promise<{ id: string; sectionId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, sectionId } = await context.params;
    const body = await request.json().catch(() => null);
    const validation = validateBriefSectionPatchPayload(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid brief section update request",
          issues: validation.issues,
        },
        { status: 400 },
      );
    }

    const existing = await prisma.campaignBriefSection.findFirst({
      where: {
        id: sectionId,
        briefId: id,
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "Campaign brief section not found",
        },
        { status: 404 },
      );
    }

    const section = await prisma.campaignBriefSection.update({
      where: { id: sectionId },
      data: validation.data,
    });

    return NextResponse.json({
      ok: true,
      section: serializeBriefSection(section),
    });
  } catch (error) {
    console.error("PATCH /api/briefs/[id]/sections/[sectionId] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to update campaign brief section",
      },
      { status: 500 },
    );
  }
}
