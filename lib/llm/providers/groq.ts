import "server-only";

import { groqClient, GROQ_MODEL } from "@/lib/ai";
import type { LlmGenerateInput, LlmProviderAdapter, LlmProviderResult } from "@/lib/llm/types";
import { extractJsonFromText, getInputMessages, getJsonMessages } from "@/lib/llm/utils";

async function chat(input: LlmGenerateInput, jsonMode: boolean): Promise<LlmProviderResult<string>> {
  if (!groqClient) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const completion = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    temperature: input.temperature ?? (jsonMode ? 0.2 : 0.4),
    max_completion_tokens: input.maxTokens ?? (jsonMode ? 900 : 700),
    response_format: jsonMode ? { type: "json_object" } : undefined,
    messages: jsonMode ? getJsonMessages(input) : getInputMessages(input),
  });

  const output = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!output) {
    throw new Error("Groq returned an empty response.");
  }

  return {
    provider: "groq",
    model: completion.model || GROQ_MODEL,
    output,
  };
}

export const groqProvider: LlmProviderAdapter = {
  name: "groq",
  getModel: () => GROQ_MODEL,
  isConfigured: () => Boolean(process.env.GROQ_API_KEY && groqClient),
  generateText: (input) => chat(input, false),
  generateJson: async (input) => {
    const result = await chat(input, true);
    return { ...result, output: extractJsonFromText(result.output) };
  },
};
