import {
  BROWSER_BROKER_INTERFACE_ID,
  BROWSER_BROKER_PROTOCOL_VERSION,
  BrowserBrokerCommandSchema,
  BrowserBrokerConnectResponseSchema,
  type BrowserBrokerCommand,
  type BrowserBrokerReceiptRequest,
  type BrowserBrokerResultRequest,
} from "@vellumai/service-contracts/browser-broker";

import { getClientId } from "./client-identity.js";
import type { SseMode } from "./sse-connection.js";

const STORAGE_PREFIX = "vellum.concurrentBrowser.connection.v1";
const HEARTBEAT_MS = 15_000;
const RECONNECT_MAX_MS = 30_000;

interface StoredBrokerConnectionMetadata {
  connectionId: string;
  connectionGeneration: number;
  cursor: number;
  leaseExpiresAt: string;
}

interface StoredBrokerCredential {
  resumeToken: string;
}

interface StoredBrokerConnection extends StoredBrokerConnectionMetadata {
  resumeToken: string;
}

export interface BrowserBrokerClientDeps {
  mode: SseMode;
  onCommand(command: BrowserBrokerCommand, sequence: number): Promise<void>;
  onUnavailable?(reason: string): void;
}

export interface BrowserAccessGrantSnapshot {
  conversationId: string;
  clientInstallationId: string;
  enabled: boolean;
  updatedAt: number;
}

function assistantPrefix(mode: SseMode): string {
  const base = mode.runtimeUrl.replace(/\/$/, "");
  return mode.kind === "vellum-cloud"
    ? `${base}/v1/assistants/${encodeURIComponent(mode.assistantId)}`
    : base;
}

function authHeaders(mode: SseMode): Record<string, string> {
  const headers: Record<string, string> = {};
  if (mode.token) headers.Authorization = `Bearer ${mode.token}`;
  if (mode.kind === "vellum-cloud") {
    if (mode.sessionToken) headers["X-Session-Token"] = mode.sessionToken;
    if (mode.organizationId) {
      headers["Vellum-Organization-Id"] = mode.organizationId;
    }
  }
  return headers;
}

function storageKey(mode: SseMode, clientId: string): string {
  const scope =
    mode.kind === "vellum-cloud"
      ? `${mode.organizationId ?? "unselected-org"}:${mode.assistantId}`
      : "self-hosted";
  return `${STORAGE_PREFIX}:${mode.kind}:${mode.runtimeUrl}:${scope}:${clientId}`;
}

export class BrowserBrokerClient {
  private abortController: AbortController | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private connection: StoredBrokerConnection | null = null;
  private clientId: string | null = null;
  private reconnectDelay = 1_000;

