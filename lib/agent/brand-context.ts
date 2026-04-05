import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "../../app/api/brain/profile/store";

export async function loadBrandContextForAgent() {
  const profile = await prisma.brandProfile.findUnique({
    where: { storeId: DEFAULT_STORE_ID },
  });
  if (!profile) return "No brand profile saved yet.";

  const [rules, ctas, phrases] = await Promise.all([
    prisma.brandRule.findMany({ where: { storeId: DEFAULT_STORE_ID }, take: 40 }),
    prisma.brandCTA.findMany({ where: { storeId: DEFAULT_STORE_ID }, take: 20 }),
    prisma.brandPhrase.findMany({ where: { storeId: DEFAULT_STORE_ID }, take: 40 }),
  ]);

  const lines: string[] = [];
  lines.push(`Brand: ${profile.brandName ?? "Unknown"}`);
  lines.push(`Industry: ${profile.industry ?? "—"} | Niche: ${profile.niche ?? "—"}`);
  lines.push(`Tagline: ${profile.tagline ?? "—"}`);
  lines.push(`Story: ${(profile.brandStory ?? "").slice(0, 500)}`);
  lines.push(`USP: ${(profile.usp ?? "").slice(0, 400)}`);
  lines.push(`Voice summary: ${(profile.voiceDescription ?? "").slice(0, 400)}`);
  lines.push(
    `Voice sliders (0-100): formalCasual=${profile.voiceFormalCasual}, seriousPlayful=${profile.voiceSeriousPlayful}, reservedEnthusiastic=${profile.voiceReservedEnthusiastic}`,
  );
  lines.push(`Email prefs: greeting=${profile.greetingStyle}, signOff=${profile.signOffStyle}, emoji=${profile.emojiUsage}`);
  lines.push(`Rules (sample): ${rules.map((r) => `${r.type}:${r.rule}`).join(" | ").slice(0, 800)}`);
  lines.push(`CTAs: ${ctas.map((c) => c.text).join(", ").slice(0, 400)}`);
  lines.push(`Phrases: ${phrases.map((p) => `${p.type}:${p.phrase}`).join(" | ").slice(0, 600)}`);
  return lines.join("\n");
}
