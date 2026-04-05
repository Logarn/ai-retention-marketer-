import { groqClient, GROQ_MODEL } from "@/lib/ai";

export const GROQ_RETRY_ATTEMPTS = 3;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  const directStatus = record.status;
  if (typeof directStatus === "number") return directStatus;
  const response = record.response as Record<string, unknown> | undefined;
  if (response && typeof response.status === "number") return response.status;
  const nestedError = record.error as Record<string, unknown> | undefined;
  if (nestedError && typeof nestedError.status === "number") return nestedError.status;
  return undefined;
}

export async function callGroqJson(messages: Array<{ role: "system" | "user"; content: string }>) {
  if (!groqClient) throw new Error("GROQ_API_KEY is not configured.");

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= GROQ_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await groqClient.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_completion_tokens: 1400,
        response_format: { type: "json_object" },
        messages,
      });
    } catch (error) {
      lastError = error;
      const status = getErrorStatusCode(error);
      const retryable = status === 413 || status === 429;
      if (!retryable || attempt === GROQ_RETRY_ATTEMPTS) break;
      const delayMs = 2000 * 2 ** (attempt - 1);
      await wait(delayMs);
    }
  }
  throw lastError ?? new Error("Groq call failed after retries.");
}

export const IDENTITY_SYSTEM_PROMPT = `You are a brand analyst. Analyze the website content and return ONLY valid JSON with these fields:
{
  "brandName": "",
  "tagline": "",
  "industry": "",
  "niche": "",
  "brandStory": "",
  "usp": "",
  "missionStatement": "",
  "targetDemographics": "",
  "targetPsychographics": "",
  "audiencePainPoints": "",
  "audienceDesires": "",
  "productsSummary": "",
  "priceRange": "",
  "competitivePositioning": ""
}`;

export const VOICE_SYSTEM_PROMPT = `You are a brand voice analyst. Analyze the website content and return ONLY valid JSON with these fields:
{
  "voiceFormalCasual": 0,
  "voiceSeriousPlayful": 0,
  "voiceReservedEnthusiastic": 0,
  "voiceTechnicalSimple": 0,
  "voiceAuthoritativeApproachable": 0,
  "voiceMinimalDescriptive": 0,
  "voiceLuxuryAccessible": 0,
  "voiceEdgySafe": 0,
  "voiceEmotionalRational": 0,
  "voiceTrendyTimeless": 0,
  "voiceDescription": "",
  "suggestedDos": [],
  "suggestedDonts": [],
  "suggestedCTAs": [],
  "suggestedPreferredPhrases": [],
  "suggestedBannedPhrases": [],
  "greetingStyle": "formal|friendly|casual|none",
  "signOffStyle": "warm|professional|casual|brand",
  "emojiUsage": "never|sparingly|often",
  "preferredLength": "short|medium|long",
  "discountPhilosophy": "never|rarely|strategically|frequently"
}`;
