import { describe, expect, test } from "bun:test";

import {
  BROWSER_BROKER_INTERFACE_ID,
  BROWSER_BROKER_PROTOCOL_VERSION,
  type BrowserBrokerConnectResponse,
  type BrowserBrokerResultRequest,
} from "@vellumai/service-contracts/browser-broker";
import {
  createTenantExecutionContext,
  type TenantExecutionContext,
} from "@vellumai/service-contracts/tenant-context";

import { InMemoryConcurrentRuntimeStore } from "../in-memory-store.js";
import { ConcurrentRuntimeStoreError } from "../store.js";
import {
  assertBrowserNavigationAllowed,
  BrowserBrokerService,
  hashBrowserConnectionToken,
} from "./service.js";

function runtimeContext(
  input: {
    userId?: string;
    actorId?: string;
    requestId?: string;
    conversationId?: string;
  } = {},
): TenantExecutionContext {
  return createTenantExecutionContext({
    claim: {
      version: 1,
      organization_id: "org-abc",
      assistant_id: "assistant-123",
      user_id: input.userId ?? "user-123",
      actor_id: input.actorId ?? "actor-123",
      request_id: input.requestId ?? "request-123",
    },
    authorizationVersion: 1,
    configVersion: 1,
    runtimeGeneration: 1,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  });
}

async function connect(
  service: BrowserBrokerService,
  context: TenantExecutionContext,
  resume?: BrowserBrokerConnectResponse,
): Promise<BrowserBrokerConnectResponse> {
  return service.connect(context, {
    protocolVersion: BROWSER_BROKER_PROTOCOL_VERSION,
    interfaceId: BROWSER_BROKER_INTERFACE_ID,
    clientInstallationId: "client-123",
    capabilities: ["browser_broker_v1", "snapshot_v1", "interaction_v1"],
    ...(resume
      ? {
          resume: {
            connectionId: resume.connectionId,
            connectionGeneration: resume.connectionGeneration,
            resumeToken: resume.resumeToken,
          },
        }
      : {}),
  });
}

describe("BrowserBrokerService", () => {
  test("permits only public HTTPS navigation targets", () => {
    expect(() =>
      assertBrowserNavigationAllowed("https://example.com/path"),
    ).not.toThrow();
    for (const target of [
      "http://example.com",
      "https://localhost",
      "https://127.0.0.1",
      "https://10.0.0.8",
      "https://192.168.1.2",
      "https://service.internal",
      "https://user:secret@example.com",
    ]) {
      expect(() => assertBrowserNavigationAllowed(target)).toThrow(
        ConcurrentRuntimeStoreError,
      );
    }
  });

  test("rotates the connection token on resume and rejects the prior token", async () => {
    let now = Date.now();
    const store = new InMemoryConcurrentRuntimeStore();
    const service = new BrowserBrokerService({ store, now: () => now });
    const context = runtimeContext();
    const first = await connect(service, context);
    now += 1_000;
    const resumed = await connect(service, context, first);

    expect(resumed.resumed).toBe(true);
    expect(resumed.connectionId).toBe(first.connectionId);
    expect(resumed.connectionGeneration).toBe(first.connectionGeneration);
    expect(resumed.resumeToken).not.toBe(first.resumeToken);

    await expect(
      service.heartbeat(context, {
        clientInstallationId: "client-123",
        connectionId: first.connectionId,
        connectionGeneration: first.connectionGeneration,
        connectionToken: first.resumeToken,
      }),
    ).rejects.toMatchObject({ code: "stale_connection" });
    await expect(
      service.heartbeat(context, {
        clientInstallationId: "client-123",
        connectionId: resumed.connectionId,
        connectionGeneration: resumed.connectionGeneration,
        connectionToken: resumed.resumeToken,
      }),
    ).resolves.toMatchObject({ state: "active" });
  });

  test("scopes grants, events, and terminal evidence to one actor and connection", async () => {
    const store = new InMemoryConcurrentRuntimeStore();
    const runnable: string[] = [];
    const service = new BrowserBrokerService({
      store,
      allowedOrigins: ["https://example.com"],
      onRunRunnable: (_context, runId) => {
        runnable.push(runId);
      },
    });
    const context = runtimeContext({ conversationId: "conv-xyz" });
    const otherActor = runtimeContext({
      userId: "user-456",
      actorId: "actor-456",
      conversationId: "conv-xyz",
    });
    const accepted = await store.acceptMessage(context, {
      conversationId: "conv-xyz",
      content: "Open a browser",
    });
    const connection = await connect(service, context);
    await store.setBrowserAccessGrant(context, {
      conversationId: "conv-xyz",
      clientInstallationId: "client-123",
      enabled: true,
    });
    await expect(
      store.getBrowserAccessGrant(otherActor, "conv-xyz"),
    ).rejects.toMatchObject({ code: "conversation_not_found" });

    const leaseOwner = "worker-123";
    expect(
      await store.claimRun(
        context,
        accepted.run.id,
        leaseOwner,
        Date.now() + 30_000,
      ),
    ).not.toBeNull();
    const dispatched = await service.dispatch(context, {
      conversationId: "conv-xyz",
      runId: accepted.run.id,
      toolUseId: "tool-123",
      operation: { kind: "open_session", initialUrl: "https://example.com" },
      leaseOwner,
      providerContent: [],
    });
    expect((await store.getRun(context, accepted.run.id))?.status).toBe(
      "waiting_for_browser",
    );

    const events = await store.listBrowserEvents(context, {
      clientInstallationId: "client-123",
      connectionId: connection.connectionId,
      connectionGeneration: connection.connectionGeneration,
      connectionTokenHash: hashBrowserConnectionToken(connection.resumeToken),
      afterSeq: 0,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.event.scope).toMatchObject({
      organizationId: "org-abc",
      assistantId: "assistant-123",
      userId: "user-123",
      actorId: "actor-123",
      conversationId: "conv-xyz",
      clientInstallationId: "client-123",
      connectionId: connection.connectionId,
      connectionGeneration: connection.connectionGeneration,
    });

    const result: BrowserBrokerResultRequest = {
      protocolVersion: BROWSER_BROKER_PROTOCOL_VERSION,
      actionId: dispatched.action.actionId,
      operationHash: dispatched.action.operationHash,
      connectionId: connection.connectionId,
      connectionGeneration: connection.connectionGeneration,
      resultHash: "a".repeat(64),
      state: "succeeded",
      output: {
        kind: "session",
        browserSessionId: "browser-session-123",
        tabLeaseId: "tab-lease-123",
        documentEpoch: 0,
      },
    };
    await expect(
      service.recordResult(
        context,
        result,
        "invalid-token-value-that-is-long-enough",
      ),
    ).rejects.toMatchObject({ code: "stale_connection" });
    await expect(
      service.recordResult(context, result, connection.resumeToken),
    ).resolves.toMatchObject({ accepted: true, canonicalState: "succeeded" });
    expect(runnable).toEqual([accepted.run.id]);
    expect((await store.getRun(context, accepted.run.id))?.status).toBe(
      "queued",
    );
    expect(await store.listRunSteps(context, accepted.run.id)).toHaveLength(2);

    await expect(
      service.recordResult(context, result, connection.resumeToken),
    ).resolves.toMatchObject({ accepted: true, canonicalState: "succeeded" });
    await expect(
      service.recordResult(
        context,
        { ...result, resultHash: "b".repeat(64) },
        connection.resumeToken,
      ),
    ).rejects.toMatchObject({ code: "action_conflict" });
  });
});
