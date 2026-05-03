import "server-only";

import { cohereProvider } from "@/lib/llm/providers/cohere";
import { deepSeekProvider } from "@/lib/llm/providers/deepseek";
import { edenAiProvider } from "@/lib/llm/providers/edenai";
import { geminiProvider } from "@/lib/llm/providers/gemini";
import { groqProvider } from "@/lib/llm/providers/groq";
import { mistralProvider } from "@/lib/llm/providers/mistral";
import { mockProvider } from "@/lib/llm/providers/mock";
import { openRouterProvider } from "@/lib/llm/providers/openrouter";
import type { LlmProviderAdapter, LlmProviderName } from "@/lib/llm/types";

export const LLM_PROVIDER_REGISTRY: Record<LlmProviderName, LlmProviderAdapter> = {
  groq: groqProvider,
  openrouter: openRouterProvider,
  gemini: geminiProvider,
  deepseek: deepSeekProvider,
  mistral: mistralProvider,
  cohere: cohereProvider,
  edenai: edenAiProvider,
  mock: mockProvider,
};
