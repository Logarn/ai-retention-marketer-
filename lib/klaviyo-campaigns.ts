const KLAVIYO_BASE_URL = "https://a.klaviyo.com/api";
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";
const MAX_CAMPAIGN_PAGES = 5;
const MAX_CAMPAIGN_MESSAGE_READS = 25;
const MAX_READ_RETRIES = 2;
const CAMPAIGN_CHANNELS = ["email", "sms", "mobile_push"] as const;

export type KlaviyoCampaignConfig = {
  apiKey: string;
  revision: string;
  draftOnly: true;
};

export type KlaviyoCampaignConfigResult =
  | { ok: true; config: KlaviyoCampaignConfig }
  | { ok: false; missingConfig: string[] };

export type KlaviyoCampaignApiErrorBody = {
  status: number;
  title: string;
  detail?: string;
};

export class KlaviyoCampaignApiError extends Error {
  status: number;
  errors: KlaviyoCampaignApiErrorBody[];

  constructor(message: string, status: number, errors: KlaviyoCampaignApiErrorBody[]) {
    super(message);
    this.name = "KlaviyoCampaignApiError";
    this.status = status;
    this.errors = errors;
  }
}

export type KlaviyoCampaignMessage = {
  id: string;
  type: string | null;
  label: string | null;
  name: string | null;
  channel: string | null;
  subject: string | null;
  previewText: string | null;
  created: string | null;
  updated: string | null;
  rawRelationshipIds?: Record<string, string[]>;
  definition?: unknown;
};

export type KlaviyoCampaign = {
  id: string;
  name: string;
  status: string | null;
  channel: string | null;
  subject: string | null;
  messageLabel: string | null;
  sendTime: string | null;
  scheduledAt: string | null;
  created: string | null;
  updated: string | null;
  archived: boolean;
  deleted: boolean;
  draft: boolean;
  audienceIds: string[];
  listIds: string[];
  segmentIds: string[];
  tagIds: string[];
  messageIds: string[];
  rawRelationshipIds?: Record<string, string[]>;
  messages?: KlaviyoCampaignMessage[];
};

export type ListKlaviyoCampaignsOptions = {
  limit?: number;
  includeDrafts?: boolean;
  includeMessages?: boolean;
};

