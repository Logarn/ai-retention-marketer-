import { NextResponse } from "next/server";
import { z } from "zod";
import { applyFullStoreAnalysis } from "@/lib/brain/apply-store-analysis";
import type { AnalysisData } from "@/lib/brain/analyze-store-normalize";

export const maxDuration = 10;

const bodySchema = z.object({
  analysisData: z.record(z.string(), z.any()),
  /** URL that was analyzed — saved to BrandProfile.websiteUrl */
  analyzedUrl: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Expected { analysisData }" }, { status: 400 });
    }

    const analysis = parsed.data.analysisData as unknown as AnalysisData;
    const applied = await applyFullStoreAnalysis(analysis, {
      analyzedUrl: parsed.data.analyzedUrl ?? null,
    });

    return NextResponse.json({
      success: true,
      applied: {
        profileUpdated: applied.profileUpdated,
        rulesAdded: applied.rulesAdded,
        ctasAdded: applied.ctasAdded,
        phrasesAdded: applied.phrasesAdded,
      },
      createdIds: {
        rules: applied.createdRuleIds,
        ctas: applied.createdCtaIds,
        phrases: applied.createdPhraseIds,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auto-apply failed" },
      { status: 500 },
    );
  }
}