  constructor(private readonly deps: BrowserBrokerClientDeps) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.run();
  }

  stop(): void {
    this.stopped = true;
    this.abortController?.abort();
    this.abortController = null;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  async postReceipt(receipt: BrowserBrokerReceiptRequest): Promise<void> {
    await this.postAction(receipt.actionId, "receipt", receipt);
    if (this.connection) {
      this.connection.cursor = Math.max(
        this.connection.cursor,
        receipt.receivedSequence,
      );
      await this.persistConnection();
    }
  }

  async postResult(result: BrowserBrokerResultRequest): Promise<void> {
    await this.postAction(result.actionId, "result", result);
  }

  async getConversationAccess(
    conversationId: string,
  ): Promise<BrowserAccessGrantSnapshot | null> {
    return this.requestConversationAccess(conversationId, "GET");
  }

  async setConversationAccess(
    conversationId: string,
    enabled: boolean,
  ): Promise<BrowserAccessGrantSnapshot> {
    const clientInstallationId = await this.ensureClientId();
    const grant = await this.requestConversationAccess(conversationId, "PUT", {
      clientInstallationId,
      enabled,
    });
    if (!grant) {
      throw new Error("Browser access update returned no grant.");
    }
    return grant;
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      try {
        const registered = await this.register();
        if (!registered) return;
        await this.openEventStream();
        this.reconnectDelay = 1_000;
      } catch (error) {
        if (this.stopped) return;
        const reason = error instanceof Error ? error.message : String(error);
        this.deps.onUnavailable?.(reason);
      }
      if (this.stopped) return;
      await new Promise((resolve) => setTimeout(resolve, this.reconnectDelay));
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    }
  }

  private async register(): Promise<boolean> {
    this.clientId = await this.ensureClientId();
    const key = storageKey(this.deps.mode, this.clientId);
    const [metadataRecord, credentialRecord] = await Promise.all([
      chrome.storage.local.get(key),
      chrome.storage.session.get(key),
    ]);
    const metadata = metadataRecord[key] as
      | StoredBrokerConnectionMetadata
      | undefined;
    const credential = credentialRecord[key] as
      | StoredBrokerCredential
      | undefined;
    const stored =
      metadata && credential?.resumeToken
        ? { ...metadata, resumeToken: credential.resumeToken }
        : undefined;
    const response = await fetch(
      `${assistantPrefix(this.deps.mode)}/v1/browser-broker/connections`,
      {
        method: "POST",
        credentials:
          this.deps.mode.kind === "vellum-cloud" ? "include" : "omit",
        headers: {
          ...authHeaders(this.deps.mode),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          protocolVersion: BROWSER_BROKER_PROTOCOL_VERSION,
          interfaceId: BROWSER_BROKER_INTERFACE_ID,
          clientInstallationId: this.clientId,
          capabilities: [
            "browser_broker_v1",
            "snapshot_v1",
            "screenshot_v1",
            "interaction_v1",
          ],
          ...(stored
            ? {
                resume: {
                  connectionId: stored.connectionId,
                  connectionGeneration: stored.connectionGeneration,
                  resumeToken: stored.resumeToken,
                },
              }
            : {}),
        }),
      },
    );
    if (
      response.status === 404 ||
      response.status === 405 ||
      response.status === 409
    ) {
      this.deps.onUnavailable?.(
        "This assistant does not advertise concurrent browser control.",
      );
      this.stop();
      return false;
    }
    if (!response.ok) {
      throw new Error(
        `Browser broker registration failed (${response.status}).`,
      );
    }
    this.connection = BrowserBrokerConnectResponseSchema.parse(
      await response.json(),
    );
    await this.persistConnection();
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat().catch((error) => {
        this.abortController?.abort();
        this.deps.onUnavailable?.(
          error instanceof Error ? error.message : String(error),
        );
      });
    }, HEARTBEAT_MS);
    return true;
  }

  private async heartbeat(): Promise<void> {
    if (!this.connection || !this.clientId) return;
    const response = await fetch(
      `${assistantPrefix(this.deps.mode)}/v1/browser-broker/connections/${encodeURIComponent(this.clientId)}/heartbeat`,
      {
        method: "POST",
        credentials:
          this.deps.mode.kind === "vellum-cloud" ? "include" : "omit",
        headers: this.connectionHeaders(),
        body: JSON.stringify({
          protocolVersion: BROWSER_BROKER_PROTOCOL_VERSION,
          connectionId: this.connection.connectionId,
          connectionGeneration: this.connection.connectionGeneration,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Browser broker heartbeat failed (${response.status}).`);
    }
    const body = (await response.json()) as {
      cursor?: number;
      leaseExpiresAt?: string;
    };
    if (typeof body.cursor === "number") this.connection.cursor = body.cursor;
    if (typeof body.leaseExpiresAt === "string") {
      this.connection.leaseExpiresAt = body.leaseExpiresAt;
    }
    await this.persistConnection();
  }

  private async openEventStream(): Promise<void> {
    if (!this.connection || !this.clientId) return;
    const query = new URLSearchParams({
      connectionId: this.connection.connectionId,
      connectionGeneration: String(this.connection.connectionGeneration),
      afterSeq: String(this.connection.cursor),
    });
    const controller = new AbortController();
    this.abortController = controller;
    const response = await fetch(
      `${assistantPrefix(this.deps.mode)}/v1/browser-broker/connections/${encodeURIComponent(this.clientId)}/events?${query}`,
      {
        credentials:
          this.deps.mode.kind === "vellum-cloud" ? "include" : "omit",
        headers: {
          ...this.connectionHeaders(false),
          Accept: "text/event-stream",
          "Last-Event-ID": String(this.connection.cursor),
        },
        signal: controller.signal,
      },
    );
    if (!response.ok || !response.body) {
      throw new Error(
        `Browser broker event stream failed (${response.status}).`,
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!this.stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (!frame.trim() || frame.startsWith(":")) continue;
          let sequence = 0;
          const data: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("id:")) sequence = Number(line.slice(3).trim());
            if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
          }
          if (
            !Number.isSafeInteger(sequence) ||
            sequence < 1 ||
            data.length === 0
          ) {
            continue;
          }
          const parsed = BrowserBrokerCommandSchema.safeParse(
            JSON.parse(data.join("\n")),
          );
          if (!parsed.success || !this.isCurrentCommand(parsed.data)) continue;
          await this.deps.onCommand(parsed.data, sequence);
        }
      }
    } finally {
      reader.releaseLock();
      if (this.abortController === controller) this.abortController = null;
    }
  }

  private isCurrentCommand(command: BrowserBrokerCommand): boolean {
    return Boolean(
      this.connection &&
      this.clientId &&
      command.scope.clientInstallationId === this.clientId &&
      command.scope.connectionId === this.connection.connectionId &&
      command.scope.connectionGeneration ===
        this.connection.connectionGeneration,
    );
  }

  private async postAction(
    actionId: string,
    endpoint: "receipt" | "result",
    body: BrowserBrokerReceiptRequest | BrowserBrokerResultRequest,
  ): Promise<void> {
    if (!this.connection) throw new Error("Browser broker is not connected.");
    const response = await fetch(
      `${assistantPrefix(this.deps.mode)}/v1/browser-broker/actions/${encodeURIComponent(actionId)}/${endpoint}`,
      {
        method: "POST",
        credentials:
          this.deps.mode.kind === "vellum-cloud" ? "include" : "omit",
        headers: this.connectionHeaders(),
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Browser broker ${endpoint} failed (${response.status}).`,
      );
    }
  }

  private async requestConversationAccess(
    conversationId: string,
    method: "GET" | "PUT",
    body?: { clientInstallationId: string; enabled: boolean },
  ): Promise<BrowserAccessGrantSnapshot | null> {
    const response = await fetch(
      `${assistantPrefix(this.deps.mode)}/v1/conversations/${encodeURIComponent(conversationId)}/browser-access`,
      {
        method,
        credentials:
          this.deps.mode.kind === "vellum-cloud" ? "include" : "omit",
        headers: {
          ...authHeaders(this.deps.mode),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Browser access ${method === "GET" ? "lookup" : "update"} failed (${response.status}).`,
      );
    }
    const payload = (await response.json()) as {
      grant?: BrowserAccessGrantSnapshot | null;
    };
    return payload.grant ?? null;
  }

  private async ensureClientId(): Promise<string> {
    this.clientId ??= await getClientId();
    return this.clientId;
  }

  private connectionHeaders(contentType = true): Record<string, string> {
    if (!this.connection) return authHeaders(this.deps.mode);
    return {
      ...authHeaders(this.deps.mode),
      ...(contentType ? { "Content-Type": "application/json" } : {}),
      "X-Worklin-Browser-Connection-Token": this.connection.resumeToken,
    };
  }

  private async persistConnection(): Promise<void> {
    if (!this.connection || !this.clientId) return;
    const key = storageKey(this.deps.mode, this.clientId);
    const {
      resumeToken,
      connectionId,
      connectionGeneration,
      cursor,
      leaseExpiresAt,
    } = this.connection;
    await Promise.all([
      chrome.storage.local.set({
        [key]: {
          connectionId,
          connectionGeneration,
          cursor,
          leaseExpiresAt,
        } satisfies StoredBrokerConnectionMetadata,
      }),
      chrome.storage.session.set({
        [key]: { resumeToken } satisfies StoredBrokerCredential,
      }),
    ]);
  }
}
