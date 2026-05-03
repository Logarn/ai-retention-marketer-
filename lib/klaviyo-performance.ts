const KLAVIYO_BASE_URL = "https://a.klaviyo.com/api";
const JSON_CONTENT_TYPE = "application/json";
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";
const MAX_READ_RETRIES = 2;
const MAX_REPORT_WINDOW_DAYS = 365;

export type KlaviyoPerformanceType = "flow" | "campaign" | "segment";
export type KlaviyoPerformanceTimeframe =
  | "last_30_days"
  | "last_90_days"
  | "last_365_days"
  | "lifetime"
  | "custom";

export type KlaviyoPerformanceConfig = {
  apiKey: string;
  revision: string;
  draftOnly: true;
  conversionMetricId?: string;
};

export type KlaviyoPerformanceConfigResult =
  | { ok: true; config: KlaviyoPerformanceConfig }
  | { ok: false; missingConfig: string[] };

export type KlaviyoPerformanceApiErrorBody = {
  status: number;
  title: string;
  detail?: string;
};

export class KlaviyoPerformanceApiError extends Error {
  status: number;
  errors: KlaviyoPerformanceApiErrorBody[];

  constructor(message: string, status: number, errors: KlaviyoPerformanceApiErrorBody[]) {
    super(message);
    this.name = "KlaviyoPerformanceApiError";
    this.status = status;
    this.errors = errors;
  }
}

export type QueryKlaviyoPerformanceInput = {
  type: KlaviyoPerformanceType;
  timeframe: KlaviyoPerformanceTimeframe;
  startDate?: string;
  endDate?: string;
  ids?: string[];
  statistics?: string[];
  conversionMetricId?: string;
};

export type NormalizedKlaviyoPerformanceRow = {
  id: string;
  name: string | null;
  type: KlaviyoPerformanceType;
  channel: string | null;
  timeframe: {
    key: KlaviyoPerformanceTimeframe;
    providerKey?: string;
    start: string | null;
    end: string | null;
    label: string;
    cappedByProviderLimit?: boolean;
  };
  statistics: Record<string, unknown>;
  rawAvailable: boolean;
  missingMetrics: string[];
  source: {
    endpoint: string;
    reportType: string;
    groupings: Record<string, unknown>;
  };
};

const AUDIT_STATISTICS = [
  "recipients",
  "delivered",
  "delivery_rate",
  "opens",
  "opens_unique",
  "open_rate",
  "clicks",
  "clicks_unique",
  "click_rate",
  "conversions",
  "conversion_uniques",
  "conversion_rate",
  "conversion_value",
  "revenue_per_recipient",
  "unsubscribe_uniques",
  "unsubscribes",
  "unsubscribe_rate",
  "spam_complaints",
  "spam_complaint_rate",
  "bounced",
  "bounce_rate",
] as const;

const SEGMENT_STATISTICS = [
  "total_members",
  "members_added",
  "members_removed",
  "net_members_changed",
] as const;

const TIMEFRAME_LABELS: Record<KlaviyoPerformanceTimeframe, string> = {
  last_30_days: "current health",
  last_90_days: "recent trend",
  last_365_days: "audit benchmark",
  lifetime: "historical context only",
  custom: "custom audit window",
};

const REPORT_CONFIG: Record<KlaviyoPerformanceType, {
  endpoint: string;
  reportType: string;
  idField: string;
  nameField: string | null;
  messageNameField: string | null;
  groupBy: string[];
  requiresConversionMetric: boolean;
}> = {
  flow: {
    endpoint: "/flow-values-reports",
    reportType: "flow-values-report",
    idField: "flow_id",
    nameField: "flow_name",
    messageNameField: "flow_message_name",
    groupBy: ["flow_message_id", "flow_id", "flow_name", "flow_message_name", "send_channel"],
    requiresConversionMetric: true,
  },
  campaign: {
    endpoint: "/campaign-values-reports",
    reportType: "campaign-values-report",
    idField: "campaign_id",
    nameField: null,
    messageNameField: "campaign_message_name",
    groupBy: ["campaign_message_id", "campaign_id", "campaign_message_name", "send_channel"],
    requiresConversionMetric: true,
  },
  segment: {
    endpoint: "/segment-values-reports",
    reportType: "segment-values-report",
    idField: "segment_id",
    nameField: null,
    messageNameField: null,
    groupBy: [],
    requiresConversionMetric: false,
  },
};

type JsonApiResource = {
  data?: {
    id?: string;
    type?: string;
    attributes?: {
      results?: Array<{
        groupings?: Record<string, unknown>;
        statistics?: Record<string, unknown>;
      }>;
    };
  };
  errors?: Array<Record<string, unknown>>;
};

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getKlaviyoPerformanceConfig(): KlaviyoPerformanceConfigResult {
  const apiKey = cleanEnv(process.env.KLAVIYO_API_KEY);
  const revision = cleanEnv(process.env.KLAVIYO_API_REVISION);
  const draftOnly = cleanEnv(process.env.KLAVIYO_DRAFT_ONLY);
  const conversionMetricId = cleanEnv(process.env.KLAVIYO_CONVERSION_METRIC_ID) ?? undefined;

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
      ...(conversionMetricId ? { conversionMetricId } : {}),
    },
  };
}

