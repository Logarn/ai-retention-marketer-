import type {
  BrowserBrokerCapability,
  BrowserBrokerCommand,
  BrowserBrokerOperation,
  BrowserBrokerReplayClass,
  BrowserBrokerResultRequest,
} from "@vellumai/service-contracts/browser-broker";
import type { TenantExecutionContext } from "@vellumai/service-contracts/tenant-context";

export type BrowserConnectionState =
  | "active"
  | "superseded"
  | "disconnected"
  | "expired";

export type BrowserActionState =
  | "queued"
  | "delivered"
  | "received"
  | "executing"
  | "succeeded"
  | "failed"
  | "cancel_requested"
  | "cancelled"
  | "expired"
  | "unknown_outcome";

export interface BrowserConnectionRecord {
  clientInstallationId: string;
  connectionId: string;
  connectionGeneration: number;
  capabilities: readonly BrowserBrokerCapability[];
  state: BrowserConnectionState;
  cursor: number;
  leaseExpiresAt: number;
  lastSeenAt: number;
}

export interface BrowserAccessGrantRecord {
  conversationId: string;
  clientInstallationId: string;
  enabled: boolean;
  updatedAt: number;
}

export interface BrowserSessionRecord {
  conversationId: string;
  clientInstallationId: string;
  connectionId: string;
  connectionGeneration: number;
  browserSessionId: string;
  tabLeaseId: string;
  owner: "agent" | "human";
  status:
    | "opening"
    | "active"
    | "paused"
    | "closed"
    | "expired"
    | "invalidated";
  documentEpoch: number;
  snapshotId?: string;
  expiresAt: number;
}

export interface BrowserActionRecord {
  conversationId: string;
  runId: string;
  toolUseId: string;
  actionId: string;
  actionSequence: number;
  browserSessionId?: string;
  tabLeaseId?: string;
  clientInstallationId: string;
  connectionId: string;
  connectionGeneration: number;
  operation: BrowserBrokerOperation;
  operationHash: string;
  replayClass: BrowserBrokerReplayClass;
  expectedDocumentEpoch?: number;
  deadlineAt: number;
  state: BrowserActionState;
  resultHash?: string;
  result?: BrowserBrokerResultRequest;
}

export interface BrowserOutboxRecord {
  seq: number;
  eventId: string;
  clientInstallationId: string;
  connectionId: string;
  connectionGeneration: number;
  actionId: string;
  event: BrowserBrokerCommand;
  expiresAt: number;
}

export interface ConnectBrowserClientInput {
  clientInstallationId: string;
  capabilities: readonly BrowserBrokerCapability[];
  leaseExpiresAt: number;
  newConnectionId: string;
  newResumeTokenHash: string;
  resume?: {
    connectionId: string;
    connectionGeneration: number;
    resumeTokenHash: string;
  };
}

export interface ConnectBrowserClientResult {
  connection: BrowserConnectionRecord;
  resumed: boolean;
}

export interface EnqueueBrowserActionInput {
  conversationId: string;
  runId: string;
  toolUseId: string;
  actionId: string;
  operation: BrowserBrokerOperation;
  operationHash: string;
  replayClass: BrowserBrokerReplayClass;
  expectedDocumentEpoch?: number;
  deadlineAt: number;
  leaseOwner?: string;
  providerContent?: unknown;
  executionConfig?: Record<string, unknown>;
}

export interface RecordBrowserReceiptInput {
  actionId: string;
  operationHash: string;
  connectionId: string;
  connectionGeneration: number;
  receivedSequence: number;
  state: "received" | "executing";
}

export interface BrowserActionAck {
  accepted: boolean;
  canonicalState: BrowserActionState;
  runId?: string;
  conversationId?: string;
}

export interface ConcurrentBrowserBrokerStore {
  connectBrowserClient(
    context: TenantExecutionContext,
    input: ConnectBrowserClientInput,
  ): Promise<ConnectBrowserClientResult>;

  heartbeatBrowserConnection(
    context: TenantExecutionContext,
    input: {
      clientInstallationId: string;
      connectionId: string;
      connectionGeneration: number;
      connectionTokenHash: string;
      leaseExpiresAt: number;
    },
  ): Promise<BrowserConnectionRecord | null>;

  setBrowserAccessGrant(
    context: TenantExecutionContext,
    input: {
      conversationId: string;
      clientInstallationId: string;
      enabled: boolean;
    },
  ): Promise<BrowserAccessGrantRecord>;

  getBrowserAccessGrant(
    context: TenantExecutionContext,
    conversationId: string,
  ): Promise<BrowserAccessGrantRecord | null>;

  enqueueBrowserAction(
    context: TenantExecutionContext,
    input: EnqueueBrowserActionInput,
  ): Promise<{ action: BrowserActionRecord; outbox: BrowserOutboxRecord }>;

  listBrowserEvents(
    context: TenantExecutionContext,
    input: {
      clientInstallationId: string;
      connectionId: string;
      connectionGeneration: number;
      connectionTokenHash: string;
      afterSeq: number;
      limit: number;
    },
  ): Promise<BrowserOutboxRecord[]>;

  recordBrowserReceipt(
    context: TenantExecutionContext,
    input: RecordBrowserReceiptInput & { connectionTokenHash: string },
  ): Promise<BrowserActionAck>;

  recordBrowserResult(
    context: TenantExecutionContext,
    result: BrowserBrokerResultRequest,
    connectionTokenHash: string,
  ): Promise<BrowserActionAck>;

  listRunSteps(
    context: TenantExecutionContext,
    runId: string,
  ): Promise<import("../types.js").ConcurrentRunStep[]>;
}
