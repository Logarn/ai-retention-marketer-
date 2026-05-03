import "server-only";

import { createOpenAiCompatibleAdapter } from "@/lib/llm/providers/openai-compatible";

export const deepSeekProvider = createOpenAiCompatibleAdapter({
  name: "deepseek",
  endpoint: "https://api.deepseek.com/chat/completions",
  apiKeyEnv: "DEEPSEEK_API_KEY",
  modelEnv: "DEEPSEEK_DEFAULT_MODEL",
  defaultModel: "deepseek-chat",
});
