import { beforeEach, describe, expect, test } from "bun:test";

import type {
  BrowserBrokerCommand,
  BrowserBrokerReceiptRequest,
  BrowserBrokerResultRequest,
} from "@vellumai/service-contracts/browser-broker";

import type { CdpProxy } from "../cdp-proxy.js";
import {
  createConcurrentBrowserDispatcher,
  publicHttpsOrigin,
} from "../concurrent-browser-dispatcher.js";

const JOURNAL_KEY = "vellum.concurrentBrowser.actionJournal.v1";

function command(): BrowserBrokerCommand {
  return {
    type: "browser_broker_command",
    protocolVersion: 1,
    scope: {
      organizationId: "org-abc",
      assistantId: "assistant-123",
      userId: "user-123",
      actorId: "actor-123",
      clientInstallationId: "client-123",
      connectionId: "connection-123",
      connectionGeneration: 1,
      conversationId: "conv-xyz",
    },
    runId: "run-123",
    toolUseId: "tool-123",
    actionId: "action-123",
    sequence: 1,
    operationHash: "a".repeat(64),
    replayClass: "non_replayable",
    deadlineAt: new Date(Date.now() + 30_000).toISOString(),
    operation: { kind: "navigate", url: "https://example.com" },
  };
}

function installChromeMock(storage: Record<string, unknown>): void {
  const eventListeners = new Set<(...args: unknown[]) => void>();
  const area = {
    async get(key: string) {
      return { [key]: storage[key] };
    },
    async set(value: Record<string, unknown>) {
      Object.assign(storage, value);
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: area,
      session: area,
    },
    debugger: {
      onEvent: {
        addListener(listener: (...args: unknown[]) => void) {
          eventListeners.add(listener);
        },
        removeListener(listener: (...args: unknown[]) => void) {
          eventListeners.delete(listener);
        },
      },
    },
  };
}

function cdpProxy(sendCalls: string[]): CdpProxy {
  return {
    async attach() {},
    async detach() {},
    async send(_target, frame) {
      sendCalls.push(frame.method);
      return { id: frame.id, result: {} };
    },
    onEvent() {
      return () => undefined;
    },
    onDetach() {
      return () => undefined;
    },
    dispose() {},
  };
}

describe("concurrent browser dispatcher", () => {
  beforeEach(() => {
    installChromeMock({});
  });

  test("rejects privileged and private navigation targets", () => {
    expect(publicHttpsOrigin("https://example.com/path")).toBe(
      "https://example.com",
    );
    for (const target of [
      "http://example.com",
      "https://localhost",
      "https://127.0.0.1",
      "https://10.0.0.1",
      "https://[::1]",
      "https://service.internal",
    ]) {
      expect(() => publicHttpsOrigin(target)).toThrow();
    }
  });

  test("does not replay a mutation left executing after restart", async () => {
    const now = Date.now();
    const storage: Record<string, unknown> = {
      [JOURNAL_KEY]: {
        "action-123": {
          actionId: "action-123",
          operationHash: "a".repeat(64),
          replayClass: "non_replayable",
          state: "executing",
          updatedAt: now,
        },
      },
    };
    installChromeMock(storage);
    const receipts: BrowserBrokerReceiptRequest[] = [];
    const results: BrowserBrokerResultRequest[] = [];
    const sendCalls: string[] = [];
    const dispatcher = createConcurrentBrowserDispatcher({
      cdpProxy: cdpProxy(sendCalls),
      now: () => now,
      postReceipt: async (receipt) => {
        receipts.push(receipt);
      },
      postResult: async (result) => {
        results.push(result);
      },
    });

    await dispatcher.handle(command(), 1);

    expect(receipts).toEqual([]);
    expect(sendCalls).toEqual([]);
    expect(results.length).toBe(1);
    const [result] = results;
    if (!result || result.state !== "unknown_outcome") {
      throw new Error("Expected an unknown-outcome browser result.");
    }
    expect(result.error.code).toBe("unknown_outcome");
    dispatcher.dispose();
  });
});
