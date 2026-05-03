const KLAVIYO_BASE_URL = "https://a.klaviyo.com/api";
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";
const MAX_FLOW_PAGES = 10;
const MAX_FLOW_ACTION_PAGES = 5;
const MAX_FLOW_MESSAGE_PAGES = 5;
const MAX_READ_RETRIES = 2;

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
  channel: string | null;
  created: string | null;
  updated: string | null;
  timing: string | null;
  delay?: unknown;
  messageCount: number | null;
  rawRelationshipIds?: Record<string, string[]>;
  definition?: unknown;
};

export type KlaviyoFlowMessage = {
  id: string;
  type: string | null;
  name: string | null;
  status: string | null;
  channel: string | null;
  subject: string | null;
  created: string | null;
  updated: string | null;
};

export type KlaviyoFlowActionDetail = KlaviyoFlowAction & {
  messages: KlaviyoFlowMessage[];
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
  rawRelationshipIds?: Record<string, string[]>;
  actions?: KlaviyoFlowAction[] | KlaviyoFlowActionDetail[];
};

export type KlaviyoFlowDetail = KlaviyoFlow & {
  actions: KlaviyoFlowActionDetail[];
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
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function getNestedValue(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, value);
}

function relationshipCount(relationships: Record<string, unknown> | undefined, key: string) {
  const relationship = relationships?.[key];
  if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) return null;
  const data = (relationship as Record<string, unknown>).data;
  if (Array.isArray(data)) return data.length;
  return null;
}

function relationshipIds(relationships: Record<string, unknown> | undefined, key: string) {
  const relationship = relationships?.[key];
  if (!isRecord(relationship)) return [];
  const data = relationship.data;
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => isRecord(item) && typeof item.id === "string" ? item.id : null)
    .filter((id): id is string => Boolean(id));
}

function compactRelationshipIds(relationships: Record<string, unknown> | undefined, keys: string[]) {
  const entries = keys
    .map((key) => [key, relationshipIds(relationships, key)] as const)
    .filter(([, ids]) => ids.length);
  return entries.length ? Object.fromEntries(entries) : undefined;
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

function extractActionTiming(attributes: Record<string, unknown>) {
  return (
    stringValue(attributes.timing) ??
    stringValue(attributes.delay) ??
    stringValue(attributes.wait) ??
    stringValue(attributes.wait_time) ??
    stringValue(getNestedValue(attributes, ["definition", "timing"])) ??
    stringValue(getNestedValue(attributes, ["definition", "delay"])) ??
    stringValue(getNestedValue(attributes, ["settings", "timing"])) ??
    stringValue(getNestedValue(attributes, ["settings", "delay"])) ??
    null
  );
}

function extractActionDelay(attributes: Record<string, unknown>) {
  return (
    attributes.delay ??
    attributes.wait ??
    attributes.wait_time ??
    getNestedValue(attributes, ["definition", "delay"]) ??
    getNestedValue(attributes, ["settings", "delay"]) ??
    undefined
  );
}

function extractMessageSubject(attributes: Record<string, unknown>) {
  return (
    stringValue(attributes.subject) ??
    stringValue(attributes.email_subject) ??
    stringValue(getNestedValue(attributes, ["content", "subject"])) ??
    stringValue(getNestedValue(attributes, ["definition", "subject"])) ??
    stringValue(getNestedValue(attributes, ["settings", "subject"])) ??
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
    rawRelationshipIds: compactRelationshipIds(resource.relationships, ["flow-actions", "actions", "tags"]),
  };
}

function extractFlowAction(resource: JsonApiData): KlaviyoFlowAction | null {
  if (!resource.id) return null;

  const attributes = resource.attributes ?? {};
  const definition = attributes.definition;
  const messageCount =
    relationshipCount(resource.relationships, "flow-messages") ??
    relationshipCount(resource.relationships, "messages");
  const delay = extractActionDelay(attributes);

  return {
    id: resource.id,
    type: resource.type ?? null,
    name: stringValue(attributes.name),
    status: stringValue(attributes.status),
    actionType: stringValue(attributes.action_type) ?? stringValue(attributes.actionType),
    channel: stringValue(attributes.channel) ?? stringValue(attributes.message_type),
    created: stringValue(attributes.created),
    updated: stringValue(attributes.updated),
    timing: extractActionTiming(attributes),
    ...(delay !== undefined ? { delay } : {}),
    messageCount,
    rawRelationshipIds: compactRelationshipIds(resource.relationships, ["flow", "flow-messages", "messages"]),
    definition: definition ?? undefined,
  };
}

function extractFlowMessage(resource: JsonApiData): KlaviyoFlowMessage | null {
  if (!resource.id) return null;

  const attributes = resource.attributes ?? {};

  return {
    id: resource.id,
    type: resource.type ?? null,
    name: stringValue(attributes.name),
    status: stringValue(attributes.status),
    channel: stringValue(attributes.channel) ?? stringValue(attributes.message_type),
    subject: extractMessageSubject(attributes),
    created: stringValue(attributes.created),
    updated: stringValue(attributes.updated),
  };
}

function nextPath(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith(KLAVIYO_BASE_URL)) return value.slice(KLAVIYO_BASE_URL.length);
  if (value.startsWith("/api/")) return value.slice("/api".length);
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return 1100 * (attempt + 1);
}

