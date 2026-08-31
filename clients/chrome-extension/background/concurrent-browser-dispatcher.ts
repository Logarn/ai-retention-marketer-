import {
  BrowserBrokerCommandSchema,
  type BrowserBrokerCommand,
  type BrowserBrokerReceiptRequest,
  type BrowserBrokerResultRequest,
  type BrowserBrokerSuccessOutput,
} from "@vellumai/service-contracts/browser-broker";

import { createCdpProxy, type CdpProxy } from "./cdp-proxy.js";

const JOURNAL_KEY = "vellum.concurrentBrowser.actionJournal.v1";
const SESSIONS_KEY = "vellum.concurrentBrowser.sessions.v1";
const RESULTS_KEY = "vellum.concurrentBrowser.resultCache.v1";
const JOURNAL_TTL_MS = 15 * 60_000;
const SESSION_TTL_MS = 30 * 60_000;
const MAX_JOURNAL_ENTRIES = 100;

interface ElementLease {
  xpath: string;
  sensitive: boolean;
  editable: boolean;
}

interface LocalBrowserSession {
  browserSessionId: string;
  tabLeaseId: string;
  tabId: number;
  mainFrameId: string;
  conversationId: string;
  documentEpoch: number;
  snapshotId?: string;
  lastUrl?: string;
  allowedOrigin?: string;
  blockedTarget?: boolean;
  owner: "agent" | "human";
  expiresAt: number;
  elements: Record<string, ElementLease>;
}

interface JournalEntry {
  actionId: string;
  operationHash: string;
  replayClass: BrowserBrokerCommand["replayClass"];
  state: "executing" | "terminal";
  updatedAt: number;
}

interface CachedResult {
  result: BrowserBrokerResultRequest;
  updatedAt: number;
}

export interface ConcurrentBrowserDispatcherDeps {
  postReceipt(receipt: BrowserBrokerReceiptRequest): Promise<void>;
  postResult(result: BrowserBrokerResultRequest): Promise<void>;
  cdpProxy?: CdpProxy;
  now?: () => number;
  onSessionStateChange?: (state: "inactive" | "agent" | "human") => void;
}

export interface ConcurrentBrowserDispatcher {
  handle(
    command: BrowserBrokerCommand,
    receivedSequence: number,
  ): Promise<void>;
  setHumanOwner(
    browserSessionId: string | null,
    humanOwned: boolean,
  ): Promise<void>;
  dispose(): void;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function publicHttpsOrigin(rawUrl: string): string {
  const url = new URL(rawUrl);
  const rawHostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const hostname =
    rawHostname.startsWith("[") && rawHostname.endsWith("]")
      ? rawHostname.slice(1, -1)
      : rawHostname;
  const mappedIpv4 = hostname.startsWith("::ffff:")
    ? hostname.slice("::ffff:".length)
    : "";
  const blocked =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isPrivateIpv4(hostname) ||
    (mappedIpv4.length > 0 && isPrivateIpv4(mappedIpv4)) ||
    hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("fe80:") ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !hostname ||
    blocked
  ) {
    throw new Error("Browser navigation target is blocked.");
  }
  return url.origin;
}

function resultHash(
  value: Omit<BrowserBrokerResultRequest, "resultHash">,
): Promise<string> {
  return sha256(JSON.stringify(value));
}

async function loadRecord<T>(
  key: string,
  area: ChromeStorageArea = chrome.storage.local,
): Promise<Record<string, T>> {
  const value = (await area.get(key))[key];
  return value && typeof value === "object" ? (value as Record<string, T>) : {};
}

async function saveRecord<T>(
  key: string,
  value: Record<string, T>,
  area: ChromeStorageArea = chrome.storage.local,
): Promise<void> {
  await area.set({ [key]: value });
}

async function failure(
  command: BrowserBrokerCommand,
  code:
    | "deadline_expired"
    | "stale_tab_lease"
    | "stale_document"
    | "sensitive_field"
    | "blocked_target"
    | "unknown_outcome"
    | "execution_failed",
  message: string,
): Promise<BrowserBrokerResultRequest> {
  const base = {
    protocolVersion: 1 as const,
    actionId: command.actionId,
    operationHash: command.operationHash,
    connectionId: command.scope.connectionId,
    connectionGeneration: command.scope.connectionGeneration,
    state:
      code === "unknown_outcome"
        ? ("unknown_outcome" as const)
        : ("failed" as const),
    error: { code, message },
  };
  return {
    ...base,
    resultHash: await resultHash(
      base as Omit<BrowserBrokerResultRequest, "resultHash">,
    ),
  } as BrowserBrokerResultRequest;
}

