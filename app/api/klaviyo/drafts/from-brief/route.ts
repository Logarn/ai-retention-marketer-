import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createKlaviyoDraftForBrief,
  KlaviyoDraftConfigError,
} from "@/lib/klaviyo-draft-service";
import {
  KlaviyoDraftApiError,
} from "@/lib/klaviyo-drafts";

export const runtime = "nodejs";

const schema = z.object({
  briefId: z.string().trim().min(1, "briefId is required."),
  audienceId: z.string().trim().min(1).optional(),
  overrideSubject: z.string().trim().min(1).max(180).optional(),
  overridePreviewText: z.string().trim().min(1).max(300).optional(),
  overrideFailedQa: z.boolean().optional(),
});

function safeErrorResponse(error: unknown) {
  if (error instanceof KlaviyoDraftConfigError) {
    return NextResponse.json(
      {
        ok: false,
        error: "Klaviyo draft creation is not configured",
        missingConfig: error.missingConfig,
      },
      { status: 400 },
    );
  }

  if (error instanceof KlaviyoDraftApiError) {
    return NextResponse.json(
      {
        ok: false,
        error: "Klaviyo draft creation failed",
        klaviyoStatus: error.status,
        klaviyoErrors: error.errors,
      },
      { status: 502 },
    );
  }

  console.error("POST /api/klaviyo/drafts/from-brief failed", error);
  return NextResponse.json(
    {
      ok: false,
      error: "Failed to create Klaviyo draft",
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid Klaviyo draft request",
          issues: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const brief = await prisma.campaignBrief.findUnique({
      where: { id: parsed.data.briefId },
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

    const latestQa = await prisma.briefQaCheck.findFirst({
      where: { briefId: brief.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        score: true,
        createdAt: true,
      },
    });

    if (latestQa?.status === "failed" && !parsed.data.overrideFailedQa) {
      return NextResponse.json(
        {
          ok: false,
          error: "Latest QA result failed. Pass overrideFailedQa=true to create a draft anyway.",
          qaCheck: latestQa,
        },
        { status: 400 },
      );
    }

    const draft = await createKlaviyoDraftForBrief({
      brief,
      latestQa,
      audienceId: parsed.data.audienceId,
      overrideSubject: parsed.data.overrideSubject,
      overridePreviewText: parsed.data.overridePreviewText,
    });

    return NextResponse.json(
      draft,
      { status: 201 },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