async function requestKlaviyoFlowResource(config: KlaviyoFlowConfig, path: string) {
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
    if (response.ok) {
      return (responseBody ?? {}) as JsonApiResource;
    }

    if (response.status === 429 && attempt < MAX_READ_RETRIES) {
      await sleep(retryDelayMs(response, attempt));
      continue;
    }

    throw new KlaviyoFlowApiError(
      "Klaviyo flow read failed.",
      response.status,
      safeKlaviyoErrors(responseBody),
    );
  }

  throw new KlaviyoFlowApiError(
    "Klaviyo flow read failed.",
    429,
    [{ status: 429, title: "Klaviyo flow read was rate limited." }],
  );
}

async function collectKlaviyoResources(config: KlaviyoFlowConfig, initialPath: string, maxPages: number) {
  const resources: JsonApiData[] = [];
  let path: string | null = initialPath;
  let pages = 0;

  while (path && pages < maxPages) {
    const response = await requestKlaviyoFlowResource(config, path);
    const data = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
    resources.push(...data);
    path = nextPath(response.links?.next);
    pages += 1;
  }

  return resources;
}

export async function listKlaviyoFlows(config: KlaviyoFlowConfig) {
  const resources = await collectKlaviyoResources(config, "/flows", MAX_FLOW_PAGES);
  return resources.map(extractFlow).filter((flow): flow is KlaviyoFlow => Boolean(flow));
}

export async function getKlaviyoFlow(config: KlaviyoFlowConfig, flowId: string) {
  const response = await requestKlaviyoFlowResource(config, `/flows/${encodeURIComponent(flowId)}`);
  const resource = Array.isArray(response.data) ? response.data[0] : response.data;
  const flow = resource ? extractFlow(resource) : null;

  if (!flow) {
    throw new KlaviyoFlowApiError(
      "Klaviyo flow not found.",
      404,
      [{ status: 404, title: "Flow not found" }],
    );
  }

  return flow;
}

export async function listKlaviyoFlowActions(config: KlaviyoFlowConfig, flowId: string) {
  const resources = await collectKlaviyoResources(
    config,
    `/flows/${encodeURIComponent(flowId)}/flow-actions`,
    MAX_FLOW_ACTION_PAGES,
  );
  return resources.map(extractFlowAction).filter((action): action is KlaviyoFlowAction => Boolean(action));
}

export async function getKlaviyoFlowAction(config: KlaviyoFlowConfig, actionId: string) {
  const response = await requestKlaviyoFlowResource(config, `/flow-actions/${encodeURIComponent(actionId)}`);
  const resource = Array.isArray(response.data) ? response.data[0] : response.data;
  const action = resource ? extractFlowAction(resource) : null;

  if (!action) {
    throw new KlaviyoFlowApiError(
      "Klaviyo flow action not found.",
      404,
      [{ status: 404, title: "Flow action not found" }],
    );
  }

  return action;
}

export async function listKlaviyoFlowActionMessages(config: KlaviyoFlowConfig, actionId: string) {
  const resources = await collectKlaviyoResources(
    config,
    `/flow-actions/${encodeURIComponent(actionId)}/flow-messages`,
    MAX_FLOW_MESSAGE_PAGES,
  );
  return resources.map(extractFlowMessage).filter((message): message is KlaviyoFlowMessage => Boolean(message));
}

export async function getKlaviyoFlowDetail(config: KlaviyoFlowConfig, flowId: string): Promise<KlaviyoFlowDetail> {
  const flow = await getKlaviyoFlow(config, flowId);
  const actions = await listKlaviyoFlowActions(config, flow.id);
  const actionsWithMessages: KlaviyoFlowActionDetail[] = [];

  for (const action of actions) {
    const detailedAction = await getKlaviyoFlowAction(config, action.id).catch((error) => {
      if (error instanceof KlaviyoFlowApiError && error.status === 404) return action;
      throw error;
    });
    const messages = await listKlaviyoFlowActionMessages(config, action.id);
    actionsWithMessages.push({
      ...action,
      ...detailedAction,
      messages,
    });
  }

  return {
    ...flow,
    actionCount: flow.actionCount ?? actionsWithMessages.length,
    actions: actionsWithMessages,
  };
}
