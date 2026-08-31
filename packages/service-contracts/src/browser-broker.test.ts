import { describe, expect, test } from "bun:test";

import {
  BROWSER_BROKER_INTERFACE_ID,
  BROWSER_BROKER_PROTOCOL_VERSION,
  BrowserBrokerCommandSchema,
  BrowserBrokerConnectRequestSchema,
  BrowserBrokerOperationSchema,
  BrowserBrokerResultRequestSchema,
} from "./browser-broker.js";

const scope = {
  organizationId: "org-abc",
  assistantId: "assistant-123",
  userId: "user-123",
  actorId: "actor-123",
  clientInstallationId: "client-123",
  connectionId: "connection-123",
  connectionGeneration: 1,
  conversationId: "conv-xyz",
};

describe("browser broker contracts", () => {
  test("accepts a strict version-one connection request", () => {
    expect(
      BrowserBrokerConnectRequestSchema.parse({
        protocolVersion: BROWSER_BROKER_PROTOCOL_VERSION,
        interfaceId: BROWSER_BROKER_INTERFACE_ID,
        clientInstallationId: "client-123",
        capabilities: ["browser_broker_v1", "snapshot_v1"],
      }),
    ).toEqual({
      protocolVersion: 1,
      interfaceId: "chrome-extension",
      clientInstallationId: "client-123",
      capabilities: ["browser_broker_v1", "snapshot_v1"],
    });
  });

  test("rejects unknown versions, capabilities, and extra fields", () => {
    expect(
      BrowserBrokerConnectRequestSchema.safeParse({
        protocolVersion: 2,
        interfaceId: BROWSER_BROKER_INTERFACE_ID,
        clientInstallationId: "client-123",
        capabilities: ["raw_cdp"],
        organizationId: "org-abc",
      }).success,
    ).toBe(false);
  });

  test("exposes only the reviewed semantic operation union", () => {
    expect(
      BrowserBrokerOperationSchema.parse({
        kind: "click",
        elementRef: "element-1",
        snapshotId: "snapshot-1",
      }),
    ).toEqual({
      kind: "click",
      elementRef: "element-1",
      snapshotId: "snapshot-1",
    });
    expect(
      BrowserBrokerOperationSchema.safeParse({
        kind: "raw_cdp",
        method: "Runtime.evaluate",
      }).success,
    ).toBe(false);
  });

  test("rejects model-controlled scope and unsafe typing semantics", () => {
    expect(
      BrowserBrokerOperationSchema.safeParse({
        kind: "type",
        elementRef: "element-1",
        snapshotId: "snapshot-1",
        text: "hello",
        replace: false,
        actorId: "actor-999",
      }).success,
    ).toBe(false);
  });

  test("validates a fully scoped non-replayable command", () => {
    const command = BrowserBrokerCommandSchema.parse({
      type: "browser_broker_command",
      protocolVersion: 1,
      scope,
      runId: "run-123",
      toolUseId: "tool-use-123",
      actionId: "action-123",
      sequence: 1,
      operationHash: "a".repeat(64),
      replayClass: "non_replayable",
      expectedDocumentEpoch: 2,
      deadlineAt: "2026-08-30T12:00:00.000Z",
      operation: {
        kind: "type",
        elementRef: "element-1",
        snapshotId: "snapshot-1",
        text: "Example value",
        replace: true,
      },
    });
    expect(command.scope.actorId).toBe("actor-123");
    expect(command.operation.kind).toBe("type");
  });

  test("rejects oversized operation inputs", () => {
    expect(
      BrowserBrokerOperationSchema.safeParse({
        kind: "type",
        elementRef: "element-1",
        snapshotId: "snapshot-1",
        text: "x".repeat(10_001),
        replace: true,
      }).success,
    ).toBe(false);
  });

  test("accepts unknown outcome as an explicit terminal result", () => {
    const result = BrowserBrokerResultRequestSchema.parse({
      protocolVersion: 1,
      actionId: "action-123",
      operationHash: "a".repeat(64),
      connectionId: "connection-123",
      connectionGeneration: 1,
      resultHash: "b".repeat(64),
      state: "unknown_outcome",
      error: {
        code: "unknown_outcome",
        message: "The extension restarted after execution began.",
      },
    });
    expect(result.state).toBe("unknown_outcome");
  });
});
