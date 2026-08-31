import { z } from "zod";

export const BROWSER_BROKER_PROTOCOL_VERSION = 1 as const;
export const BROWSER_BROKER_INTERFACE_ID = "chrome-extension" as const;

const IdSchema = z.string().trim().min(1).max(256);
const OpaqueTokenSchema = z.string().min(32).max(4096);
const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);
const IsoTimestampSchema = z.string().datetime({ offset: true });

export const BrowserBrokerCapabilitySchema = z.enum([
  "browser_broker_v1",
  "snapshot_v1",
  "screenshot_v1",
  "interaction_v1",
]);
export type BrowserBrokerCapability = z.infer<
  typeof BrowserBrokerCapabilitySchema
>;

export const BrowserBrokerConnectionScopeSchema = z
  .object({
    organizationId: IdSchema,
    assistantId: IdSchema,
    userId: IdSchema,
    actorId: IdSchema,
    clientInstallationId: IdSchema,
    connectionId: IdSchema,
    connectionGeneration: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type BrowserBrokerConnectionScope = z.infer<
  typeof BrowserBrokerConnectionScopeSchema
>;

export const BrowserBrokerSessionScopeSchema =
  BrowserBrokerConnectionScopeSchema.extend({
    conversationId: IdSchema,
    browserSessionId: IdSchema,
    tabLeaseId: IdSchema,
  }).strict();
export type BrowserBrokerSessionScope = z.infer<
  typeof BrowserBrokerSessionScopeSchema
>;

const ResumeConnectionSchema = z
  .object({
    connectionId: IdSchema,
    connectionGeneration: z.number().int().positive(),
    resumeToken: OpaqueTokenSchema,
  })
  .strict();

export const BrowserBrokerConnectRequestSchema = z
  .object({
    protocolVersion: z.literal(BROWSER_BROKER_PROTOCOL_VERSION),
    interfaceId: z.literal(BROWSER_BROKER_INTERFACE_ID),
    clientInstallationId: IdSchema,
    capabilities: z.array(BrowserBrokerCapabilitySchema).min(1).max(16),
    resume: ResumeConnectionSchema.optional(),
  })
  .strict();
export type BrowserBrokerConnectRequest = z.infer<
  typeof BrowserBrokerConnectRequestSchema
>;

export const BrowserBrokerConnectResponseSchema = z
  .object({
    protocolVersion: z.literal(BROWSER_BROKER_PROTOCOL_VERSION),
    connectionId: IdSchema,
    connectionGeneration: z.number().int().positive(),
    resumeToken: OpaqueTokenSchema,
    resumed: z.boolean(),
    cursor: z.number().int().nonnegative(),
    leaseExpiresAt: IsoTimestampSchema,
  })
  .strict();
export type BrowserBrokerConnectResponse = z.infer<
  typeof BrowserBrokerConnectResponseSchema
>;

export const BrowserBrokerHeartbeatRequestSchema = z
  .object({
    protocolVersion: z.literal(BROWSER_BROKER_PROTOCOL_VERSION),
    connectionId: IdSchema,
    connectionGeneration: z.number().int().positive(),
  })
  .strict();
export type BrowserBrokerHeartbeatRequest = z.infer<
  typeof BrowserBrokerHeartbeatRequestSchema
>;

export const BrowserBrokerOpenSessionOperationSchema = z
  .object({
    kind: z.literal("open_session"),
    initialUrl: z.string().url().max(2048).optional(),
  })
  .strict();

export const BrowserBrokerStatusOperationSchema = z
  .object({ kind: z.literal("status") })
  .strict();

export const BrowserBrokerNavigateOperationSchema = z
  .object({
    kind: z.literal("navigate"),
    url: z.string().url().max(2048),
  })
  .strict();

export const BrowserBrokerSnapshotOperationSchema = z
  .object({
    kind: z.literal("snapshot"),
    includeScreenshot: z.boolean().default(false),
  })
  .strict();

export const BrowserBrokerScreenshotOperationSchema = z
  .object({
    kind: z.literal("screenshot"),
    format: z.enum(["png", "jpeg"]).default("png"),
    quality: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const CurrentElementRefSchema = z
  .object({
    elementRef: z.string().min(1).max(256),
    snapshotId: IdSchema,
  })
  .strict();

export const BrowserBrokerClickOperationSchema = CurrentElementRefSchema.extend(
  {
    kind: z.literal("click"),
  },
).strict();

export const BrowserBrokerTypeOperationSchema = CurrentElementRefSchema.extend({
  kind: z.literal("type"),
  text: z.string().max(10_000),
  replace: z.literal(true),
}).strict();

export const BrowserBrokerPressKeyOperationSchema = z
  .object({
    kind: z.literal("press_key"),
    key: z.enum([
      "Enter",
      "Escape",
      "Tab",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Backspace",
      "Delete",
      "Home",
      "End",
      "PageUp",
      "PageDown",
    ]),
    modifiers: z
      .array(z.enum(["Alt", "Control", "Meta", "Shift"]))
      .max(4)
      .default([]),
  })
  .strict();

export const BrowserBrokerScrollOperationSchema = z
  .object({
    kind: z.literal("scroll"),
    direction: z.enum(["up", "down", "left", "right"]),
    amount: z.number().int().min(1).max(2000),
  })
  .strict();

export const BrowserBrokerSelectOptionOperationSchema =
  CurrentElementRefSchema.extend({
    kind: z.literal("select_option"),
    value: z.string().max(2048),
  }).strict();

export const BrowserBrokerWaitOperationSchema = z
  .object({
    kind: z.literal("wait"),
    durationMs: z.number().int().min(50).max(5000),
  })
  .strict();

export const BrowserBrokerCloseSessionOperationSchema = z
  .object({ kind: z.literal("close_session") })
  .strict();

export const BrowserBrokerOperationSchema = z.discriminatedUnion("kind", [
  BrowserBrokerStatusOperationSchema,
  BrowserBrokerOpenSessionOperationSchema,
  BrowserBrokerNavigateOperationSchema,
  BrowserBrokerSnapshotOperationSchema,
  BrowserBrokerScreenshotOperationSchema,
  BrowserBrokerClickOperationSchema,
  BrowserBrokerTypeOperationSchema,
  BrowserBrokerPressKeyOperationSchema,
  BrowserBrokerScrollOperationSchema,
  BrowserBrokerSelectOptionOperationSchema,
  BrowserBrokerWaitOperationSchema,
  BrowserBrokerCloseSessionOperationSchema,
]);
export type BrowserBrokerOperation = z.infer<
  typeof BrowserBrokerOperationSchema
>;

export const BrowserBrokerReplayClassSchema = z.enum([
  "recomputable",
  "non_replayable",
]);
export type BrowserBrokerReplayClass = z.infer<
  typeof BrowserBrokerReplayClassSchema
>;

export const BrowserBrokerCommandSchema = z
  .object({
    type: z.literal("browser_broker_command"),
    protocolVersion: z.literal(BROWSER_BROKER_PROTOCOL_VERSION),
    scope: BrowserBrokerConnectionScopeSchema.extend({
      conversationId: IdSchema,
      browserSessionId: IdSchema.optional(),
      tabLeaseId: IdSchema.optional(),
    }).strict(),
    runId: IdSchema,
    toolUseId: IdSchema,
    actionId: IdSchema,
    sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    operationHash: Sha256HexSchema,
    replayClass: BrowserBrokerReplayClassSchema,
    expectedDocumentEpoch: z.number().int().nonnegative().optional(),
    deadlineAt: IsoTimestampSchema,
    operation: BrowserBrokerOperationSchema,
  })
  .strict();
export type BrowserBrokerCommand = z.infer<typeof BrowserBrokerCommandSchema>;

export const BrowserBrokerCancelEventSchema = z
  .object({
    type: z.literal("browser_broker_cancel"),
    protocolVersion: z.literal(BROWSER_BROKER_PROTOCOL_VERSION),
    scope: BrowserBrokerSessionScopeSchema,
    actionId: IdSchema,
    sequence: z.number().int().positive(),
    reason: z.enum(["user_cancelled", "grant_revoked", "deadline_expired"]),
  })
  .strict();

export const BrowserBrokerEventSchema = z.discriminatedUnion("type", [
  BrowserBrokerCommandSchema,
  BrowserBrokerCancelEventSchema,
]);
export type BrowserBrokerEvent = z.infer<typeof BrowserBrokerEventSchema>;

export const BrowserBrokerReceiptRequestSchema = z
  .object({
    protocolVersion: z.literal(BROWSER_BROKER_PROTOCOL_VERSION),
    actionId: IdSchema,
    operationHash: Sha256HexSchema,
    connectionId: IdSchema,
    connectionGeneration: z.number().int().positive(),
    state: z.enum(["received", "executing"]),
    receivedSequence: z.number().int().positive(),
  })
  .strict();
export type BrowserBrokerReceiptRequest = z.infer<
  typeof BrowserBrokerReceiptRequestSchema
>;

const BrowserElementSchema = z
  .object({
    ref: z.string().min(1).max(256),
    role: z.string().max(128),
    name: z.string().max(2048),
    value: z.string().max(2048).optional(),
    disabled: z.boolean().optional(),
  })
  .strict();

const BrowserStatusOutputSchema = z
  .object({
    kind: z.literal("status"),
    available: z.boolean(),
  })
  .strict();

const BrowserSessionOutputSchema = z
  .object({
    kind: z.literal("session"),
    browserSessionId: IdSchema,
    tabLeaseId: IdSchema,
    documentEpoch: z.number().int().nonnegative(),
  })
  .strict();

const BrowserObservationOutputSchema = z
  .object({
    kind: z.literal("observation"),
    snapshotId: IdSchema,
    documentEpoch: z.number().int().nonnegative(),
    title: z.string().max(2048),
    url: z.string().url().max(2048),
    content: z.string().max(250_000),
    elements: z.array(BrowserElementSchema).max(2000),
  })
  .strict();

const Base64ImageDataSchema = z
  .string()
  .max(5_600_000)
  .regex(/^[A-Za-z0-9+/]*={0,2}$/);

const BrowserScreenshotOutputSchema = z
  .object({
    kind: z.literal("screenshot"),
    documentEpoch: z.number().int().nonnegative(),
    mediaType: z.enum(["image/png", "image/jpeg"]),
    data: Base64ImageDataSchema,
    width: z.number().int().positive().max(10_000),
    height: z.number().int().positive().max(10_000),
  })
  .strict();

const BrowserActionOutputSchema = z
  .object({
    kind: z.literal("action"),
    documentEpoch: z.number().int().nonnegative(),
    snapshotId: IdSchema.optional(),
  })
  .strict();

const BrowserSessionClosedOutputSchema = z
  .object({ kind: z.literal("session_closed") })
  .strict();

export const BrowserBrokerSuccessOutputSchema = z.discriminatedUnion("kind", [
  BrowserStatusOutputSchema,
  BrowserSessionOutputSchema,
  BrowserObservationOutputSchema,
  BrowserScreenshotOutputSchema,
  BrowserActionOutputSchema,
  BrowserSessionClosedOutputSchema,
]);
export type BrowserBrokerSuccessOutput = z.infer<
  typeof BrowserBrokerSuccessOutputSchema
>;

export const BrowserBrokerErrorCodeSchema = z.enum([
  "browser_unavailable",
  "extension_update_required",
  "consent_required",
  "ambiguous_client",
  "stale_connection",
  "stale_tab_lease",
  "stale_document",
  "sensitive_field",
  "user_input_required",
  "deadline_expired",
  "cancelled",
  "unknown_outcome",
  "blocked_target",
  "invalid_operation",
  "execution_failed",
]);
export type BrowserBrokerErrorCode = z.infer<
  typeof BrowserBrokerErrorCodeSchema
>;

const BrowserBrokerResultBaseSchema = z
  .object({
    protocolVersion: z.literal(BROWSER_BROKER_PROTOCOL_VERSION),
    actionId: IdSchema,
    operationHash: Sha256HexSchema,
    connectionId: IdSchema,
    connectionGeneration: z.number().int().positive(),
    resultHash: Sha256HexSchema,
    documentEpoch: z.number().int().nonnegative().optional(),
  })
  .strict();

export const BrowserBrokerResultRequestSchema = z.discriminatedUnion("state", [
  BrowserBrokerResultBaseSchema.extend({
    state: z.literal("succeeded"),
    output: BrowserBrokerSuccessOutputSchema,
  }).strict(),
  BrowserBrokerResultBaseSchema.extend({
    state: z.literal("failed"),
    error: z
      .object({
        code: BrowserBrokerErrorCodeSchema,
        message: z.string().min(1).max(4096),
      })
      .strict(),
  }).strict(),
  BrowserBrokerResultBaseSchema.extend({
    state: z.literal("cancelled"),
    error: z
      .object({
        code: z.literal("cancelled"),
        message: z.string().min(1).max(4096),
      })
      .strict(),
  }).strict(),
  BrowserBrokerResultBaseSchema.extend({
    state: z.literal("unknown_outcome"),
    error: z
      .object({
        code: z.literal("unknown_outcome"),
        message: z.string().min(1).max(4096),
      })
      .strict(),
  }).strict(),
]);
export type BrowserBrokerResultRequest = z.infer<
  typeof BrowserBrokerResultRequestSchema
>;

export const BrowserBrokerAckResponseSchema = z
  .object({
    accepted: z.boolean(),
    canonicalState: z.enum([
      "queued",
      "delivered",
      "received",
      "executing",
      "succeeded",
      "failed",
      "cancel_requested",
      "cancelled",
      "expired",
      "unknown_outcome",
    ]),
  })
  .strict();
export type BrowserBrokerAckResponse = z.infer<
  typeof BrowserBrokerAckResponseSchema
>;
