import "server-only";

import { createOpenAiCompatibleAdapter } from "@/lib/llm/providers/openai-compatible";

export const mistralProvider = createOpenAiCompatibleAdapter({
  name: "mistral",
  endpoint: "https://api.mistral.ai/v1/chat/completions",
  apiKeyEnv: "MISTRAL_API_KEY",
  modelEnv: "MISTRAL_DEFAULT_MODEL",
  defaultModel: "mistral-large-latest",
});
