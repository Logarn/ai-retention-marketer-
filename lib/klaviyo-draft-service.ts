import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildKlaviyoCampaignUrl,
  buildKlaviyoTemplateUrl,
  BriefWithSections,
  getKlaviyoDraftConfig,
  KlaviyoDraftClient,
  renderKlaviyoEmailHtml,
} from "@/lib/klaviyo-drafts";

type LatestQaForDraft = {
  id: string;
  status: string;
  score: number;
  createdAt: Date;
} | null;

type CreateKlaviyoDraftInput = {
  brief: BriefWithSections;
  latestQa: LatestQaForDraft;
  audienceId?: string;
  overrideSubject?: string;
  overridePreviewText?: string;
};

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

export class KlaviyoDraftConfigError extends Error {
  missingConfig: string[];

  constructor(missingConfig: string[]) {
    super("Klaviyo draft creation is not configured");
    this.name = "KlaviyoDraftConfigError";
    this.missingConfig = missingConfig;
  }
}

export async function createKlaviyoDraftForBrief(input: CreateKlaviyoDraftInput) {
  const configResult = getKlaviyoDraftConfig();
  if (!configResult.ok) {
    throw new KlaviyoDraftConfigError(configResult.missingConfig);
  }

  const subjectLines = asStringArray(input.brief.subjectLines);
  const previewTexts = asStringArray(input.brief.previewTexts);
  const subject = input.overrideSubject ?? subjectLines[0] ?? input.brief.title;
  const previewText = input.overridePreviewText ?? previewTexts[0] ?? input.brief.goal;
  const audienceId = input.audienceId ?? configResult.config.defaultAudienceId;
  const name = campaignName(input.brief.title);
  const rendered = renderKlaviyoEmailHtml(input.brief, previewText);
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
      briefId: input.brief.id,
      klaviyoCampaignId: campaign.id,
      klaviyoTemplateId: template.id,
      klaviyoMessageId: message.id,
      campaignName: name,
      status: "draft_created",
      response: toPrismaJson({
        latestQa: input.latestQa,
        campaign: campaign.response,
        template: template.response,
        message: message.response,
        assignedMessage: assignedMessage.response,
      }),
    },
  });

  return {
    ok: true as const,
    briefId: input.brief.id,
    klaviyoCampaignId: campaign.id,
    klaviyoTemplateId: template.id,
    klaviyoMessageId: message.id,
    campaignName: name,
    status: "draft_created",
    draftId: draft.id,
    qaCheck: input.latestQa,
    urls: {
      campaign: buildKlaviyoCampaignUrl(campaign.id),
      template: buildKlaviyoTemplateUrl(template.id),
    },
  };
}