async function success(
  command: BrowserBrokerCommand,
  output: BrowserBrokerSuccessOutput,
): Promise<BrowserBrokerResultRequest> {
  const base = {
    protocolVersion: 1 as const,
    actionId: command.actionId,
    operationHash: command.operationHash,
    connectionId: command.scope.connectionId,
    connectionGeneration: command.scope.connectionGeneration,
    state: "succeeded" as const,
    output,
  };
  return { ...base, resultHash: await resultHash(base) };
}

function cdpResult<T>(value: Awaited<ReturnType<CdpProxy["send"]>>): T {
  if (value.error) throw new Error(value.error.message);
  return value.result as T;
}

export function createConcurrentBrowserDispatcher(
  deps: ConcurrentBrowserDispatcherDeps,
): ConcurrentBrowserDispatcher {
  const proxy = deps.cdpProxy ?? createCdpProxy();
  const now = deps.now ?? Date.now;
  let commandId = 1;

  async function pruneJournal(): Promise<Record<string, JournalEntry>> {
    const journal = await loadRecord<JournalEntry>(JOURNAL_KEY);
    const live = Object.values(journal)
      .filter((entry) => entry.updatedAt + JOURNAL_TTL_MS > now())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_JOURNAL_ENTRIES);
    return Object.fromEntries(
      live.map((entry) => [
        entry.actionId,
        {
          actionId: entry.actionId,
          operationHash: entry.operationHash,
          replayClass: entry.replayClass,
          state: entry.state,
          updatedAt: entry.updatedAt,
        },
      ]),
    );
  }

  async function loadSession(
    command: BrowserBrokerCommand,
  ): Promise<LocalBrowserSession> {
    const sessionId = command.scope.browserSessionId;
    const tabLeaseId = command.scope.tabLeaseId;
    if (!sessionId || !tabLeaseId) {
      throw new Error("Browser session scope is missing.");
    }
    const sessions = await loadRecord<LocalBrowserSession>(SESSIONS_KEY);
    const session = sessions[sessionId];
    if (
      !session ||
      session.tabLeaseId !== tabLeaseId ||
      session.conversationId !== command.scope.conversationId ||
      session.expiresAt <= now()
    ) {
      throw new Error("Browser tab lease is stale.");
    }
    if (session.owner !== "agent") {
      throw new Error("The user currently owns this browser tab.");
    }
    if (session.blockedTarget) {
      throw new Error("Browser navigation target was blocked.");
    }
    if (
      command.expectedDocumentEpoch !== undefined &&
      command.expectedDocumentEpoch !== session.documentEpoch
    ) {
      throw new Error("Browser document epoch is stale.");
    }
    return session;
  }

  async function saveSession(session: LocalBrowserSession): Promise<void> {
    const sessions = await loadRecord<LocalBrowserSession>(SESSIONS_KEY);
    sessions[session.browserSessionId] = session;
    for (const [id, candidate] of Object.entries(sessions)) {
      if (candidate.expiresAt <= now()) delete sessions[id];
    }
    await saveRecord(SESSIONS_KEY, sessions);
  }

  async function send(
    tabId: number,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    return cdpResult(
      await proxy.send({ tabId }, { id: commandId++, method, params }),
    );
  }

  const onDebuggerEvent = (
    source: { tabId?: number },
    method: string,
    rawParams?: unknown,
  ) => {
    if (method !== "Fetch.requestPaused" || source.tabId === undefined) return;
    void (async () => {
      const params = rawParams as {
        requestId?: string;
        frameId?: string;
        request?: { url?: string };
      };
      if (!params.requestId || !params.request?.url) return;
      const sessions = await loadRecord<LocalBrowserSession>(SESSIONS_KEY);
      const session = Object.values(sessions).find(
        (candidate) => candidate.tabId === source.tabId,
      );
      if (!session) return;
      let allowed = false;
      try {
        allowed =
          params.frameId === session.mainFrameId &&
          publicHttpsOrigin(params.request.url) === session.allowedOrigin;
      } catch {
        allowed = false;
      }
      if (allowed) {
        await send(session.tabId, "Fetch.continueRequest", {
          requestId: params.requestId,
        });
        return;
      }
      session.blockedTarget = true;
      session.documentEpoch += 1;
      session.snapshotId = undefined;
      session.elements = {};
      await saveSession(session);
      await send(session.tabId, "Fetch.failRequest", {
        requestId: params.requestId,
        errorReason: "BlockedByClient",
      });
    })().catch(() => {
      // A detached tab has no remaining browser authority to recover.
    });
  };
  chrome.debugger.onEvent.addListener(onDebuggerEvent);

  async function snapshot(
    session: LocalBrowserSession,
  ): Promise<Extract<BrowserBrokerSuccessOutput, { kind: "observation" }>> {
    const expression = `(() => {
      const sensitive = (el) => {
        const joined = [el.type, el.name, el.id, el.autocomplete, el.getAttribute('aria-label')]
          .filter(Boolean).join(' ').toLowerCase();
        return el.type === 'password' || /password|passcode|one.?time|otp|credit.?card|cc-|cvv|cvc|security.?code|recovery.?code/.test(joined);
      };
      const xpath = (el) => {
        const parts = [];
        while (el && el.nodeType === 1 && el !== document.documentElement) {
          let index = 1;
          let sibling = el.previousElementSibling;
          while (sibling) { if (sibling.tagName === el.tagName) index++; sibling = sibling.previousElementSibling; }
          parts.unshift(el.tagName.toLowerCase() + '[' + index + ']');
          el = el.parentElement;
        }
        return '/html/' + parts.join('/');
      };
      const nodes = [...document.querySelectorAll('a,button,input,textarea,select,[role],[contenteditable="true"]')].slice(0, 1000);
      return {
        title: document.title.slice(0, 2048),
        url: location.href,
        content: (document.body?.innerText || '').slice(0, 100000),
        elements: nodes.map((el, index) => ({
          ref: 'e' + index,
          role: (el.getAttribute('role') || el.tagName).toLowerCase().slice(0, 128),
          name: (el.getAttribute('aria-label') || el.innerText || el.placeholder || el.name || '').trim().slice(0, 2048),
          value: sensitive(el) ? undefined : String(el.value || '').slice(0, 2048),
          disabled: Boolean(el.disabled),
          xpath: xpath(el),
          sensitive: sensitive(el),
          editable: el.matches('input,textarea,[contenteditable="true"]'),
        })),
      };
    })()`;
    const evaluated = (await send(session.tabId, "Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { value?: Record<string, unknown> } };
    const value = evaluated.result?.value as {
      title?: string;
      url?: string;
      content?: string;
      elements?: Array<{
        ref: string;
        role: string;
        name: string;
        value?: string;
        disabled?: boolean;
        xpath: string;
        sensitive: boolean;
        editable: boolean;
      }>;
    };
    if (!value?.url || !Array.isArray(value.elements)) {
      throw new Error("Browser snapshot did not return a document.");
    }
    const currentOrigin =
      value.url === "about:blank" ? undefined : publicHttpsOrigin(value.url);
    if (currentOrigin !== session.allowedOrigin) {
      session.blockedTarget = true;
      session.documentEpoch += 1;
      session.snapshotId = undefined;
      session.elements = {};
      await saveSession(session);
      throw new Error("Browser navigation target was blocked.");
    }
    if (session.lastUrl && session.lastUrl !== value.url) {
      session.documentEpoch += 1;
    }
    session.lastUrl = value.url;
    session.snapshotId = crypto.randomUUID();
    session.elements = Object.fromEntries(
      value.elements.map((element) => [
        element.ref,
        {
          xpath: element.xpath,
          sensitive: element.sensitive,
          editable: element.editable,
        },
      ]),
    );
    session.expiresAt = now() + SESSION_TTL_MS;
    await saveSession(session);
    return {
      kind: "observation",
      snapshotId: session.snapshotId,
      documentEpoch: session.documentEpoch,
      title: value.title ?? "",
      url: value.url,
      content: value.content ?? "",
      elements: value.elements.map(
        ({
          xpath: _xpath,
          sensitive: _sensitive,
          editable: _editable,
          ...element
        }) => element,
      ),
    };
  }

  function requireElement(
    session: LocalBrowserSession,
    operation: { elementRef: string; snapshotId: string },
  ): ElementLease {
    if (operation.snapshotId !== session.snapshotId) {
      throw new Error("Browser snapshot is stale.");
    }
    const element = session.elements[operation.elementRef];
    if (!element) throw new Error("Browser element reference is stale.");
    return element;
  }

  async function execute(
    command: BrowserBrokerCommand,
  ): Promise<BrowserBrokerSuccessOutput> {
    const operation = command.operation;
    if (operation.kind === "status") return { kind: "status", available: true };
    if (operation.kind === "open_session") {
      const allowedOrigin = operation.initialUrl
        ? publicHttpsOrigin(operation.initialUrl)
        : undefined;
      const tab = await chrome.tabs.create({
        url: "about:blank",
        active: true,
      });
      if (tab.id === undefined)
        throw new Error("Chrome did not create a browser tab.");
      let session: LocalBrowserSession;
      try {
        await proxy.attach({ tabId: tab.id }, "1.3");
        const frameTree = (await send(tab.id, "Page.getFrameTree")) as {
          frameTree?: { frame?: { id?: string } };
        };
        const mainFrameId = frameTree.frameTree?.frame?.id;
        if (!mainFrameId)
          throw new Error("Chrome did not return the main frame.");
        await send(tab.id, "Fetch.enable", {
          patterns: [
            {
              urlPattern: "*",
              resourceType: "Document",
              requestStage: "Request",
            },
          ],
        });
        session = {
          browserSessionId: crypto.randomUUID(),
          tabLeaseId: crypto.randomUUID(),
          tabId: tab.id,
          mainFrameId,
          conversationId: command.scope.conversationId,
          documentEpoch: 0,
          ...(allowedOrigin ? { allowedOrigin } : {}),
          owner: "agent",
          expiresAt: now() + SESSION_TTL_MS,
          elements: {},
        };
        await saveSession(session);
        if (operation.initialUrl) {
          await chrome.tabs.update(tab.id, {
            url: operation.initialUrl,
            active: true,
          });
        }
      } catch (error) {
        await proxy.detach({ tabId: tab.id }).catch(() => undefined);
        await chrome.tabs.remove(tab.id).catch(() => undefined);
        throw error;
      }
      await chrome.action.setBadgeText({ text: "AI" });
      await chrome.action.setBadgeBackgroundColor({ color: "#2563EB" });
      deps.onSessionStateChange?.("agent");
      return {
        kind: "session",
        browserSessionId: session.browserSessionId,
        tabLeaseId: session.tabLeaseId,
        documentEpoch: session.documentEpoch,
      };
    }
    const session = await loadSession(command);
    if (operation.kind === "navigate") {
      session.allowedOrigin = publicHttpsOrigin(operation.url);
      session.blockedTarget = false;
      await chrome.tabs.update(session.tabId, {
        url: operation.url,
        active: true,
      });
      session.documentEpoch += 1;
      session.snapshotId = undefined;
      session.elements = {};
      session.lastUrl = operation.url;
      await saveSession(session);
      return { kind: "action", documentEpoch: session.documentEpoch };
    }
    if (operation.kind === "snapshot") return snapshot(session);
    if (operation.kind === "screenshot") {
      const captured = (await send(session.tabId, "Page.captureScreenshot", {
        format: operation.format,
        ...(operation.quality ? { quality: operation.quality } : {}),
        captureBeyondViewport: false,
      })) as { data?: string };
      if (!captured.data)
        throw new Error("Chrome did not return a screenshot.");
      const tab = await chrome.tabs.get(session.tabId);
      return {
        kind: "screenshot",
        documentEpoch: session.documentEpoch,
        mediaType: operation.format === "jpeg" ? "image/jpeg" : "image/png",
        data: captured.data,
        width: tab.width ?? 1,
        height: tab.height ?? 1,
      };
    }
    if (operation.kind === "close_session") {
      await chrome.tabs.remove(session.tabId);
      const sessions = await loadRecord<LocalBrowserSession>(SESSIONS_KEY);
      delete sessions[session.browserSessionId];
      await saveRecord(SESSIONS_KEY, sessions);
      await chrome.action.setBadgeText({ text: "" });
      deps.onSessionStateChange?.("inactive");
      return { kind: "session_closed" };
    }
    if (operation.kind === "wait") {
      await new Promise((resolve) => setTimeout(resolve, operation.durationMs));
      return { kind: "action", documentEpoch: session.documentEpoch };
    }
    if (operation.kind === "scroll") {
      const x =
        operation.direction === "left"
          ? -operation.amount
          : operation.direction === "right"
            ? operation.amount
            : 0;
      const y =
        operation.direction === "up"
          ? -operation.amount
          : operation.direction === "down"
            ? operation.amount
            : 0;
      await send(session.tabId, "Runtime.evaluate", {
        expression: `window.scrollBy(${x}, ${y})`,
        returnByValue: true,
      });
      return { kind: "action", documentEpoch: session.documentEpoch };
    }
    if (operation.kind === "press_key") {
      await send(session.tabId, "Input.dispatchKeyEvent", {
        type: "keyDown",
        key: operation.key,
        modifiers: operation.modifiers.reduce(
          (mask, modifier) =>
            mask + { Alt: 1, Control: 2, Meta: 4, Shift: 8 }[modifier],
          0,
        ),
      });
      await send(session.tabId, "Input.dispatchKeyEvent", {
        type: "keyUp",
        key: operation.key,
      });
      return { kind: "action", documentEpoch: session.documentEpoch };
    }
    const element = requireElement(session, operation);
    if (operation.kind === "type" && (element.sensitive || !element.editable)) {
      throw new Error(
        element.sensitive
          ? "Sensitive fields require user input."
          : "Element is not editable.",
      );
    }
    const xpath = JSON.stringify(element.xpath);
    const value =
      operation.kind === "type"
        ? JSON.stringify(operation.text)
        : operation.kind === "select_option"
          ? JSON.stringify(operation.value)
          : "undefined";
    const expression = `(() => {
      const el = document.evaluate(${xpath}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (!el) throw new Error('Element no longer exists');
      if (${JSON.stringify(operation.kind)} === 'click') el.click();
      else {
        el.focus();
        el.value = ${value};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    })()`;
    await send(session.tabId, "Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return {
      kind: "action",
      documentEpoch: session.documentEpoch,
      snapshotId: session.snapshotId,
    };
  }

  async function persistTerminal(
    entry: JournalEntry,
    result: BrowserBrokerResultRequest,
  ): Promise<void> {
    const journal = await pruneJournal();
    journal[entry.actionId] = {
      actionId: entry.actionId,
      operationHash: entry.operationHash,
      replayClass: entry.replayClass,
      state: "terminal",
      updatedAt: now(),
    };
    await saveRecord(JOURNAL_KEY, journal);
    const results = await loadRecord<CachedResult>(
      RESULTS_KEY,
      chrome.storage.session,
    );
    for (const [actionId, cached] of Object.entries(results)) {
      if (cached.updatedAt + JOURNAL_TTL_MS <= now()) delete results[actionId];
    }
    results[entry.actionId] = { result, updatedAt: now() };
    await saveRecord(RESULTS_KEY, results, chrome.storage.session);
  }

  return {
    async handle(rawCommand, receivedSequence) {
      const command = BrowserBrokerCommandSchema.parse(rawCommand);
      const journal = await pruneJournal();
      const prior = journal[command.actionId];
      if (prior && prior.operationHash !== command.operationHash) {
        await deps.postResult(
          await failure(
            command,
            "unknown_outcome",
            "Action id was reused with different input.",
          ),
        );
        return;
      }
      if (prior?.state === "terminal") {
        const cached = (
          await loadRecord<CachedResult>(RESULTS_KEY, chrome.storage.session)
        )[command.actionId];
        if (cached?.updatedAt + JOURNAL_TTL_MS > now()) {
          await deps.postResult(cached.result);
          return;
        }
        if (prior.replayClass === "non_replayable") {
          const result = await failure(
            command,
            "unknown_outcome",
            "Chrome restarted after this mutation completed; inspect the page before continuing.",
          );
          await persistTerminal(prior, result);
          await deps.postResult(result);
          return;
        }
      }
      if (
        prior?.state === "executing" &&
        prior.replayClass === "non_replayable"
      ) {
        const result = await failure(
          command,
          "unknown_outcome",
          "Chrome restarted after this mutation began; inspect the page before continuing.",
        );
        await persistTerminal(prior, result);
        await deps.postResult(result);
        return;
      }
      if (Date.parse(command.deadlineAt) <= now()) {
        const entry: JournalEntry = {
          actionId: command.actionId,
          operationHash: command.operationHash,
          replayClass: command.replayClass,
          state: "executing",
          updatedAt: now(),
        };
        const result = await failure(
          command,
          "deadline_expired",
          "Browser action deadline expired.",
        );
        await persistTerminal(entry, result);
        await deps.postResult(result);
        return;
      }
      await deps.postReceipt({
        protocolVersion: 1,
        actionId: command.actionId,
        operationHash: command.operationHash,
        connectionId: command.scope.connectionId,
        connectionGeneration: command.scope.connectionGeneration,
        state: "received",
        receivedSequence,
      });
      const entry: JournalEntry = {
        actionId: command.actionId,
        operationHash: command.operationHash,
        replayClass: command.replayClass,
        state: "executing",
        updatedAt: now(),
      };
      journal[command.actionId] = entry;
      await saveRecord(JOURNAL_KEY, journal);
      await deps.postReceipt({
        protocolVersion: 1,
        actionId: command.actionId,
        operationHash: command.operationHash,
        connectionId: command.scope.connectionId,
        connectionGeneration: command.scope.connectionGeneration,
        state: "executing",
        receivedSequence,
      });
      let result: BrowserBrokerResultRequest;
      try {
        result = await success(command, await execute(command));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Browser action failed.";
        const code = /Sensitive fields/.test(message)
          ? "sensitive_field"
          : /navigation target was blocked/i.test(message)
            ? "blocked_target"
            : /snapshot|epoch/i.test(message)
              ? "stale_document"
              : /lease|session|owner/i.test(message)
                ? "stale_tab_lease"
                : "execution_failed";
        result = await failure(command, code, message);
      }
      await persistTerminal(entry, result);
      await deps.postResult(result);
    },

    async setHumanOwner(browserSessionId, humanOwned) {
      const sessions = await loadRecord<LocalBrowserSession>(SESSIONS_KEY);
      const selected = browserSessionId
        ? [sessions[browserSessionId]].filter(Boolean)
        : Object.values(sessions);
      if (selected.length === 0) return;
      if (!humanOwned) {
        for (const session of selected) {
          const tab = await chrome.tabs.get(session.tabId);
          const matchesApprovedOrigin =
            tab.url === "about:blank"
              ? session.allowedOrigin === undefined
              : Boolean(
                  tab.url &&
                  publicHttpsOrigin(tab.url) === session.allowedOrigin,
                );
          if (!matchesApprovedOrigin) {
            throw new Error(
              "Return the tab to its approved origin before resuming the assistant.",
            );
          }
        }
      }
      for (const session of selected) {
        await send(
          session.tabId,
          humanOwned ? "Fetch.disable" : "Fetch.enable",
          humanOwned
            ? {}
            : {
                patterns: [
                  {
                    urlPattern: "*",
                    resourceType: "Document",
                    requestStage: "Request",
                  },
                ],
              },
        );
        session.owner = humanOwned ? "human" : "agent";
        session.snapshotId = undefined;
        session.elements = {};
        if (!humanOwned) session.blockedTarget = false;
      }
      await saveRecord(SESSIONS_KEY, sessions);
      await chrome.action.setBadgeText({ text: humanOwned ? "YOU" : "AI" });
      await chrome.action.setBadgeBackgroundColor({
        color: humanOwned ? "#D97706" : "#2563EB",
      });
      deps.onSessionStateChange?.(humanOwned ? "human" : "agent");
    },

    dispose() {
      chrome.debugger.onEvent.removeListener(onDebuggerEvent);
      proxy.dispose();
    },
  };
}
