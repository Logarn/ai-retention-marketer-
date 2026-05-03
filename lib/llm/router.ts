import "server-only";

import { LLM_PROVIDER_REGISTRY } from "@/lib/llm/providers/registry";
import {
  LlmRouterError,
  type LlmGenerateInput,
  type LlmProviderAttempt,
  type LlmProviderName,
  type LlmRouterResult,
} from "@/lib/llm/types";
import { getEnvBoolean, getEnvList, normalizeProviderName, safeErrorReason } from "@/lib/llm/utils";

const BUILT_IN_ORDER: LlmProviderName[] = [
  "groq",
  "openrouter",
  "gemini",
  "deepseek",
  "mistral",
  "cohere",
  "edenai",
];

function uniqueProviders(providers: LlmProviderName[]) {
  return providers.filter((provider, index) => providers.indexOf(provider) === index);
}

function configuredDefaultProvider() {
  return normalizeProviderName(process.env.LLM_PROVIDER_DEFAULT) ?? "groq";
}

function configuredFallbackOrder() {
  const envProviders = getEnvList("LLM_PROVIDER_FALLBACK_ORDER")
    .map((item) => normalizeProviderName(item))
    .filter((item): item is LlmProviderName => Boolean(item));
  return envProviders.length ? envProviders : BUILT_IN_ORDER;
}

function shouldUseMockFallback(explicitProvider?: LlmProviderName) {
  return explicitProvider === "mock" || getEnvBoolean("LLM_USE_MOCK_FALLBACK", false);
}

export function getProviderAttemptOrder(explicitProvider?: LlmProviderName): LlmProviderName[] {
  const defaultProvider = configuredDefaultProvider();
  const ordered = explicitProvider
    ? [explicitProvider, defaultProvider, ...configuredFallbackOrder()]
    : [defaultProvider, ...configuredFallbackOrder()];
  return uniqueProviders(ordered);
}

async function generateWithRouter<T>(
  input: LlmGenerateInput & { provider?: LlmProviderName },
  mode: "text" | "json",
): Promise<LlmRouterResult<T>> {
  const attempts: LlmProviderAttempt[] = [];
  const explicitProvider = input.provider;
  const allowMock = shouldUseMockFallback(explicitProvider);
  const providerOrder = getProviderAttemptOrder(explicitProvider);

  for (const providerName of providerOrder) {
    if (providerName === "mock" && !allowMock) {
      attempts.push({ provider: providerName, skipped: true, reason: "mock_fallback_disabled" });
      continue;
    }

    const provider = LLM_PROVIDER_REGISTRY[providerName];
    if (!provider.isConfigured()) {
      attempts.push({ provider: providerName, skipped: true, reason: "missing_api_key" });
      continue;
    }

    try {
      const result =
        mode === "json" ? await provider.generateJson(input) : await provider.generateText(input);
      const firstTriedProvider = attempts.find((attempt) => !attempt.skipped)?.provider ?? providerOrder[0];
      return {
        ...result,
        output: result.output as T,
        fallbackUsed: providerName !== firstTriedProvider || attempts.length > 0,
        attempts,
      };
    } catch (error) {
      attempts.push({ provider: providerName, skipped: false, ...safeErrorReason(error) });
    }
  }

  if (allowMock) {
    const result =
      mode === "json"
        ? await LLM_PROVIDER_REGISTRY.mock.generateJson(input)
        : await LLM_PROVIDER_REGISTRY.mock.generateText(input);
    return {
      ...result,
      output: result.output as T,
      fallbackUsed: true,
      attempts,
    };
  }

  throw new LlmRouterError("No configured LLM provider succeeded.", attempts);
}

export function generateText(input: LlmGenerateInput & { provider?: LlmProviderName }) {
  return generateWithRouter<string>(input, "text");
}

export function generateJson(input: LlmGenerateInput & { provider?: LlmProviderName }) {
  return generateWithRouter<unknown>(input, "json");
}

export const generateStructured = generateJson;
