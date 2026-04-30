import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  serializeBrief,
  validateBriefPatchPayload,
} from "@/app/api/briefs/shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const brief = await prisma.campaignBrief.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
        },
      },
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

    return NextResponse.json({
      ok: true,
      brief: serializeBrief(brief),
    });
  } catch (error) {
    console.error("GET /api/briefs/[id] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load campaign brief",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const validation = validateBriefPatchPayload(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid brief update request",
          issues: validation.issues,
        },
        { status: 400 },
      );
    }

    const existing = await prisma.campaignBrief.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "Campaign brief not found",
        },
        { status: 404 },
      );
    }

    const brief = await prisma.campaignBrief.update({
      where: { id },
      data: validation.data,
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      brief: serializeBrief(brief),
    });
  } catch (error) {
    console.error("PATCH /api/briefs/[id] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to update campaign brief",
      },
      { status: 500 },
    );
  }
}
