import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "../../profile/store";

export const maxDuration = 10;

const bodySchema = z.object({
  documentId: z.string().min(1),
  sections: z.array(z.enum(["rules", "ctas", "phrases"])).min(1),
});

type BrandInsights = {
  dosFound?: unknown;
  dontsFound?: unknown;
  ctasFound?: unknown;
  phrasesPreferred?: unknown;
  phrasesBanned?: unknown;
};

function asStringList(value: unknown, max = 40): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Expected { documentId: string, sections: ('rules'|'ctas'|'phrases')[] }" },
        { status: 400 },
      );
    }

    const { documentId, sections } = parsed.data;
    const sectionSet = new Set(sections);

    const doc = await prisma.brandDocument.findFirst({
      where: { id: documentId, storeId: DEFAULT_STORE_ID },
    });
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (doc.status !== "completed" || !doc.extractedRules) {
      return NextResponse.json(
        { error: "Document has no completed analysis to apply", status: doc.status },
        { status: 409 },
      );
    }

    let insights: BrandInsights;
    try {
      insights = JSON.parse(doc.extractedRules) as BrandInsights;
    } catch {
      return NextResponse.json({ error: "Stored extractedRules JSON is invalid" }, { status: 422 });
    }

    const dos = asStringList(insights.dosFound);
    const donts = asStringList(insights.dontsFound);
    const ctas = asStringList(insights.ctasFound);
    const preferred = asStringList(insights.phrasesPreferred);
    const banned = asStringList(insights.phrasesBanned);

    let rulesAdded = 0;
    let ctasAdded = 0;
    let phrasesAdded = 0;

    if (sectionSet.has("rules") && (dos.length > 0 || donts.length > 0)) {
      const existing = await prisma.brandRule.findMany({ where: { storeId: DEFAULT_STORE_ID } });
      const existingSet = new Set(
        existing.map((r) => `${r.type.toLowerCase()}::${r.rule.trim().toLowerCase()}`),
      );
      const rows: Array<{ storeId: string; rule: string; type: string; priority: string }> = [];
      for (const rule of dos) {
        const key = `do::${rule.toLowerCase()}`;
        if (existingSet.has(key)) continue;
        rows.push({ storeId: DEFAULT_STORE_ID, type: "do", rule, priority: "important" });
        existingSet.add(key);
      }
      for (const rule of donts) {
        const key = `dont::${rule.toLowerCase()}`;
        if (existingSet.has(key)) continue;
        rows.push({ storeId: DEFAULT_STORE_ID, type: "dont", rule, priority: "important" });
        existingSet.add(key);
      }
      if (rows.length) {
        await prisma.brandRule.createMany({ data: rows });
        rulesAdded = rows.length;
      }
    }

    if (sectionSet.has("ctas") && ctas.length > 0) {
      const existing = await prisma.brandCTA.findMany({ where: { storeId: DEFAULT_STORE_ID } });
      const existingSet = new Set(existing.map((c) => c.text.trim().toLowerCase()));
      const rows = ctas
        .filter((t) => {
          const k = t.toLowerCase();
          if (existingSet.has(k)) return false;
          existingSet.add(k);
          return true;
        })
        .map((text) => ({ storeId: DEFAULT_STORE_ID, text, isPreferred: true }));
      if (rows.length) {
        await prisma.brandCTA.createMany({ data: rows });
        ctasAdded = rows.length;
      }
    }

    if (sectionSet.has("phrases") && (preferred.length > 0 || banned.length > 0)) {
      const existing = await prisma.brandPhrase.findMany({ where: { storeId: DEFAULT_STORE_ID } });
      const existingSet = new Set(
        existing.map((p) => `${p.type.toLowerCase()}::${p.phrase.trim().toLowerCase()}`),
      );
      const rows: Array<{ storeId: string; phrase: string; type: string }> = [];
      for (const phrase of preferred) {
        const key = `preferred::${phrase.toLowerCase()}`;
        if (existingSet.has(key)) continue;
        rows.push({ storeId: DEFAULT_STORE_ID, phrase, type: "preferred" });
        existingSet.add(key);
      }
      for (const phrase of banned) {
        const key = `banned::${phrase.toLowerCase()}`;
        if (existingSet.has(key)) continue;
        rows.push({ storeId: DEFAULT_STORE_ID, phrase, type: "banned" });
        existingSet.add(key);
      }
      if (rows.length) {
        await prisma.brandPhrase.createMany({ data: rows });
        phrasesAdded = rows.length;
      }
    }

    if (rulesAdded > 0 || ctasAdded > 0 || phrasesAdded > 0) {
      await prisma.brandDocument.update({
        where: { id: doc.id },
        data: { appliedToProfile: true },
      });
    }

    return NextResponse.json({
      success: true,
      counts: {
        rulesAdded,
        ctasAdded,
        phrasesAdded,
      },
    });
  } catch (error) {
    console.error("[documents/apply]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Apply failed" },
      { status: 500 },
    );
  }
}
