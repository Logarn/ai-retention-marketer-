const KLAVIYO_BASE_URL = "https://a.klaviyo.com/api";
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";
const MAX_AUDIENCE_PAGES = 4;
const MAX_READ_RETRIES = 2;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

export type KlaviyoAudienceConfig = {
  apiKey: string;
  revision: string;
  draftOnly: true;
};

export type KlaviyoAudienceConfigResult =
  | { ok: true; config: KlaviyoAudienceConfig }
  | { ok: false; missingConfig: string[] };

export type KlaviyoAudienceApiErrorBody = {
  status: number;
  title: string;
  detail?: string;
};

export class KlaviyoAudienceApiError extends Error {
  status: number;
  errors: KlaviyoAudienceApiErrorBody[];

  constructor(message: string, status: number, errors: KlaviyoAudienceApiErrorBody[]) {
    super(message);
    this.name = "KlaviyoAudienceApiError";
    this.status = status;
    this.errors = errors;
  }
}

export type KlaviyoAudienceType = "list" | "segment";

export type KlaviyoAudience = {
  id: string;
  name: string;
  type: KlaviyoAudienceType;
  created: string | null;
  updated: string | null;
  profileCount: number | null;
  memberCount: number | null;
  archived: boolean;
  deleted: boolean;
  metadata: {
    sourceType: string | null;
    attributeKeys: string[];
    relationshipKeys: string[];
    definitionAvailable: boolean;
    profileCountAvailable: boolean;
  };
  rawRelationshipIds?: Record<string, string[]>;
};

export type ListKlaviyoAudiencesOptions = {
  limit?: number;
  includeLists?: boolean;
  includeSegments?: boolean;
};

export type ListKlaviyoAudiencesResult = {
  ok: true;
  readOnly: true;
  count: number;
  lists: KlaviyoAudience[];
  segments: KlaviyoAudience[];
  audiences: KlaviyoAudience[];
  caveats: string[];
  generatedAt: string;
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

export function getKlaviyoAudienceConfig(): KlaviyoAudienceConfigResult {
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

function safeKlaviyoErrors(body: unknown): KlaviyoAudienceApiErrorBody[] {
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

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function profileCount(attributes: Record<string, unknown>) {
  return (
    numberValue(attributes.profile_count) ??
    numberValue(attributes.profiles_count) ??
    numberValue(attributes.member_count) ??
    numberValue(attributes.members_count) ??
    numberValue(attributes.subscriber_count) ??
    numberValue(attributes.person_count) ??
    numberValue(getNestedValue(attributes, ["statistics", "profile_count"])) ??
    numberValue(getNestedValue(attributes, ["statistics", "member_count"])) ??
    null
  );
}

function normalizeAudienceType(resource: JsonApiData, fallback: KlaviyoAudienceType): KlaviyoAudienceType {
  const type = (resource.type ?? "").toLowerCase();
  if (type.includes("segment")) return "segment";
  if (type.includes("list")) return "list";
  return fallback;
}

function extractAudience(resource: JsonApiData, fallbackType: KlaviyoAudienceType): KlaviyoAudience | null {
  if (!resource.id) return null;

  const attributes = resource.attributes ?? {};
  const relationships = resource.relationships ?? {};
  const type = normalizeAudienceType(resource, fallbackType);
  const count = profileCount(attributes);
  const rawRelationships = compactRelationshipIds(relationships, ["profiles", "tags", "segments", "lists"]);

  return {
    id: resource.id,
    name: stringValue(attributes.name) ?? `Untitled Klaviyo ${type}`,
    type,
    created: stringValue(attributes.created_at) ?? stringValue(attributes.created),
    updated: stringValue(attributes.updated_at) ?? stringValue(attributes.updated),
    profileCount: count,
    memberCount: count,
    archived: booleanValue(attributes.archived),
    deleted: booleanValue(attributes.deleted),
    metadata: {
      sourceType: resource.type ?? null,
      attributeKeys: Object.keys(attributes).sort(),
      relationshipKeys: Object.keys(relationships).sort(),
      definitionAvailable: Boolean(attributes.definition ?? attributes.conditions ?? attributes.filter),
      profileCountAvailable: count !== null,
    },
    ...(rawRelationships ? { rawRelationshipIds: rawRelationships } : {}),
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

async function requestKlaviyoAudienceResource(config: KlaviyoAudienceConfig, path: string) {
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

    throw new KlaviyoAudienceApiError(
      "Klaviyo audience read failed.",
      response.status,
      safeKlaviyoErrors(responseBody),
    );
  }

  throw new KlaviyoAudienceApiError(
    "Klaviyo audience read failed.",
    429,
    [{ status: 429, title: "Klaviyo audience read was rate limited." }],
  );
}

async function collectKlaviyoResources(config: KlaviyoAudienceConfig, initialPath: string, maxPages: number) {
  const resources: JsonApiData[] = [];
  let path: string | null = initialPath;
  let pages = 0;

  while (path && pages < maxPages) {
    const response = await requestKlaviyoAudienceResource(config, path);
    const data = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
    resources.push(...data);
    path = nextPath(response.links?.next);
    pages += 1;
  }

  return resources;
}

function cleanLimit(value: number | null | undefined) {
  if (!value || !Number.isInteger(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

function endpointPath(type: KlaviyoAudienceType) {
  return `/${type === "list" ? "lists" : "segments"}?page[size]=100`;
}

function unavailableCaveat(type: KlaviyoAudienceType, error: KlaviyoAudienceApiError) {
  const permission = error.status === 401 || error.status === 403;
  const badRequest = error.status === 400 || error.status === 404;
  if (permission) {
    return `Klaviyo ${type} read is unavailable. Check API key permissions for ${type}s read access.`;
  }
  if (badRequest) {
    return `Klaviyo ${type} read was unsupported for this account or revision; audience audit continued with available data.`;
  }
  return null;
}

async function collectAudienceType(config: KlaviyoAudienceConfig, type: KlaviyoAudienceType) {
  try {
    const resources = await collectKlaviyoResources(config, endpointPath(type), MAX_AUDIENCE_PAGES);
    return {
      audiences: resources.map((resource) => extractAudience(resource, type)).filter((item): item is KlaviyoAudience => Boolean(item)),
      caveats: [] as string[],
    };
  } catch (error) {
    if (error instanceof KlaviyoAudienceApiError) {
      const caveat = unavailableCaveat(type, error);
      if (caveat) return { audiences: [] as KlaviyoAudience[], caveats: [caveat] };
    }
    throw error;
  }
}

export async function listKlaviyoAudiences(
  config: KlaviyoAudienceConfig,
  options: ListKlaviyoAudiencesOptions = {},
): Promise<ListKlaviyoAudiencesResult> {
  const limit = cleanLimit(options.limit);
  const includeLists = options.includeLists !== false;
  const includeSegments = options.includeSegments !== false;

  const listResult = includeLists
    ? await collectAudienceType(config, "list")
    : { audiences: [] as KlaviyoAudience[], caveats: ["Klaviyo list read was skipped by request."] };
  const segmentResult = includeSegments
    ? await collectAudienceType(config, "segment")
    : { audiences: [] as KlaviyoAudience[], caveats: ["Klaviyo segment read was skipped by request."] };

  const lists = listResult.audiences.slice(0, limit);
  const segments = segmentResult.audiences.slice(0, limit);
  const audiences = [...lists, ...segments].slice(0, limit);

  return {
    ok: true,
    readOnly: true,
    count: audiences.length,
    lists,
    segments,
    audiences,
    caveats: [...listResult.caveats, ...segmentResult.caveats],
    generatedAt: new Date().toISOString(),
  };
}
