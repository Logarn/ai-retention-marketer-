import {
  cloudUrlsForEnvironment,
  type ExtensionEnvironment,
} from "./extension-environment.js";

const PRODUCTION_WORKLIN_WEB_ORIGIN = "https://worklin-ai.vercel.app";
const CONVERSATION_PATH = /^\/assistant\/conversations\/([^/]+)\/?$/;
const CONVERSATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BrowserAccessContext =
  | { available: true; conversationId: string }
  | { available: false; reason: string };

export function resolveBrowserAccessContext(
  rawUrl: string | undefined,
  environment: ExtensionEnvironment,
): BrowserAccessContext {
  if (!rawUrl) {
    return {
      available: false,
      reason: "Open a Worklin conversation before enabling browser access.",
    };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      available: false,
      reason: "Open a Worklin conversation before enabling browser access.",
    };
  }

  const expectedOrigin = cloudUrlsForEnvironment(environment).webBaseUrl;
  const allowedOrigins = new Set([expectedOrigin]);
  if (environment === "production") {
    allowedOrigins.add(PRODUCTION_WORKLIN_WEB_ORIGIN);
  }
  if (!allowedOrigins.has(url.origin)) {
    return {
      available: false,
      reason: "Browser access can only be enabled from the Worklin app.",
    };
  }

  const match = url.pathname.match(CONVERSATION_PATH);
  const conversationId = match?.[1];
  if (!conversationId) {
    return {
      available: false,
      reason: "Open a Worklin conversation before enabling browser access.",
    };
  }
  if (conversationId.startsWith("draft-")) {
    return {
      available: false,
      reason: "Send the first message to create this conversation first.",
    };
  }
  if (!CONVERSATION_ID.test(conversationId)) {
    return {
      available: false,
      reason: "This conversation does not have a valid server ID.",
    };
  }
  return { available: true, conversationId };
}
