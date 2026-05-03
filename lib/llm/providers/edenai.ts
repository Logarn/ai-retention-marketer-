import "server-only";

import type { LlmGenerateInput, LlmProviderAdapter, LlmProviderResult } from "@/lib/llm/types";
import {
  extractJsonFromText,
  extractOpenAiMessageText,
  getInputMessages,
  getJsonMessages,
  parseEdenAiSseText,
} from "@/lib/llm/utils";

function getApiKey() {
  return process.env.EDENAI_API_KEY?.trim() ?? "";
}

function getModel() {
  const provider = process.env.EDENAI_DEFAULT_PROVIDER?.trim() || "openai";
  const model = process.env.EDENAI_DEFAULT_MODEL?.trim() || "gpt-4o-mini";
  return model.includes("/") ? model : `${provider}/${model}`;
}

async function parseEdenAiResponse(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (contentType.includes("text/event-stream") || text.trim().startsWith("data:")) {
    return parseEdenAiSseText(text);
  }

  try {
    return extractOpenAiMessageText(JSON.parse(text));
  } catch {
    return "";
  }
}

async function generate(input: LlmGenerateInput, jsonMode: boolean): Promise<LlmProviderResult<string>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("EDENAI_API_KEY is not configured.");
  }

  const messages = jsonMode ? getJsonMessages(input) : getInputMessages(input);

  const model = getModel();
  const response = await fetch("https://api.edenai.run/v3/llm/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: input.temperature ?? (jsonMode ? 0.2 : 0.4),
      max_tokens: input.maxTokens ?? (jsonMode ? 900 : 700),
      response_format: jsonMode ? { type: "json_object" } : undefined,
    }),
  });

  if (!response.ok) {
    const error = new Error("Eden AI request failed.");
    (error as { status?: number }).status = response.status;
    throw error;
  }

  const output = (await parseEdenAiResponse(response)).trim();
  if (!output) {
    throw new Error("Eden AI returned an empty response.");
  }

  return { provider: "edenai", model, output };
}

export const edenAiProvider: LlmProviderAdapter = {
  name: "edenai",
  getModel,
  isConfigured: () => Boolean(getApiKey()),
  generateText: (input) => generate(input, false),
  generateJson: async (input) => {
    const result = await generate(input, true);
    return { ...result, output: extractJsonFromText(result.output) };
  },
};