export type ListKlaviyoCampaignsResult = {
  ok: true;
  readOnly: true;
  count: number;
  campaigns: KlaviyoCampaign[];
  caveats: string[];
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
  links?: {
    next?: string | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getKlaviyoCampaignConfig(): KlaviyoCampaignConfigResult {
  const apiKey = cleanEnv(process.env.KLAVIYO_API_KEY);
  const revision = cleanEnv(process.env.KLAVIYO_API_REVISION);
  const draftOnly = cleanEnv(process.env.KLAVIYO_DRAFT_ONLY);

  const missingConfig = [
    !apiKey ? "KLAVIYO_API_KEY" : null,
    !revision ? "KLAVIYO_API_REVISION" : null,
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
      draftOnly: true,
    },
  };
}

function safeKlaviyoErrors(body: unknown): KlaviyoCampaignApiErrorBody[] {
  if (!body || typeof body !== "object" || !("errors" in body) || !Array.isArray((body as JsonApiResource).errors)) {
    return [];
  }

  return ((body as JsonApiResource).errors ?? []).map((error) => ({
    status: Number(error.status) || 0,
    title: typeof error.title === "string" ? error.title : "Klaviyo API error",
    detail: typeof error.detail === "string" ? error.detail : undefined,
  }));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function getNestedValue(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, value);
}

function relationshipIds(relationships: Record<string, unknown> | undefined, key: string) {
  const relationship = relationships?.[key];
  if (!isRecord(relationship)) return [];
  const data = relationship.data;

  if (Array.isArray(data)) {
    return data
      .map((item) => isRecord(item) && typeof item.id === "string" ? item.id : null)
      .filter((id): id is string => Boolean(id));
  }

  if (isRecord(data) && typeof data.id === "string") return [data.id];
  return [];
}

function compactRelationshipIds(relationships: Record<string, unknown> | undefined, keys: string[]) {
  const entries = keys
    .map((key) => [key, relationshipIds(relationships, key)] as const)
    .filter(([, ids]) => ids.length);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function firstRelationshipIds(relationships: Record<string, unknown> | undefined, keys: string[]) {
  return keys.flatMap((key) => relationshipIds(relationships, key));
}

function extractSubject(attributes: Record<string, unknown>) {
  return (
    stringValue(attributes.subject) ??
    stringValue(attributes.email_subject) ??
    stringValue(attributes.subject_line) ??
    stringValue(getNestedValue(attributes, ["content", "subject"])) ??
    stringValue(getNestedValue(attributes, ["definition", "subject"])) ??
    stringValue(getNestedValue(attributes, ["send_options", "subject"])) ??
    stringValue(getNestedValue(attributes, ["settings", "subject"])) ??
    null
  );
}

function extractPreviewText(attributes: Record<string, unknown>) {
  return (
    stringValue(attributes.preview_text) ??
    stringValue(attributes.previewText) ??
    stringValue(getNestedValue(attributes, ["content", "preview_text"])) ??
    stringValue(getNestedValue(attributes, ["definition", "preview_text"])) ??
    stringValue(getNestedValue(attributes, ["send_options", "preview_text"])) ??
    null
  );
}

function extractChannel(attributes: Record<string, unknown>) {
  return (
    stringValue(attributes.channel) ??
    stringValue(attributes.send_channel) ??
    stringValue(attributes.message_type) ??
    stringValue(attributes.type) ??
    stringValue(getNestedValue(attributes, ["send_options", "channel"])) ??
    stringValue(getNestedValue(attributes, ["definition", "channel"])) ??
    null
  );
}

function extractSendTime(attributes: Record<string, unknown>) {
  return (
    stringValue(attributes.send_time) ??
    stringValue(attributes.sent_at) ??
    stringValue(attributes.scheduled_at) ??
    stringValue(attributes.send_at) ??
    stringValue(getNestedValue(attributes, ["send_strategy", "datetime"])) ??
    stringValue(getNestedValue(attributes, ["send_strategy", "send_time"])) ??
    null
  );
}

function extractCampaign(resource: JsonApiData, fallbackChannel: string | null = null): KlaviyoCampaign | null {
  if (!resource.id) return null;

  const attributes = resource.attributes ?? {};
  const status = stringValue(attributes.status);
  const rawRelationships = compactRelationshipIds(resource.relationships, [
    "campaign-messages",
    "messages",
    "tags",
    "audiences",
    "lists",
    "segments",
    "included-audiences",
    "excluded-audiences",
  ]);
  const messageIds = firstRelationshipIds(resource.relationships, ["campaign-messages", "messages"]);
  const audienceIds = firstRelationshipIds(resource.relationships, ["audiences", "included-audiences", "excluded-audiences"]);
  const listIds = firstRelationshipIds(resource.relationships, ["lists"]);
  const segmentIds = firstRelationshipIds(resource.relationships, ["segments"]);
  const tagIds = firstRelationshipIds(resource.relationships, ["tags"]);

  return {
    id: resource.id,
    name: stringValue(attributes.name) ?? "Untitled Klaviyo campaign",
    status,
    channel: extractChannel(attributes) ?? fallbackChannel,
    subject: extractSubject(attributes),
    messageLabel: stringValue(attributes.label) ?? stringValue(attributes.message_label) ?? null,
    sendTime: extractSendTime(attributes),
    scheduledAt: stringValue(attributes.scheduled_at),
    created: stringValue(attributes.created_at) ?? stringValue(attributes.created),
    updated: stringValue(attributes.updated_at) ?? stringValue(attributes.updated),
    archived: booleanValue(attributes.archived),
    deleted: booleanValue(attributes.deleted),
    draft: normalizeText(status).includes("draft"),
    audienceIds,
    listIds,
    segmentIds,
    tagIds,
    messageIds,
    ...(rawRelationships ? { rawRelationshipIds: rawRelationships } : {}),
  };
}

function extractCampaignMessage(resource: JsonApiData): KlaviyoCampaignMessage | null {
  if (!resource.id) return null;

  const attributes = resource.attributes ?? {};
  const rawRelationships = compactRelationshipIds(resource.relationships, ["campaign", "template", "tags"]);

  return {
    id: resource.id,
    type: resource.type ?? null,
    label: stringValue(attributes.label),
    name: stringValue(attributes.name),
    channel: extractChannel(attributes),
    subject: extractSubject(attributes),
    previewText: extractPreviewText(attributes),
    created: stringValue(attributes.created_at) ?? stringValue(attributes.created),
    updated: stringValue(attributes.updated_at) ?? stringValue(attributes.updated),
    ...(rawRelationships ? { rawRelationshipIds: rawRelationships } : {}),
    definition: attributes.definition ?? attributes.content ?? undefined,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return 1100 * (attempt + 1);
}

function nextPath(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith(KLAVIYO_BASE_URL)) return value.slice(KLAVIYO_BASE_URL.length);
  if (value.startsWith("/api/")) return value.slice("/api".length);
  return value;
}

async function requestKlaviyoCampaignResource(config: KlaviyoCampaignConfig, path: string) {
  for (let attempt = 0; attempt <= MAX_READ_RETRIES; attempt += 1) {
    const response = await fetch(`${KLAVIYO_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Klaviyo-API-Key ${config.apiKey}`,
        revision: config.revision,
        Accept: JSON_API_CONTENT_TYPE,
      },
    });

    const responseBody = (await response.json().catch(() => null)) as JsonApiResource | null;
    if (response.ok) return (responseBody ?? {}) as JsonApiResource;

    if ((response.status === 429 || response.status === 503) && attempt < MAX_READ_RETRIES) {
      await sleep(retryDelayMs(response, attempt));
      continue;
    }

    throw new KlaviyoCampaignApiError(
      "Klaviyo campaign read failed.",
      response.status,
      safeKlaviyoErrors(responseBody),
    );
  }

  throw new KlaviyoCampaignApiError(
    "Klaviyo campaign read failed.",
    429,
    [{ status: 429, title: "Klaviyo campaign read was rate limited." }],
  );
}

