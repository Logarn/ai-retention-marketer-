const KLAVIYO_BASE_URL = "https://a.klaviyo.com/api";
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";
const MAX_FLOW_PAGES = 10;

export type KlaviyoFlowConfig = {
  apiKey: string;
  revision: string;
  draftOnly: true;
};

export type KlaviyoFlowConfigResult =
  | { ok: true; config: KlaviyoFlowConfig }
  | { ok: false; missingConfig: string[] };

export type KlaviyoFlowApiErrorBody = {
  status: number;
  title: string;
  detail?: string;
};

export class KlaviyoFlowApiError extends Error {
  status: number;
  errors: KlaviyoFlowApiErrorBody[];

  constructor(message: string, status: number, errors: KlaviyoFlowApiErrorBody[]) {
    super(message);
    this.name = "KlaviyoFlowApiError";
    this.status = status;
    this.errors = errors;
  }
}

export type KlaviyoFlowAction = {
  id: string;
  type: string | null;
  name: string | null;
  status: string | null;
  actionType: string | null;
  definition?: unknown;
};

export type KlaviyoFlow = {
  id: string;
  name: string;
  status: string | null;
  archived: boolean;
  created: string | null;
  updated: string | null;
  triggerType: string | null;
  definition?: unknown;
  actionCount: number | null;
  actions?: KlaviyoFlowAction[];
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

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getKlaviyoFlowConfig(): KlaviyoFlowConfigResult {
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

function safeKlaviyoErrors(body: unknown): KlaviyoFlowApiErrorBody[] {
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

function getNestedRecord(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === "object" && !Array.isArray(nested) ? nested as Record<string, unknown> : null;
}

function relationshipCount(relationships: Record<string, unknown> | undefined, key: string) {
  const relationship = relationships?.[key];
  if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) return null;
  const data = (relationship as Record<string, unknown>).data;
  if (Array.isArray(data)) return data.length;
  return null;
}

function extractTriggerType(attributes: Record<string, unknown>) {
  const definition = attributes.definition;
  return (
    stringValue(attributes.trigger_type) ??
    stringValue(attributes.triggerType) ??
    stringValue(getNestedRecord(definition, "trigger")?.type) ??
    stringValue(getNestedRecord(definition, "trigger")?.trigger_type) ??
    null
  );
}

function extractFlow(resource: JsonApiData): KlaviyoFlow | null {
  if (!resource.id) return null;

  const attributes = resource.attributes ?? {};
  const name = stringValue(attributes.name) ?? "Untitled Klaviyo flow";
  const definition = attributes.definition;
  const actionCount =
    relationshipCount(resource.relationships, "flow-actions") ??
    relationshipCount(resource.relationships, "actions");

  return {
    id: resource.id,
    name,
    status: stringValue(attributes.status),
    archived: booleanValue(attributes.archived),
    created: stringValue(attributes.created),
    updated: stringValue(attributes.updated),
    triggerType: extractTriggerType(attributes),
    definition: definition ?? undefined,
    actionCount,
  };
}

function nextPath(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith(KLAVIYO_BASE_URL)) return value.slice(KLAVIYO_BASE_URL.length);
  if (value.startsWith("/api/")) return value.slice("/api".length);
  return value;
}

async function requestKlaviyoFlowResource(config: KlaviyoFlowConfig, path: string) {
  const response = await fetch(`${KLAVIYO_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Klaviyo-API-Key ${config.apiKey}`,
      revision: config.revision,
      Accept: JSON_API_CONTENT_TYPE,
    },
  });

  const responseBody = (await response.json().catch(() => null)) as JsonApiResource | null;
  if (!response.ok) {
    throw new KlaviyoFlowApiError(
      "Klaviyo flow read failed.",
      response.status,
      safeKlaviyoErrors(responseBody),
    );
  }

  return (responseBody ?? {}) as JsonApiResource;
}

export async function listKlaviyoFlows(config: KlaviyoFlowConfig) {
  const flows: KlaviyoFlow[] = [];
  let path: string | null = "/flows";
  let pages = 0;

  while (path && pages < MAX_FLOW_PAGES) {
    const response = await requestKlaviyoFlowResource(config, path);
    const data = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];

    for (const resource of data) {
      const flow = extractFlow(resource);
      if (flow) flows.push(flow);
    }

    path = nextPath(response.links?.next);
    pages += 1;
  }

  return flows;
}
