import "server-only";

import { createOpenAiCompatibleAdapter } from "@/lib/llm/providers/openai-compatible";

export const openRouterProvider = createOpenAiCompatibleAdapter({
  name: "openrouter",
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  apiKeyEnv: "OPENROUTER_API_KEY",
  modelEnv: "OPENROUTER_DEFAULT_MODEL",
  defaultModel: "openai/gpt-4o-mini",
  extraHeaders: {
    "X-Title": "Worklin AI",
  },
});
