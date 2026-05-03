import type { CampaignBrief, CampaignBriefSection } from "@prisma/client";

const KLAVIYO_BASE_URL = "https://a.klaviyo.com/api";
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";

export type KlaviyoDraftConfig = {
  apiKey: string;
  revision: string;
  defaultAudienceId: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  draftOnly: true;
};

export type KlaviyoDraftConfigResult =
  | { ok: true; config: KlaviyoDraftConfig }
  | { ok: false; missingConfig: string[] };

export type KlaviyoApiErrorBody = {
  status: number;
  title: string;
  detail?: string;
};

export class KlaviyoDraftApiError extends Error {
  status: number;
  errors: KlaviyoApiErrorBody[];

  constructor(message: string, status: number, errors: KlaviyoApiErrorBody[]) {
    super(message);
    this.name = "KlaviyoDraftApiError";
    this.status = status;
    this.errors = errors;
  }
}

export type BriefWithSections = CampaignBrief & {
  sections: CampaignBriefSection[];
};

export type RenderedKlaviyoEmail = {
  html: string;
  text: string;
};

type JsonApiData = {
    id?: string;
    type?: string;
    attributes?: Record<string, unknown>;
    relationships?: Record<string, unknown>;
};

type JsonApiResource = {
  data?: JsonApiData | JsonApiData[];
  errors?: Array<Record<string, unknown>>;
};

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getKlaviyoDraftConfig(): KlaviyoDraftConfigResult {
  const apiKey = cleanEnv(process.env.KLAVIYO_API_KEY);
  const revision = cleanEnv(process.env.KLAVIYO_API_REVISION);
  const defaultAudienceId = cleanEnv(process.env.KLAVIYO_TEST_AUDIENCE_ID);
  const fromEmail = cleanEnv(process.env.KLAVIYO_FROM_EMAIL);
  const fromName = cleanEnv(process.env.KLAVIYO_FROM_NAME);
  const replyToEmail = cleanEnv(process.env.KLAVIYO_REPLY_TO_EMAIL);
  const draftOnly = cleanEnv(process.env.KLAVIYO_DRAFT_ONLY);

  const missingConfig = [
    !apiKey ? "KLAVIYO_API_KEY" : null,
    !revision ? "KLAVIYO_API_REVISION" : null,
    !defaultAudienceId ? "KLAVIYO_TEST_AUDIENCE_ID" : null,
    !fromEmail ? "KLAVIYO_FROM_EMAIL" : null,
    !fromName ? "KLAVIYO_FROM_NAME" : null,
    !replyToEmail ? "KLAVIYO_REPLY_TO_EMAIL" : null,
    draftOnly !== "true" ? "KLAVIYO_DRAFT_ONLY=true" : null,
  ].filter((key): key is string => Boolean(key));

  if (missingConfig.length) {
    return { ok: false, missingConfig };
  }

  return {
    ok: true,
    config: {
      apiKey: apiKey!,
      revision: revision!,
      defaultAudienceId: defaultAudienceId!,
      fromEmail: fromEmail!,
      fromName: fromName!,
      replyToEmail: replyToEmail!,
      draftOnly: true,
    },
  };
}

function escapeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function sectionLabel(type: string) {
  return type
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sectionByType(sections: CampaignBriefSection[], type: string) {
  const normalizedType = type.toLowerCase();
  return sections.find((section) => section.type.toLowerCase().includes(normalizedType));
}

function renderSection(section: CampaignBriefSection | undefined, fallbackHeading: string) {
  if (!section) return "";
  const heading = normalizeText(section.heading) || fallbackHeading;
  return `
    <tr>
      <td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 10px; color: #111827; font-size: 20px; line-height: 1.3;">${escapeHtml(heading)}</h2>
        <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.7;">${escapeHtml(section.body)}</p>
      </td>
    </tr>
  `;
}

function renderAdditionalSections(sections: CampaignBriefSection[]) {
  return sections
    .map((section) => `
      <tr>
        <td style="padding: 20px 32px; border-bottom: 1px solid #e5e7eb;">
          <h2 style="margin: 0 0 10px; color: #111827; font-size: 18px; line-height: 1.3;">${escapeHtml(section.heading || sectionLabel(section.type))}</h2>
          <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.7;">${escapeHtml(section.body)}</p>
        </td>
      </tr>
    `)
    .join("");
}

export function renderKlaviyoEmailHtml(brief: BriefWithSections, previewText: string): RenderedKlaviyoEmail {
  const sortedSections = [...brief.sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const hero = sectionByType(sortedSections, "hero");
  const intro = sectionByType(sortedSections, "intro") ?? sectionByType(sortedSections, "story");
  const product = sectionByType(sortedSections, "product");
  const proof = sectionByType(sortedSections, "education") ?? sectionByType(sortedSections, "proof");
  const ctaSection = sectionByType(sortedSections, "cta");
  const usedIds = new Set([hero?.id, intro?.id, product?.id, proof?.id, ctaSection?.id].filter(Boolean));
  const additionalSections = sortedSections.filter((section) => !usedIds.has(section.id) && section.type !== "design_notes");

  const title = normalizeText(brief.title) || "A note from the team";
  const angle = normalizeText(brief.angle);
  const cta = normalizeText(brief.cta) || "Shop now";
  const productName = normalizeText(brief.primaryProduct);

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f3f4f6; font-family: Arial, Helvetica, sans-serif;">
    <div style="display:none; font-size:1px; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
      ${escapeHtml(previewText)}
    </div>
    <!-- Worklin design notes: ${escapeHtml(brief.designNotes)} -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f3f4f6; padding: 24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; background: #ffffff; border-radius: 12px; overflow: hidden;">
            <tr>
              <td style="padding: 34px 32px; background: #111827;">
                <p style="margin: 0 0 10px; color: #a7f3d0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;">${escapeHtml(brief.campaignType)}</p>
                <h1 style="margin: 0; color: #ffffff; font-size: 30px; line-height: 1.2;">${escapeHtml(hero?.heading || title)}</h1>
                ${angle ? `<p style="margin: 14px 0 0; color: #d1d5db; font-size: 16px; line-height: 1.6;">${escapeHtml(hero?.body || angle)}</p>` : ""}
              </td>
            </tr>
            ${renderSection(intro, "The story")}
            ${product ? renderSection(product, productName || "Product spotlight") : productName ? `
              <tr>
                <td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
                  <h2 style="margin: 0 0 10px; color: #111827; font-size: 20px; line-height: 1.3;">${escapeHtml(productName)}</h2>
                  <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.7;">${escapeHtml(brief.goal)}</p>
                </td>
              </tr>
            ` : ""}
            ${renderSection(proof, "Why it matters")}
            ${renderAdditionalSections(additionalSections)}
            <tr>
              <td align="center" style="padding: 30px 32px;">
                ${ctaSection?.body ? `<p style="margin: 0 0 18px; color: #374151; font-size: 15px; line-height: 1.7;">${escapeHtml(ctaSection.body)}</p>` : ""}
                <a href="https://example.com" style="display: inline-block; padding: 14px 24px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: bold;">${escapeHtml(cta)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 22px 32px; background: #f9fafb; color: #6b7280; font-size: 12px; line-height: 1.6; text-align: center;">
                <p style="margin: 0;">You are receiving this email because you subscribed to updates from this brand.</p>
                <p style="margin: 8px 0 0;">{% unsubscribe %}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    title,
    previewText,
    angle,
    ...sortedSections
      .filter((section) => section.type !== "design_notes")
      .flatMap((section) => [section.heading, section.body]),
    cta,
    "Unsubscribe: {% unsubscribe %}",
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join("\n\n");

  return { html, text };
}

function safeKlaviyoErrors(body: unknown): KlaviyoApiErrorBody[] {
  if (!body || typeof body !== "object" || !("errors" in body) || !Array.isArray((body as JsonApiResource).errors)) {
    return [];
  }

  return ((body as JsonApiResource).errors ?? []).map((error) => ({
    status: Number(error.status) || 0,
    title: typeof error.title === "string" ? error.title : "Klaviyo API error",
    detail: typeof error.detail === "string" ? error.detail : undefined,
  }));
}

function getResourceId(response: JsonApiResource, label: string) {
  const resource = Array.isArray(response.data) ? response.data[0] : response.data;
  const id = resource?.id;
  if (!id) {
    throw new KlaviyoDraftApiError(`Klaviyo ${label} response did not include an id.`, 502, []);
  }
  return id;
}

export class KlaviyoDraftClient {
  private config: KlaviyoDraftConfig;

  constructor(config: KlaviyoDraftConfig) {
    this.config = config;
  }

  private async request(path: string, options: { method?: string; body?: unknown }) {
    const response = await fetch(`${KLAVIYO_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Klaviyo-API-Key ${this.config.apiKey}`,
        revision: this.config.revision,
        Accept: JSON_API_CONTENT_TYPE,
        "Content-Type": JSON_API_CONTENT_TYPE,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const responseBody = (await response.json().catch(() => null)) as JsonApiResource | null;
    if (!response.ok) {
      const errors = safeKlaviyoErrors(responseBody);
      throw new KlaviyoDraftApiError("Klaviyo API request failed.", response.status, errors);
    }

    return (responseBody ?? {}) as JsonApiResource;
  }

  async createTemplate(input: { name: string; html: string; text: string }) {
    const response = await this.request("/templates", {
      method: "POST",
      body: {
        data: {
          type: "template",
          attributes: {
            name: input.name,
            editor_type: "CODE",
            html: input.html,
            text: input.text,
          },
        },
      },
    });

    return {
      id: getResourceId(response, "template"),
      response,
    };
  }

  async createEmailCampaign(input: {
    name: string;
    audienceId: string;
    subject: string;
    previewText: string;
  }) {
    const response = await this.request("/campaigns", {
      method: "POST",
      body: {
        data: {
          type: "campaign",
          attributes: {
            name: input.name,
            audiences: {
              included: [input.audienceId],
              excluded: [],
            },
            send_strategy: {
              method: "immediate",
            },
            "campaign-messages": {
              data: [
                {
                  type: "campaign-message",
                  attributes: {
                    definition: {
                      channel: "email",
                      label: input.subject,
                      content: {
                        subject: input.subject,
                        preview_text: input.previewText,
                        from_email: this.config.fromEmail,
                        from_label: this.config.fromName,
                        reply_to_email: this.config.replyToEmail,
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    });

    return {
      id: getResourceId(response, "campaign"),
      response,
    };
  }

  async getCampaignMessageId(campaignId: string) {
    const response = await this.request(`/campaigns/${encodeURIComponent(campaignId)}/campaign-messages`, {
      method: "GET",
    });
    const firstMessage = Array.isArray(response.data) ? response.data[0] : null;
    const id = firstMessage && typeof firstMessage === "object" && "id" in firstMessage ? firstMessage.id : null;
    if (typeof id !== "string" || !id) {
      throw new KlaviyoDraftApiError("Klaviyo campaign did not include a campaign message.", 502, []);
    }

    return {
      id,
      response,
    };
  }

  async assignTemplateToMessage(input: { campaignMessageId: string; templateId: string }) {
    const response = await this.request("/campaign-message-assign-template", {
      method: "POST",
      body: {
        data: {
          type: "campaign-message",
          id: input.campaignMessageId,
          relationships: {
            template: {
              data: {
                type: "template",
                id: input.templateId,
              },
            },
          },
        },
      },
    });

    return {
      id: getResourceId(response, "campaign message"),
      response,
    };
  }
}

export function buildKlaviyoCampaignUrl(campaignId: string) {
  return `https://www.klaviyo.com/campaign/${encodeURIComponent(campaignId)}`;
}

export function buildKlaviyoTemplateUrl(templateId: string) {
  return `https://www.klaviyo.com/email-template/${encodeURIComponent(templateId)}`;
}
