import "server-only";

import type { LlmGenerateInput, LlmMessage, LlmProviderAdapter, LlmProviderResult } from "@/lib/llm/types";
import { extractJsonFromText, getInputMessages, getJsonMessages, promptFromMessages } from "@/lib/llm/utils";

type GeminiPart = { text: string };
type GeminiContent = { role?: "user" | "model"; parts: GeminiPart[] };

function getApiKey() {
  return process.env.GEMINI_API_KEY?.trim() ?? "";
}

function getModel() {
  return process.env.GEMINI_DEFAULT_MODEL?.trim() || "gemini-2.5-flash";
}

function buildContents(messages: LlmMessage[]): { systemInstruction?: { parts: GeminiPart[] }; contents: GeminiContent[] } {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();
  const nonSystem = messages.filter((message) => message.role !== "system");

  return {
    systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
    contents: nonSystem.length
      ? nonSystem.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        }))
      : [{ role: "user", parts: [{ text: promptFromMessages(messages) }] }],
  };
}

async function generate(input: LlmGenerateInput, jsonMode: boolean): Promise<LlmProviderResult<string>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const messages = jsonMode ? getJsonMessages(input) : getInputMessages(input);

  const model = getModel();
  const { systemInstruction, contents } = buildContents(messages);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction,
        contents,
        generationConfig: {
          temperature: input.temperature ?? (jsonMode ? 0.2 : 0.4),
          maxOutputTokens: input.maxTokens ?? (jsonMode ? 900 : 700),
          responseMimeType: jsonMode ? "application/json" : "text/plain",
        },
      }),
    },
  );

  if (!response.ok) {
    const error = new Error("Gemini request failed.");
    (error as { status?: number }).status = response.status;
    throw error;
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const output =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";

  if (!output) {
    throw new Error("Gemini returned an empty response.");
  }

  return { provider: "gemini", model, output };
}

export const geminiProvider: LlmProviderAdapter = {
  name: "gemini",
  getModel,
  isConfigured: () => Boolean(getApiKey()),
  generateText: (input) => generate(input, false),
  generateJson: async (input) => {
    const result = await generate(input, true);
    return { ...result, output: extractJsonFromText(result.output) };
  },
};
