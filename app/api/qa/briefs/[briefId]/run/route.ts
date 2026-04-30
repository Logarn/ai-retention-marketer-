import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  briefQaInclude,
  cleanBriefId,
  loadBrainGuidance,
  parseOptionalQaRunBody,
  runBriefQa,
  serializeBriefQaCheck,
} from "@/app/api/qa/shared";

type RouteContext = {
  params: Promise<{ briefId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
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

    const body = await parseOptionalQaRunBody(request);
    if (!body.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid QA request",
          issues: body.issues,
        },
        { status: 400 },
      );
    }

    const brief = await prisma.campaignBrief.findUnique({
      where: { id: briefId },
      include: briefQaInclude,
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

    const brainGuidance = await loadBrainGuidance();
    const result = runBriefQa(brief, brainGuidance);
    const metadata = {
      ...result.metadata,
      requestMetadata: body.metadata,
    };

    const qaCheck = await prisma.briefQaCheck.create({
      data: {
        briefId,
        status: result.status,
        score: result.score,
        issues: result.issues as Prisma.InputJsonValue,
        warnings: result.warnings as Prisma.InputJsonValue,
        passedChecks: result.passedChecks as Prisma.InputJsonValue,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        qaCheck: serializeBriefQaCheck(qaCheck),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/qa/briefs/[briefId]/run failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to run brief QA",
      },
      { status: 500 },
    );
  }
}
