import "server-only";

import { LLM_PROVIDER_NAMES, type LlmMessage, type LlmProviderName } from "@/lib/llm/types";

export function normalizeProviderName(value: string | undefined | null): LlmProviderName | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "grok") return "groq";
  return LLM_PROVIDER_NAMES.includes(normalized as LlmProviderName)
    ? (normalized as LlmProviderName)
    : null;
}

export function getEnvBoolean(name: string, defaultValue = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value);
}

export function getEnvList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getInputMessages(input: { prompt?: string; messages?: LlmMessage[] }): LlmMessage[] {
  if (input.messages?.length) {
    return [...input.messages];
  }
  return [{ role: "user", content: input.prompt?.trim() || "Say hello from Worklin." }];
}

export function getJsonMessages(input: { prompt?: string; messages?: LlmMessage[] }): LlmMessage[] {
  return [...getInputMessages(input), { role: "user", content: "Return valid JSON only." }];
}

export function promptFromMessages(messages: LlmMessage[]): string {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
}

export function extractOpenAiMessageText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0] as { message?: { content?: unknown }; delta?: { content?: unknown } } | undefined;
  const content = first?.message?.content ?? first?.delta?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string") {
          return (item as { text: string }).text;
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

export function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Provider returned an empty JSON response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const objectStart = trimmed.indexOf("{");
    const objectEnd = trimmed.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
    }

    const arrayStart = trimmed.indexOf("[");
    const arrayEnd = trimmed.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
    }
  }

  throw new Error("Provider returned invalid JSON.");
}

export function safeErrorReason(error: unknown): { reason: string; status?: number } {
  if (!error || typeof error !== "object") {
    return { reason: "provider_error" };
  }

  const record = error as Record<string, unknown>;
  const directStatus = typeof record.status === "number" ? record.status : undefined;
  const response = record.response as Record<string, unknown> | undefined;
  const responseStatus = response && typeof response.status === "number" ? response.status : undefined;
  const status = directStatus ?? responseStatus;

  if (status === 401 || status === 403) return { reason: "auth_error", status };
  if (status === 402) return { reason: "credits_error", status };
  if (status === 408 || status === 409 || status === 425 || status === 429) {
    return { reason: "rate_or_retryable_error", status };
  }
  if (status && status >= 500) return { reason: "provider_unavailable", status };
  return { reason: "provider_error", status };
}

export async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Provider returned non-JSON response with status ${response.status}.`);
  }
}

export function parseEdenAiSseText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .filter((line) => line && line !== "[DONE]")
    .map((line) => {
      try {
        const payload = JSON.parse(line) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
        };
        return payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content ?? "";
      } catch {
        return "";
      }
    })
    .join("")
    .trim();
}