function safeKlaviyoErrors(body: unknown): KlaviyoPerformanceApiErrorBody[] {
  if (!body || typeof body !== "object" || !("errors" in body) || !Array.isArray((body as JsonApiResource).errors)) {
    return [];
  }

  return ((body as JsonApiResource).errors ?? []).map((error) => ({
    status: Number(error.status) || 0,
    title: typeof error.title === "string" ? error.title : "Klaviyo API error",
    detail: typeof error.detail === "string" ? error.detail : undefined,
  }));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return 1100 * (attempt + 1);
}

async function requestKlaviyoPerformanceResource(
  config: KlaviyoPerformanceConfig,
  endpoint: string,
  body: unknown,
) {
  for (let attempt = 0; attempt <= MAX_READ_RETRIES; attempt += 1) {
    const response = await fetch(`${KLAVIYO_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${config.apiKey}`,
        revision: config.revision,
        Accept: JSON_API_CONTENT_TYPE,
        "Content-Type": JSON_CONTENT_TYPE,
      },
      body: JSON.stringify(body),
    });

    const responseBody = (await response.json().catch(() => null)) as JsonApiResource | null;
    if (response.ok) return (responseBody ?? {}) as JsonApiResource;

    if ((response.status === 429 || response.status === 503) && attempt < MAX_READ_RETRIES) {
      await sleep(retryDelayMs(response, attempt));
      continue;
    }

    throw new KlaviyoPerformanceApiError(
      "Klaviyo performance read failed.",
      response.status,
      safeKlaviyoErrors(responseBody),
    );
  }

  throw new KlaviyoPerformanceApiError(
    "Klaviyo performance read failed.",
    429,
    [{ status: 429, title: "Klaviyo performance read was rate limited." }],
  );
}

function validStatistic(value: string) {
  return /^[a-z0-9_]+$/.test(value);
}

function uniqueStatistics(statistics: string[] | undefined, type: KlaviyoPerformanceType) {
  const defaults = type === "segment" ? [...SEGMENT_STATISTICS] : [...AUDIT_STATISTICS];
  const requested = (statistics?.length ? statistics : defaults)
    .map((statistic) => statistic.trim())
    .filter((statistic) => statistic && validStatistic(statistic));
  return Array.from(new Set(requested)).slice(0, 30);
}

function conversionStatistics(statistics: string[]) {
  return statistics.filter((statistic) =>
    [
      "average_order_value",
      "conversion_rate",
      "conversion_uniques",
      "conversion_value",
      "conversions",
      "revenue_per_recipient",
    ].includes(statistic),
  );
}

function normalizeDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateRangeDays(start: string, end: string) {
  return (new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000);
}

function timeframePayload(input: QueryKlaviyoPerformanceInput) {
  if (input.timeframe === "custom") {
    const start = normalizeDate(input.startDate);
    const end = normalizeDate(input.endDate);
    if (!start || !end) {
      throw new KlaviyoPerformanceApiError(
        "Invalid custom timeframe.",
        400,
        [{ status: 400, title: "Custom timeframe requires valid startDate and endDate." }],
      );
    }

    const rangeDays = dateRangeDays(start, end);
    if (rangeDays <= 0 || rangeDays > MAX_REPORT_WINDOW_DAYS) {
      throw new KlaviyoPerformanceApiError(
        "Invalid custom timeframe.",
        400,
        [{ status: 400, title: "Custom timeframe must be greater than 0 days and no more than 365 days." }],
      );
    }

    return {
      payload: { start, end },
      normalized: {
        key: input.timeframe,
        start,
        end,
        label: TIMEFRAME_LABELS[input.timeframe],
      },
    };
  }

  if (input.timeframe === "lifetime") {
    // Klaviyo values reports currently cap requested windows at one year.
    return {
      payload: { key: "last_365_days" },
      normalized: {
        key: input.timeframe,
        providerKey: "last_365_days",
        start: null,
        end: null,
        label: TIMEFRAME_LABELS[input.timeframe],
        cappedByProviderLimit: true,
      },
    };
  }

  return {
    payload: { key: input.timeframe },
    normalized: {
      key: input.timeframe,
      start: null,
      end: null,
      label: TIMEFRAME_LABELS[input.timeframe],
    },
  };
}

function idFilter(type: KlaviyoPerformanceType, ids: string[] | undefined) {
  const config = REPORT_CONFIG[type];
  const cleanedIds = (ids ?? [])
    .map((id) => id.trim())
    .filter((id) => /^[A-Za-z0-9_-]+$/.test(id))
    .slice(0, 100);

  if (!cleanedIds.length) return undefined;
  if (cleanedIds.length === 1) return `equals(${config.idField},"${cleanedIds[0]}")`;
  if (type === "segment") return `any(${config.idField},[${cleanedIds.map((id) => `"${id}"`).join(",")}])`;
  return `contains-any(${config.idField},[${cleanedIds.map((id) => `"${id}"`).join(",")}])`;
}

