import { IDENTITY_SYSTEM_PROMPT, VOICE_SYSTEM_PROMPT, callGroqJson } from "@/lib/brain/analyze-store-groq";
import {
  normalizeFullAnalysis,
  normalizeIdentityOnly,
  normalizeVoiceOnly,
  parseJsonObject,
} from "@/lib/brain/analyze-store-normalize";
import { applyFullStoreAnalysis } from "@/lib/brain/apply-store-analysis";
import { scrapeHomepagePlainText } from "@/lib/brain/firecrawl-homepage";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runStoreAnalysisPipeline(url: string) {
  const { content, pageUrl } = await scrapeHomepagePlainText(url);

  await delay(1500);

  const idCompletion = await callGroqJson([
    { role: "system", content: IDENTITY_SYSTEM_PROMPT },
    { role: "user", content: `Homepage plain text (truncated):\n${content}` },
  ]);
  const idRaw = idCompletion.choices[0]?.message?.content?.trim() ?? "";
  const idParsed = idRaw ? parseJsonObject(idRaw) : null;
  if (!idParsed) {
    throw new Error("Identity extraction returned invalid JSON");
  }
  const identityPartial = normalizeIdentityOnly(idParsed);

  await delay(1500);

  const voiceCompletion = await callGroqJson([
    { role: "system", content: VOICE_SYSTEM_PROMPT },
    { role: "user", content: `Homepage plain text (truncated):\n${content}` },
  ]);
  const voiceRaw = voiceCompletion.choices[0]?.message?.content?.trim() ?? "";
  const voiceParsed = voiceRaw ? parseJsonObject(voiceRaw) : null;
  if (!voiceParsed) {
    throw new Error("Voice extraction returned invalid JSON");
  }
  const voicePartial = normalizeVoiceOnly(voiceParsed);

  const analysisData = normalizeFullAnalysis({
    ...identityPartial,
    ...voicePartial,
  });

  const applied = await applyFullStoreAnalysis(analysisData, { analyzedUrl: pageUrl });

  return {
    analysisData,
    pageUrl,
    applied,
  };
}