async function collectKlaviyoResources(config: KlaviyoCampaignConfig, initialPath: string, maxPages: number) {
  const resources: JsonApiData[] = [];
  let path: string | null = initialPath;
  let pages = 0;

  while (path && pages < maxPages) {
    const response = await requestKlaviyoCampaignResource(config, path);
    const data = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
    resources.push(...data);
    path = nextPath(response.links?.next);
    pages += 1;
  }

  return resources;
}

function campaignListPath(channel: (typeof CAMPAIGN_CHANNELS)[number]) {
  const filter = encodeURIComponent(`equals(messages.channel,'${channel}')`);
  return `/campaigns?filter=${filter}&page[size]=50`;
}

async function collectCampaignsByChannel(config: KlaviyoCampaignConfig) {
  const campaigns = new Map<string, KlaviyoCampaign>();
  const caveats: string[] = [];

  for (const channel of CAMPAIGN_CHANNELS) {
    try {
      const resources = await collectKlaviyoResources(config, campaignListPath(channel), MAX_CAMPAIGN_PAGES);
      for (const resource of resources) {
        const campaign = extractCampaign(resource, channel);
        if (campaign && !campaigns.has(campaign.id)) campaigns.set(campaign.id, campaign);
      }
    } catch (error) {
      if (error instanceof KlaviyoCampaignApiError && (error.status === 400 || error.status === 404)) {
        caveats.push(`Klaviyo campaign read for channel ${channel} was unavailable; other channel reads continued.`);
        continue;
      }
      throw error;
    }
  }

  return {
    campaigns: Array.from(campaigns.values()),
    caveats,
  };
}

async function listCampaignMessages(config: KlaviyoCampaignConfig, campaignId: string) {
  const resources = await collectKlaviyoResources(
    config,
    `/campaigns/${encodeURIComponent(campaignId)}/campaign-messages`,
    2,
  );
  return resources.map(extractCampaignMessage).filter((message): message is KlaviyoCampaignMessage => Boolean(message));
}

async function hydrateCampaignMessages(config: KlaviyoCampaignConfig, campaigns: KlaviyoCampaign[]) {
  const caveats: string[] = [];
  const hydrated: KlaviyoCampaign[] = [];

  for (const campaign of campaigns) {
    if (hydrated.length >= MAX_CAMPAIGN_MESSAGE_READS) {
      hydrated.push(campaign);
      continue;
    }

    try {
      const messages = await listCampaignMessages(config, campaign.id);
      const firstMessage = messages[0];
      hydrated.push({
        ...campaign,
        messages,
        channel: campaign.channel ?? firstMessage?.channel ?? null,
        subject: campaign.subject ?? firstMessage?.subject ?? null,
        messageLabel: campaign.messageLabel ?? firstMessage?.label ?? firstMessage?.name ?? null,
        messageIds: campaign.messageIds.length ? campaign.messageIds : messages.map((message) => message.id),
      });
    } catch (error) {
      if (error instanceof KlaviyoCampaignApiError && (error.status === 400 || error.status === 404)) {
        caveats.push(`Campaign message details were unavailable for campaign ${campaign.id}; metadata read continued.`);
        hydrated.push(campaign);
        continue;
      }
      throw error;
    }
  }

  return { campaigns: hydrated, caveats };
}

function cleanLimit(value: number | null | undefined) {
  if (!value || !Number.isInteger(value) || value < 1) return 20;
  return Math.min(value, 50);
}

function isDraftLike(campaign: KlaviyoCampaign) {
  const status = normalizeText(campaign.status);
  return campaign.draft || status.includes("draft") || status.includes("scheduled");
}

export async function listKlaviyoCampaigns(
  config: KlaviyoCampaignConfig,
  options: ListKlaviyoCampaignsOptions = {},
): Promise<ListKlaviyoCampaignsResult> {
  const limit = cleanLimit(options.limit);
  const campaignRead = await collectCampaignsByChannel(config);
  const allCampaigns = campaignRead.campaigns
    .filter((campaign) => options.includeDrafts || !isDraftLike(campaign))
    .slice(0, limit);
  const messageResult = options.includeMessages === false
    ? { campaigns: allCampaigns, caveats: [] }
    : await hydrateCampaignMessages(config, allCampaigns);

  return {
    ok: true,
    readOnly: true,
    count: messageResult.campaigns.length,
    campaigns: messageResult.campaigns,
    caveats: [...campaignRead.caveats, ...messageResult.caveats],
  };
}
