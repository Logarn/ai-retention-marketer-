/**
 * Extracts essential SOUL sections for Groq token budget (full SOUL.md is large).
 * Sections: The Short Version, How I Communicate, What I Sound Like, My Boundaries
 */
export function extractEssentialSoulSections(fullMarkdown: string): string {
  const titles = ["The Short Version", "How I Communicate", "What I Sound Like", "My Boundaries"];
  const blocks: string[] = [];
  for (const title of titles) {
    const header = `## ${title}`;
    const idx = fullMarkdown.indexOf(header);
    if (idx === -1) continue;
    const afterHeader = fullMarkdown.slice(idx + header.length);
    const nextSection = afterHeader.search(/\n## /);
    const chunk = nextSection === -1 ? afterHeader : afterHeader.slice(0, nextSection);
    blocks.push(`${header}${chunk}`.trim());
  }
  return blocks.join("\n\n---\n\n");
}

const MAX_SYSTEM_CHARS = 4000;

export function buildAgentSystemPrompt(soulEssential: string, operationalInstructions: string): string {
  const op = operationalInstructions.trim();
  const sep = "\n\n---\n\n## Operational instructions (follow every turn)\n\n";
  let soul = soulEssential.trim();

  // Reserve space for operational block + hard cap
  const maxSoul = Math.max(0, MAX_SYSTEM_CHARS - op.length - sep.length - 80);
  if (soul.length > maxSoul) {
    soul = soul.slice(0, maxSoul).trimEnd() + "\n\n[…SOUL truncated]";
  }

  const core = soul ? `${soul}${sep}${op}` : op;

  if (core.length <= MAX_SYSTEM_CHARS) return core;

  const marker = "\n\n[…system prompt truncated for Groq]";
  return core.slice(0, MAX_SYSTEM_CHARS - marker.length) + marker;
}
