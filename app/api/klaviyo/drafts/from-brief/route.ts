import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  buildKlaviyoCampaignUrl,
  buildKlaviyoTemplateUrl,
  getKlaviyoDraftConfig,
  KlaviyoDraftApiError,
  KlaviyoDraftClient,
  renderKlaviyoEmailHtml,
} from "@/lib/klaviyo-drafts";

export const runtime = "nodejs";

const schema = z.object({
  briefId: z.string().trim().min(1, "briefId is required."),
  audienceId: z.string().trim().min(1).optional(),
  overrideSubject: z.string().trim().min(1).max(180).optional(),
  overridePreviewText: z.string().trim().min(1).max(300).optional(),
  overrideFailedQa: z.boolean().optional(),
});

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function campaignName(briefTitle: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `Worklin Draft - ${briefTitle} - ${date}`.slice(0, 180);
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function safeErrorResponse(error: unknown) {
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

    const configResult = getKlaviyoDraftConfig();
    if (!configResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Klaviyo draft creation is not configured",
          missingConfig: configResult.missingConfig,
        },
        { status: 400 },
      );
    }

    const subjectLines = asStringArray(brief.subjectLines);
    const previewTexts = asStringArray(brief.previewTexts);
    const subject = parsed.data.overrideSubject ?? subjectLines[0] ?? brief.title;
    const previewText = parsed.data.overridePreviewText ?? previewTexts[0] ?? brief.goal;
    const audienceId = parsed.data.audienceId ?? configResult.config.defaultAudienceId;
    const name = campaignName(brief.title);
    const rendered = renderKlaviyoEmailHtml(brief, previewText);
    const client = new KlaviyoDraftClient(configResult.config);

    const template = await client.createTemplate({
      name,
      html: rendered.html,
      text: rendered.text,
    });
    const campaign = await client.createEmailCampaign({
      name,
      audienceId,
      subject,
      previewText,
    });
    const message = await client.getCampaignMessageId(campaign.id);
    const assignedMessage = await client.assignTemplateToMessage({
      campaignMessageId: message.id,
      templateId: template.id,
    });

    const draft = await prisma.klaviyoDraft.create({
      data: {
        briefId: brief.id,
        klaviyoCampaignId: campaign.id,
        klaviyoTemplateId: template.id,
        klaviyoMessageId: message.id,
        campaignName: name,
        status: "draft_created",
        response: toPrismaJson({
          latestQa,
          campaign: campaign.response,
          template: template.response,
          message: message.response,
          assignedMessage: assignedMessage.response,
        }),
      },
    });

    return NextResponse.json(
      {
        ok: true,
        briefId: brief.id,
        klaviyoCampaignId: campaign.id,
        klaviyoTemplateId: template.id,
        klaviyoMessageId: message.id,
        campaignName: name,
        status: "draft_created",
        draftId: draft.id,
        qaCheck: latestQa,
        urls: {
          campaign: buildKlaviyoCampaignUrl(campaign.id),
          template: buildKlaviyoTemplateUrl(template.id),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
