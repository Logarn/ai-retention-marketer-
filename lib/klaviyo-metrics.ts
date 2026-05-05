const KLAVIYO_BASE_URL = "https://a.klaviyo.com/api";
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";
const MAX_METRIC_PAGES = 4;
const MAX_READ_RETRIES = 2;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

export type KlaviyoMetricConfig = {
  apiKey: string;
  revision: string;
  draftOnly: true;
};

export type KlaviyoMetricConfigResult =
  | { ok: true; config: KlaviyoMetricConfig }
  | { ok: false; missingConfig: string[] };

export type KlaviyoMetricApiErrorBody = {
  status: number;
  title: string;
  detail?: string;
};

export class KlaviyoMetricApiError extends Error {
  status: number;
  errors: KlaviyoMetricApiErrorBody[];

  constructor(message: string, status: number, errors: KlaviyoMetricApiErrorBody[]) {
    super(message);
    this.name = "KlaviyoMetricApiError";
    this.status = status;
    this.errors = errors;
  }
}

export type KlaviyoMetric = {
  id: string;
  name: string;
  integration: string | null;
  source: string | null;
  created: string | null;
  updated: string | null;
  metadata: {
    sourceType: string | null;
    attributeKeys: string[];
    relationshipKeys: string[];
    integrationAvailable: boolean;
  };
};

export type ListKlaviyoMetricsOptions = {
  limit?: number;
};

export type ListKlaviyoMetricsResult = {
  ok: true;
  readOnly: true;
  count: number;
  metrics: KlaviyoMetric[];
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

export function getKlaviyoMetricConfig(): KlaviyoMetricConfigResult {
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

function safeKlaviyoErrors(body: unknown): KlaviyoMetricApiErrorBody[] {
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

function getNestedString(value: unknown, path: string[]) {
  const nested = path.reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, value);
  return stringValue(nested);
}

function relationshipKeys(relationships: Record<string, unknown> | undefined) {
  return Object.keys(relationships ?? {}).sort();
}

function integrationName(attributes: Record<string, unknown>) {
  const integration = attributes.integration;

  return (
    stringValue(integration) ??
    getNestedString(integration, ["name"]) ??
    getNestedString(integration, ["key"]) ??
    getNestedString(integration, ["category"]) ??
    stringValue(attributes.integration_name) ??
    stringValue(attributes.integrationName) ??
    stringValue(attributes.service) ??
    stringValue(attributes.source) ??
    stringValue(attributes.source_name) ??
    getNestedString(attributes, ["integration", "display_name"]) ??
    null
  );
}

function sourceName(attributes: Record<string, unknown>, integration: string | null) {
  return (
    stringValue(attributes.source) ??
    stringValue(attributes.source_name) ??
    stringValue(attributes.platform) ??
    stringValue(attributes.service) ??
    integration ??
    null
  );
}

function extractMetric(resource: JsonApiData): KlaviyoMetric | null {
  if (!resource.id) return null;

  const attributes = resource.attributes ?? {};
  const relationships = resource.relationships ?? {};
  const integration = integrationName(attributes);
  const source = sourceName(attributes, integration);

  return {
    id: resource.id,
    name: stringValue(attributes.name) ?? "Untitled Klaviyo metric",
    integration,
    source,
    created: stringValue(attributes.created_at) ?? stringValue(attributes.created),
    updated: stringValue(attributes.updated_at) ?? stringValue(attributes.updated),
    metadata: {
      sourceType: resource.type ?? null,
      attributeKeys: Object.keys(attributes).sort(),
      relationshipKeys: relationshipKeys(relationships),
      integrationAvailable: Boolean(integration ?? source),
    },
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

async function requestKlaviyoMetricResource(config: KlaviyoMetricConfig, path: string) {
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

    throw new KlaviyoMetricApiError(
      "Klaviyo metric read failed.",
      response.status,
      safeKlaviyoErrors(responseBody),
    );
  }

  throw new KlaviyoMetricApiError(
    "Klaviyo metric read failed.",
    429,
    [{ status: 429, title: "Klaviyo metric read was rate limited." }],
  );
}

async function collectKlaviyoMetricResources(config: KlaviyoMetricConfig, limit: number) {
  const resources: JsonApiData[] = [];
  let path: string | null = "/metrics?page[size]=100";
  let pages = 0;

  while (path && pages < MAX_METRIC_PAGES && resources.length < limit) {
    const response = await requestKlaviyoMetricResource(config, path);
    const data = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
    resources.push(...data);
    path = nextPath(response.links?.next);
    pages += 1;
  }

  return resources.slice(0, limit);
}

function cleanLimit(value: number | null | undefined) {
  if (!value || !Number.isInteger(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

function unavailableCaveat(error: KlaviyoMetricApiError) {
  const permission = error.status === 401 || error.status === 403;
  const badRequest = error.status === 400 || error.status === 404;
  if (permission) {
    return "Klaviyo metric read is unavailable. Check API key permissions for metrics read access.";
  }
  if (badRequest) {
    return "Klaviyo metric read was unsupported for this account or API revision; metric discovery continued without metric inventory.";
  }
  return null;
}

export async function listKlaviyoMetrics(
  config: KlaviyoMetricConfig,
  options: ListKlaviyoMetricsOptions = {},
): Promise<ListKlaviyoMetricsResult> {
  const limit = cleanLimit(options.limit);

  try {
    const resources = await collectKlaviyoMetricResources(config, limit);
    const metrics = resources
      .map((resource) => extractMetric(resource))
      .filter((metric): metric is KlaviyoMetric => Boolean(metric));

    return {
      ok: true,
      readOnly: true,
      count: metrics.length,
      metrics,
      caveats: metrics.length
        ? []
        : ["No Klaviyo metrics were returned. Confirm the API key has metric read access and that commerce events are synced."],
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof KlaviyoMetricApiError) {
      const caveat = unavailableCaveat(error);
      if (caveat) {
        return {
          ok: true,
          readOnly: true,
          count: 0,
          metrics: [],
          caveats: [caveat],
          generatedAt: new Date().toISOString(),
        };
      }
    }

    throw error;
  }
}
