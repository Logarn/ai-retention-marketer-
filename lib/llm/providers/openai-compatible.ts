import "server-only";

import type {
  LlmGenerateInput,
  LlmProviderAdapter,
  LlmProviderName,
  LlmProviderResult,
} from "@/lib/llm/types";
import {
  extractJsonFromText,
  extractOpenAiMessageText,
  getInputMessages,
  getJsonMessages,
  parseJsonResponse,
} from "@/lib/llm/utils";

type OpenAiCompatibleConfig = {
  name: Exclude<LlmProviderName, "gemini" | "cohere" | "edenai" | "groq" | "mock">;
  endpoint: string;
  apiKeyEnv: string;
  modelEnv: string;
  defaultModel: string;
  extraHeaders?: Record<string, string>;
};

export function createOpenAiCompatibleAdapter(config: OpenAiCompatibleConfig): LlmProviderAdapter {
  function getApiKey() {
    return process.env[config.apiKeyEnv]?.trim() ?? "";
  }

  function getModel() {
    return process.env[config.modelEnv]?.trim() || config.defaultModel;
  }

  async function chat(input: LlmGenerateInput, jsonMode: boolean): Promise<LlmProviderResult<string>> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(`${config.apiKeyEnv} is not configured.`);
    }

    const model = getModel();
    const body: Record<string, unknown> = {
      model,
      messages: jsonMode ? getJsonMessages(input) : getInputMessages(input),
      temperature: input.temperature ?? (jsonMode ? 0.2 : 0.4),
      max_tokens: input.maxTokens ?? (jsonMode ? 900 : 700),
    };

    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...config.extraHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = new Error(`${config.name} request failed.`);
      (error as { status?: number }).status = response.status;
      throw error;
    }

    const payload = await parseJsonResponse(response);
    const output = extractOpenAiMessageText(payload);
    if (!output) {
      throw new Error(`${config.name} returned an empty response.`);
    }

    const responseModel =
      payload && typeof payload === "object" && typeof (payload as { model?: unknown }).model === "string"
        ? (payload as { model: string }).model
        : model;

    return { provider: config.name, model: responseModel, output };
  }

  return {
    name: config.name,
    getModel,
    isConfigured: () => Boolean(getApiKey()),
    generateText: (input) => chat(input, false),
    generateJson: async (input) => {
      const result = await chat(input, true);
      return { ...result, output: extractJsonFromText(result.output) };
    },
  };
}
