import { describe, expect, test } from "bun:test";

import {
  extensionCorsHeaders,
  handleExtensionPreflight,
  resolveExtensionOrigin,
} from "./cors.js";

const EXTENSION_ORIGIN = "chrome-extension://gfcldmjjhcginboeldmknclbjilohcbn";

describe("Chrome extension CORS", () => {
  test("allows the browser broker method and credential headers", () => {
    const headers = extensionCorsHeaders(EXTENSION_ORIGIN);
    expect(headers["Access-Control-Allow-Methods"]).toContain("PUT");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Last-Event-ID");
    expect(headers["Access-Control-Allow-Headers"]).toContain(
      "X-Worklin-Browser-Connection-Token",
    );
    expect(headers["Access-Control-Allow-Headers"]).toContain(
      "X-Session-Token",
    );
  });

  test("reflects only a registered extension origin", () => {
    expect(
      resolveExtensionOrigin(
        new Request("http://127.0.0.1/v1/browser-broker/connections", {
          headers: { Origin: EXTENSION_ORIGIN },
        }),
      ),
    ).toBe(EXTENSION_ORIGIN);
    expect(
      resolveExtensionOrigin(
        new Request("http://127.0.0.1/v1/browser-broker/connections", {
          headers: { Origin: "chrome-extension://untrusted-extension" },
        }),
      ),
    ).toBeNull();
    expect(handleExtensionPreflight(EXTENSION_ORIGIN).status).toBe(204);
  });
});
