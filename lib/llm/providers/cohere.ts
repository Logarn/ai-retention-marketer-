import "server-only";

import type { LlmGenerateInput, LlmProviderAdapter, LlmProviderResult } from "@/lib/llm/types";
import { extractJsonFromText, getInputMessages, getJsonMessages } from "@/lib/llm/utils";

function getApiKey() {
  return process.env.COHERE_API_KEY?.trim() ?? "";
}

function getModel() {
  return process.env.COHERE_DEFAULT_MODEL?.trim() || "command-a-03-2025";
}

function extractCohereText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const content = (payload as { message?: { content?: unknown } }).message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
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

async function generate(input: LlmGenerateInput, jsonMode: boolean): Promise<LlmProviderResult<string>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("COHERE_API_KEY is not configured.");
  }

  const messages = jsonMode ? getJsonMessages(input) : getInputMessages(input);

  const model = getModel();
  const response = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: input.temperature ?? (jsonMode ? 0.2 : 0.4),
      max_tokens: input.maxTokens ?? (jsonMode ? 900 : 700),
      response_format: jsonMode ? { type: "json_object" } : undefined,
    }),
  });

  if (!response.ok) {
    const error = new Error("Cohere request failed.");
    (error as { status?: number }).status = response.status;
    throw error;
  }

  const payload = await response.json();
  const output = extractCohereText(payload);
  if (!output) {
    throw new Error("Cohere returned an empty response.");
  }

  return { provider: "cohere", model, output };
}

export const cohereProvider: LlmProviderAdapter = {
  name: "cohere",
  getModel,
  isConfigured: () => Boolean(getApiKey()),
  generateText: (input) => generate(input, false),
  generateJson: async (input) => {
    const result = await generate(input, true);
    return { ...result, output: extractJsonFromText(result.output) };
  },
};
