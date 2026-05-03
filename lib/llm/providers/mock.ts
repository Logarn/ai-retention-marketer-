import "server-only";

import type { LlmProviderAdapter } from "@/lib/llm/types";
import { getInputMessages, promptFromMessages } from "@/lib/llm/utils";

function summarizePrompt(input: Parameters<LlmProviderAdapter["generateText"]>[0]) {
  return promptFromMessages(getInputMessages(input)).slice(0, 220);
}

export const mockProvider: LlmProviderAdapter = {
  name: "mock",
  getModel: () => "worklin-mock-v0",
  isConfigured: () => true,
  generateText: async (input) => ({
    provider: "mock",
    model: "worklin-mock-v0",
    output: `Mock Worklin LLM response. Prompt: ${summarizePrompt(input)}`,
  }),
  generateJson: async (input) => ({
    provider: "mock",
    model: "worklin-mock-v0",
    output: {
      summary: "Mock Worklin LLM JSON response.",
      prompt: summarizePrompt(input),
    },
  }),
};