function rowId(type: KlaviyoPerformanceType, groupings: Record<string, unknown>) {
  const id = groupings[REPORT_CONFIG[type].idField];
  return typeof id === "string" && id.trim() ? id.trim() : "unknown";
}

function rowName(type: KlaviyoPerformanceType, groupings: Record<string, unknown>) {
  const config = REPORT_CONFIG[type];
  const name = config.nameField ? groupings[config.nameField] : undefined;
  const messageName = config.messageNameField ? groupings[config.messageNameField] : undefined;
  if (typeof name === "string" && name.trim()) return name.trim();
  if (typeof messageName === "string" && messageName.trim()) return messageName.trim();
  return null;
}

function rowChannel(groupings: Record<string, unknown>) {
  const channel = groupings.send_channel;
  return typeof channel === "string" && channel.trim() ? channel.trim() : null;
}

function normalizeRows(
  type: KlaviyoPerformanceType,
  response: JsonApiResource,
  timeframe: NormalizedKlaviyoPerformanceRow["timeframe"],
  requestedStatistics: string[],
) {
  const config = REPORT_CONFIG[type];
  const results = response.data?.attributes?.results ?? [];

  return results.slice(0, 200).map((result) => {
    const groupings = result.groupings ?? {};
    const statistics = result.statistics ?? {};
    const missingMetrics = requestedStatistics.filter((statistic) => !(statistic in statistics));

    return {
      id: rowId(type, groupings),
      name: rowName(type, groupings),
      type,
      channel: rowChannel(groupings),
      timeframe,
      statistics,
      rawAvailable: true,
      missingMetrics,
      source: {
        endpoint: config.endpoint,
        reportType: config.reportType,
        groupings,
      },
    };
  });
}

export async function queryKlaviyoPerformance(
  config: KlaviyoPerformanceConfig,
  input: QueryKlaviyoPerformanceInput,
) {
  const report = REPORT_CONFIG[input.type];
  const statistics = uniqueStatistics(input.statistics, input.type);
  const conversionMetricId = input.conversionMetricId?.trim() || config.conversionMetricId;
  const requiredConversionStatistics = conversionStatistics(statistics);

  if (!statistics.length) {
    throw new KlaviyoPerformanceApiError(
      "Klaviyo performance statistics are required.",
      400,
      [{ status: 400, title: "At least one supported statistic is required." }],
    );
  }

  if (report.requiresConversionMetric && !conversionMetricId) {
    throw new KlaviyoPerformanceApiError(
      "Klaviyo conversion metric is required.",
      400,
      [{
        status: 400,
        title: "Missing conversion metric id",
        detail: requiredConversionStatistics.length
          ? `Provide conversionMetricId or configure KLAVIYO_CONVERSION_METRIC_ID for conversion statistics: ${requiredConversionStatistics.join(", ")}.`
          : "Provide conversionMetricId or configure KLAVIYO_CONVERSION_METRIC_ID for flow/campaign performance reports.",
      }],
    );
  }

  const timeframe = timeframePayload(input);
  const filter = idFilter(input.type, input.ids);

  if (input.type === "segment" && !filter) {
    throw new KlaviyoPerformanceApiError(
      "Klaviyo segment performance requires a segment id.",
      400,
      [{
        status: 400,
        title: "Segment performance requires ids in v0",
        detail: "Provide one or more segment IDs to read segment growth performance.",
      }],
    );
  }

  const attributes: Record<string, unknown> = {
    statistics,
    timeframe: timeframe.payload,
    ...(report.groupBy.length ? { group_by: report.groupBy } : {}),
    ...(filter ? { filter } : {}),
    ...(report.requiresConversionMetric && conversionMetricId ? { conversion_metric_id: conversionMetricId } : {}),
  };
  const requestBody = {
    data: {
      type: report.reportType,
      attributes,
    },
  };
  const response = await requestKlaviyoPerformanceResource(config, report.endpoint, requestBody);
  const rows = normalizeRows(input.type, response, timeframe.normalized, statistics);

  return {
    ok: true,
    readOnly: true,
    type: input.type,
    timeframe: timeframe.normalized,
    statisticsRequested: statistics,
    conversionMetricRequired: report.requiresConversionMetric,
    conversionMetricUsed: Boolean(conversionMetricId),
    rows,
    count: rows.length,
    source: {
      endpoint: report.endpoint,
      reportType: report.reportType,
      filter: filter ?? null,
      groupBy: report.groupBy,
      fallbackUsed: false,
      timeframeNote: timeframe.normalized.cappedByProviderLimit
        ? "Klaviyo values reports are capped at one year; lifetime is read as last_365_days in v0."
        : null,
    },
  };
}
