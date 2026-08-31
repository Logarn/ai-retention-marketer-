import { describe, expect, test } from "bun:test";

import { resolveBrowserAccessContext } from "../browser-access-context.js";

const CONVERSATION_ID = "71bbed81-4593-4512-a537-f6e7b1ed28ec";

describe("resolveBrowserAccessContext", () => {
  test("accepts a persisted conversation on the canonical production app", () => {
    expect(
      resolveBrowserAccessContext(
        `https://worklin-ai.vercel.app/assistant/conversations/${CONVERSATION_ID}`,
        "production",
      ),
    ).toEqual({ available: true, conversationId: CONVERSATION_ID });
  });

  test("rejects drafts, untrusted origins, and nested conversation routes", () => {
    expect(
      resolveBrowserAccessContext(
        "https://worklin-ai.vercel.app/assistant/conversations/draft-example",
        "production",
      ).available,
    ).toBe(false);
    expect(
      resolveBrowserAccessContext(
        `https://example.com/assistant/conversations/${CONVERSATION_ID}`,
        "production",
      ).available,
    ).toBe(false);
    expect(
      resolveBrowserAccessContext(
        `https://worklin-ai.vercel.app/assistant/conversations/${CONVERSATION_ID}/inspect`,
        "production",
      ).available,
    ).toBe(false);
  });

  test("uses the environment-specific web origin", () => {
    expect(
      resolveBrowserAccessContext(
        `http://localhost:3000/assistant/conversations/${CONVERSATION_ID}`,
        "local",
      ),
    ).toEqual({ available: true, conversationId: CONVERSATION_ID });
    expect(
      resolveBrowserAccessContext(
        `https://worklin-ai.vercel.app/assistant/conversations/${CONVERSATION_ID}`,
        "local",
      ).available,
    ).toBe(false);
  });
});
