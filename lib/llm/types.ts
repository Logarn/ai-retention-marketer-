import "server-only";

export const LLM_PROVIDER_NAMES = [
  "groq",
  "openrouter",
  "gemini",
  "deepseek",
  "mistral",
  "cohere",
  "edenai",
  "mock",
] as const;

export type LlmProviderName = (typeof LLM_PROVIDER_NAMES)[number];

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmGenerateInput = {
  prompt?: string;
  messages?: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type LlmProviderResult<T> = {
  provider: LlmProviderName;
  model: string;
  output: T;
};

export type LlmProviderAttempt = {
  provider: LlmProviderName;
  skipped: boolean;
  reason?: string;
  status?: number;
};

export type LlmRouterResult<T> = LlmProviderResult<T> & {
  fallbackUsed: boolean;
  attempts: LlmProviderAttempt[];
};

export type LlmProviderAdapter = {
  name: LlmProviderName;
  getModel: () => string;
  isConfigured: () => boolean;
  generateText: (input: LlmGenerateInput) => Promise<LlmProviderResult<string>>;
  generateJson: (input: LlmGenerateInput) => Promise<LlmProviderResult<unknown>>;
};

export class LlmRouterError extends Error {
  attempts: LlmProviderAttempt[];
  status: number;

  constructor(message: string, attempts: LlmProviderAttempt[], status = 503) {
    super(message);
    this.name = "LlmRouterError";
    this.attempts = attempts;
    this.status = status;
  }
}
